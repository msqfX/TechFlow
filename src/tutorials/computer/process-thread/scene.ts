import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  acquireLock,
  contextSwitch,
  createSchedulerState,
  executeStep,
  hasLostUpdate,
  runTimeSlice,
} from './model'
import type { SchedulerState } from './model'

/** 进程与线程场景:调度时间线 + 地址空间 + 共享堆 + 竞态窗口 */

const VIEW = { width: 840, height: 640 }

class ProcessThreadScene extends BaseScene<SchedulerState> {
  private cpuNode!: NetworkNode
  private timelineRow: SVGGElement | null = null
  private timelineMarks: SVGGElement[] = []
  private stackT1: SVGTextElement | null = null
  private stackT2: SVGTextElement | null = null
  private heapBox: SVGRectElement | null = null
  private heapText: SVGTextElement | null = null
  private heapAlert: SVGTextElement | null = null
  private lockChip: SVGTextElement | null = null
  private currentChip: SVGTextElement | null = null
  private live: SchedulerState | null = null
  private regT1: SVGTextElement | null = null
  private regT2: SVGTextElement | null = null

  constructor() {
    super({ id: 'process-thread', viewBox: VIEW, label: '进程线程调度与共享内存' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.cpuNode = new NetworkNode(renderer, {
      id: 'cpu', x: 420, y: 60, width: 180, height: 56, label: 'CPU(单核)', glyph: 'CORE',
    })

    // 进程 A 框(地址空间)
    renderer.el('rect', { x: 60, y: 150, width: 480, height: 300, rx: 14, class: 'tf-cpu-block' }, renderer.layerLabels)
    renderer.el('text', { x: 78, y: 176, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '进程 A 的地址空间(资源分配单位,隔离于其他进程)'
    renderer.el('text', { x: 78, y: 196, class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      '线程 = 调度单位:共享堆(下),私有栈与寄存器(上)'

    // 两个线程的私有栈/寄存器
    const t1 = renderer.el('g', {}, renderer.layerNodes)
    renderer.el('rect', { x: 90, y: 212, width: 210, height: 92, rx: 9, class: 'tf-jvm-frame' }, t1)
    renderer.el('text', { x: 104, y: 234, class: 'tf-http-title' }, t1).textContent = '线程 T1(私有)'
    this.stackT1 = renderer.el('text', { x: 104, y: 256, class: 'tf-subnet-mono' }, t1)
    this.regT1 = renderer.el('text', { x: 104, y: 282, class: 'tf-cpu-value' }, t1)
    renderer.el('text', { x: 104, y: 296, class: 'tf-label--muted' }, t1).textContent = '寄存器(切换时保存恢复)'

    const t2 = renderer.el('g', {}, renderer.layerNodes)
    renderer.el('rect', { x: 310, y: 212, width: 210, height: 92, rx: 9, class: 'tf-jvm-frame' }, t2)
    renderer.el('text', { x: 324, y: 234, class: 'tf-http-title' }, t2).textContent = '线程 T2(私有)'
    this.stackT2 = renderer.el('text', { x: 324, y: 256, class: 'tf-subnet-mono' }, t2)
    this.regT2 = renderer.el('text', { x: 324, y: 282, class: 'tf-cpu-value' }, t2)
    renderer.el('text', { x: 324, y: 296, class: 'tf-label--muted' }, t2).textContent = '寄存器(切换时保存恢复)'

    // 共享堆
    this.heapBox = renderer.el('rect', { x: 90, y: 330, width: 430, height: 96, rx: 10, class: 'tf-jvm-gen' }, renderer.layerNodes)
    renderer.el('text', { x: 106, y: 354, class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      '共享堆:两个线程都能直接读写(并发的根源)'
    renderer.el('text', { x: 106, y: 380, class: 'tf-label--accent' }, renderer.layerLabels).textContent = 'counter(共享变量)'
    this.heapText = renderer.el('text', { x: 300, y: 384, class: 'tf-ip-decimal' }, renderer.layerNodes)
    this.heapAlert = renderer.el('text', { x: 106, y: 412, class: 'tf-ip-error-text' }, renderer.layerLabels)

    this.lockChip = renderer.el('text', { x: 560, y: 380, class: 'tf-tcp-state' }, renderer.layerLabels)

    // 进程 B(隔离示意)
    renderer.el('rect', { x: 570, y: 150, width: 240, height: 300, rx: 14, class: 'tf-mem-block' }, renderer.layerLabels)
    renderer.el('text', { x: 588, y: 176, class: 'tf-label--accent' }, renderer.layerLabels).textContent = '进程 B(地址空间隔离)'
    renderer.el('text', { x: 588, y: 200, class: 'tf-label--muted' }, renderer.layerLabels).textContent = 'counter = 100'
    renderer.el('text', { x: 588, y: 224, class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      '进程 A 绝对读不到这里 ——'
    renderer.el('text', { x: 588, y: 248, class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      '进程间通信必须走 OS 通道'

    // 时间线
    new Label(renderer, { x: 60, y: 494, text: 'CPU 时间线(时间片轮转)', kind: 'accent', anchor: 'start' })
    this.timelineRow = renderer.el('g', {}, renderer.layerNodes)
    this.timelineMarks = []
    for (let i = 0; i < 12; i++) {
      const slot = renderer.el('rect', {
        x: 60 + i * 62, y: 506, width: 54, height: 34, rx: 7, class: 'tf-subnet-row-bg',
      }, this.timelineRow)
      this.timelineMarks.push(slot)
    }

    this.currentChip = renderer.el('text', { x: VIEW.width / 2, y: 578, 'text-anchor': 'middle', class: 'tf-label--mono' }, renderer.layerLabels)
    new Label(renderer, { x: VIEW.width / 2, y: 610, text: '教学简化:单核时间片轮转,未模拟优先级/抢占细节', kind: 'muted' })
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'boot',
        title: '调度器就绪:一个进程,两个线程',
        description: 'T1/T2 共享堆上的 counter(=5),各有私有栈和寄存器。',
        explanation: `**进程**拥有独立地址空间(右边的进程 B 与 A 完全隔离);**线程**是进程内的执行流:T1 与 T2 共享堆上的 counter,但各自有私有栈与寄存器 —— 记住这个布局,后面所有并发现象都从它推导。`,
        duration: 1400,
        action: 'boot',
      },
      {
        id: 't1-read',
        title: 'T1 执行:读取共享 counter',
        description: 'T1 的寄存器暂存读到的值(5)。',
        explanation: '`counter = counter + 1` 在 CPU 层面是**三步微指令:读内存 → 寄存器加 1 → 写回内存**。此刻 T1 读到了 5,放进自己的**私有寄存器** —— 注意这个值在 T1 的上下文里,堆上的 counter 还没变。',
        duration: 1300,
        action: 't1-read',
      },
      {
        id: 't1-add',
        title: 'T1 计算:寄存器 +1',
        description: '寄存器里 5+1=6,还没写回。',
        explanation: '加法发生在寄存器里。此刻是**竞态窗口**:T1 心里想着 6,但堆上的 counter 仍是 5 —— 如果 T2 在这个窗口插入执行,事故就埋下了。',
        duration: 1200,
        action: 't1-add',
      },
      {
        id: 't1-write',
        title: 'T1 写回:counter = 6',
        description: '堆内存被更新,T2 立即可见(共享堆)。',
        explanation: '写回后堆上的 counter 变成 6。**共享堆意味着这个变化对 T2 立刻可见** —— 这既是线程通信的便利,也是并发风险的来源。完成一条自增,T1 的 PC 前进。',
        duration: 1300,
        action: 't1-write',
      },
      {
        id: 'switch',
        title: '时间片到:上下文切换',
        description: '保存 T1 的寄存器/PC,恢复 T2 的。',
        explanation: '单核 CPU 靠**时间片轮转**制造并发假象:切换时把 T1 的寄存器与 PC 保存进它的 TCB,再恢复 T2 上次暂停时的上下文。切换本身有成本(微秒级 + 缓存污染)—— 线程并非越多越好,线程池正是为了控制切换开销。',
        duration: 1500,
        action: 'switch',
      },
      {
        id: 't2-run',
        title: 'T2 执行一轮:读到 T1 的修改',
        description: 'T2 读到 counter = 6,加 1,写回 7。',
        explanation: 'T2 读到的就是 T1 刚写回的 6 —— **共享堆的可见性**。完整执行一轮后 counter = 7,一切正常。但如果两条线程的「读后未写回」窗口互相穿插,就会看到下一章的丢失更新。',
        duration: 1400,
        action: 't2-run',
      },
      {
        id: 'race',
        title: '竞态现场:T1、T2 同时读旧值',
        description: '都读到 7,各加 1,都写回 8 —— 两次自增只加了一次!',
        explanation: `挑战时序:提前安排两条线程**都**处于「读后未写回」窗口。T1 读到 7,T2 也读到 7;各自 +1,先后写回 8 —— **计数器丢了 1**。这就是「丢失更新」,所有没加锁的共享计数器都潜伏着它。右侧挑战模式可一键制造。`,
        duration: 1600,
        action: 'race',
      },
      {
        id: 'lock',
        title: '加锁:「读-改-写」成为临界区',
        description: '互斥锁保证同一时刻只有一个线程在窗口内。',
        explanation: '加互斥锁后,三步被绑定成**原子临界区**:T2 必须等 T1 写回并释放锁才能进。代价是等待(吞吐下降),换来正确性。无锁方案(CAS 原子指令)是另一条路 —— 但都不改变「竞态源于非原子共享写」这个本质。',
        duration: 1400,
        action: 'lock',
      },
    ]

    const transitions: StepTransition<SchedulerState>[] = [
      () => ({ ...createSchedulerState(), running: { processId: 'p1', threadId: 'p1-t1' } }),
      s => executeStep(s, 'p1', 'p1-t1'),
      s => executeStep(s, 'p1', 'p1-t1'),
      s => executeStep(s, 'p1', 'p1-t1'),
      s => contextSwitch(s),
      s => runTimeSlice(s),
      s => {
        // 制造竞态:两个线程都处于「读后未写回」窗口
        let st = s
        st = executeStep(st, 'p1', 'p1-t1') // T1 读
        st = contextSwitch(st)             // 切到 T2
        st = executeStep(st, 'p1', 'p1-t2') // T2 读(旧值)
        st = executeStep(st, 'p1', 'p1-t2') // T2 加
        st = executeStep(st, 'p1', 'p1-t2') // T2 写回
        st = contextSwitch(st)             // 切回 T1
        st = executeStep(st, 'p1', 'p1-t1') // T1 加(基于旧值)
        st = executeStep(st, 'p1', 'p1-t1') // T1 写回(覆盖 T2 的结果!)
        return { ...st, log: [...st.log, hasLostUpdate(st) ? '⚠ 丢失更新发生:两次自增,counter 只加了一次' : '竞态窗口已制造'] }
      },
      s => ({ ...acquireLock(s, 'p1', 'p1-t1'), log: [...acquireLock(s, 'p1', 'p1-t1').log, '此后 counter 的每次自增都原子完成,不再丢失'] }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): SchedulerState {
    return { ...createSchedulerState(), running: { processId: 'p1', threadId: 'p1-t1' } }
  }

  private effectiveState(stepState: SchedulerState): SchedulerState {
    return this.live ?? stepState
  }

  protected render(stepState: SchedulerState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    this.cpuNode.setStatus(state.running ? 'active' : 'idle')

    const procA = state.processes[0]
    const t1 = procA?.threads[0]
    const t2 = procA?.threads[1]

    if (this.stackT1) {
      this.stackT1.textContent = `栈:局部变量(私有)${t1?.status === 'running' ? ' · 正在执行' : ''}`
    }
    if (this.stackT2) {
      this.stackT2.textContent = `栈:局部变量(私有)${t2?.status === 'running' ? ' · 正在执行' : ''}`
    }
    if (this.regT1) this.regT1.textContent = `寄存器 = ${t1?.context.register ?? 0}`
    if (this.regT2) this.regT2.textContent = `寄存器 = ${t2?.context.register ?? 0}`

    if (this.heapText) this.heapText.textContent = String(procA?.sharedCounter ?? 0)
    if (this.heapBox) {
      const racing = hasLostUpdate(state)
      this.heapBox.setAttribute('class', `tf-jvm-gen ${racing ? 'is-race' : ''}`)
    }
    if (this.heapAlert) {
      const racing = hasLostUpdate(state)
      this.heapAlert.textContent = racing ? '⚠ 丢失更新:两次自增只生效了一次!' : ''
    }
    if (this.lockChip) {
      this.lockChip.textContent = state.lockHeld ? `🔒 锁:T${state.lockHeld.endsWith('1') ? '1' : '2'} 持有` : '🔓 无锁'
      this.lockChip.setAttribute('class', `tf-tcp-state ${state.lockHeld ? 'tf-tcp-state--warning' : ''}`)
    }

    if (this.currentChip) {
      const runningThread = state.running
      const proc = runningThread ? state.processes.find(p => p.id === runningThread.processId) : undefined
      const thread = runningThread ? proc?.threads.find(t => t.id === runningThread.threadId) : undefined
      this.currentChip.textContent = thread ? `当前 CPU 正在执行:${thread.name}(${proc?.name})` : 'CPU 空闲'
    }

    // 时间线填充(已消耗的时间片)
    for (let i = 0; i < this.timelineMarks.length; i++) {
      const slot = this.timelineMarks[i]
      if (!slot) continue
      const filled = i < Math.min(12, state.slices)
      slot.setAttribute('class', `tf-subnet-row-bg ${filled ? 'is-done' : ''}`)
    }
    if (tl) tl.to(this.timelineRow ?? [], { opacity: 1, duration: 0.2 }, 0)
  }

  protected snapshotData(stepState: SchedulerState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const runningThread = state.running
      ? state.processes.find(p => p.id === state.running!.processId)?.threads.find(t => t.id === state.running!.threadId)
      : undefined
    const procA = state.processes[0]
    const pending = state.pendingWrites.length
    return {
      rows: [
        { label: 'CPU', value: runningThread ? `执行中:${runningThread.name}` : '空闲', tone: runningThread ? 'accent' : 'default' },
        { label: '时间片', value: String(state.slices) },
        { label: 'T1 寄存器', value: String(procA?.threads[0]?.context.register ?? 0) },
        { label: 'T2 寄存器', value: String(procA?.threads[1]?.context.register ?? 0) },
        { label: '共享 counter', value: String(procA?.sharedCounter ?? 0), tone: 'accent' },
        { label: '竞态窗口', value: pending ? `${pending} 个线程读后未写回` : '无', tone: pending > 0 ? 'warning' : 'success' },
        { label: '丢失更新', value: hasLostUpdate(state) ? '已发生!' : '未发生', tone: hasLostUpdate(state) ? 'danger' : 'success' },
        { label: '锁', value: state.lockHeld ? 'T1 持有' : '无' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'run-t1', label: 'T1 执行一步(微指令)' },
      { name: 'run-t2', label: 'T2 执行一步(微指令)' },
      { name: 'switch', label: '强制上下文切换' },
      { name: 'race-storm', label: '制造竞态(双线程交错写)', danger: true },
      { name: 'lock-then-run', label: '加锁后完整自增' },
      { name: 'reset', label: '复位调度器' },
    ]
  }

  performAction(name: string): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: SchedulerState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'run-t1':
        apply(executeStep(base(), 'p1', 'p1-t1'))
        break
      case 'run-t2':
        apply(executeStep(base(), 'p1', 'p1-t2'))
        break
      case 'switch':
        apply(contextSwitch(base()))
        break
      case 'race-storm': {
        let st = base()
        // 确保两线程都读到旧值后再交错写回
        st = executeStep(st, 'p1', 'p1-t1') // T1 读 7
        st = executeStep(st, 'p1', 'p1-t1') // T1 加(未写)
        st = executeStep(st, 'p1', 'p1-t2') // T2 读 7(同旧值)
        st = executeStep(st, 'p1', 'p1-t2') // T2 加
        st = executeStep(st, 'p1', 'p1-t2') // T2 写回 8
        st = executeStep(st, 'p1', 'p1-t1') // T1 写回 8(覆盖!)
        apply({ ...st, log: [...st.log, hasLostUpdate(st) ? '⚠ 丢失更新:counter 应为 9,实际 8' : '交错时序未构成丢失更新(可重试)'] })
        break
      }
      case 'lock-then-run': {
        let st = acquireLock(base(), 'p1', 'p1-t1')
        st = runTimeSlice(st)
        st = { ...st, lockHeld: null, log: [...st.log, 'T1 写回并释放锁 —— 本轮自增原子完成'] }
        apply(st)
        break
      }
      case 'reset':
        this.live = null
        this.render(this.states.current, { animate: false, timeline: null, fromIndex: 0 })
        this.events.emit('data', this.getState())
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new ProcessThreadScene(),
}

export default sceneModule
