import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { callMethod, createJvmState, dropRef, edenUsedKB, minorGc, newObject, returnFromMethod } from './model'
import type { JvmObject, JvmState } from './model'

/** JVM 内存模型场景:栈帧/堆分代/可达性分析 GC(教学模型) */

const VIEW = { width: 840, height: 640 }

const STACK = { x: 60, y: 90, w: 240, h: 380 }
const HEAP = { x: 360, y: 90, w: 460, h: 380 }
const EDEN = { x: HEAP.x + 16, y: HEAP.y + 50, w: 280, h: 200 }
const S0 = { x: EDEN.x, y: EDEN.y + EDEN.h + 12, w: 134, h: 90 }
const S1 = { x: EDEN.x + 146, y: EDEN.y + EDEN.h + 12, w: 134, h: 90 }
const OLD = { x: HEAP.x + 310, y: HEAP.y + 50, w: 134, h: 302 }

const KIND_OPTIONS = ['User', 'Order', 'Cache', 'byte[]'] as const

class JvmMemoryScene extends BaseScene<JvmState> {
  private edenCap = 32
  private frameChips: Array<{ g: SVGGElement; method: SVGTextElement; locals: SVGTextElement; refLine: SVGLineElement | null }> = []
  private objChips = new Map<string, { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; age: SVGTextElement | null }>()
  private edenFill: SVGRectElement | null = null
  private gcBadge: SVGGElement | null = null
  private gcText: SVGTextElement | null = null
  private chipLayer: SVGGElement | null = null
  private live: JvmState | null = null

  constructor() {
    super({ id: 'jvm-memory', viewBox: VIEW, label: 'JVM 运行时数据区教学模型' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // 栈区
    renderer.el('rect', { x: STACK.x, y: STACK.y, width: STACK.w, height: STACK.h, rx: 14, class: 'tf-cpu-block' }, renderer.layerLabels)
    renderer.el('text', { x: STACK.x + 16, y: STACK.y + 26, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '虚拟机栈(线程私有)'
    renderer.el('text', { x: STACK.x + 16, y: STACK.y + 46, class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      '每调用一个方法压入一个栈帧'
    new Label(renderer, { x: STACK.x + STACK.w / 2, y: STACK.y + STACK.h + 22, text: '↑ 栈顶:正在执行的方法', kind: 'mono' })
    renderer.el('text', { x: STACK.x + 16, y: STACK.y + STACK.h + 52, class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      'GC Roots:栈帧局部变量表中的引用'

    // 堆区
    renderer.el('rect', { x: HEAP.x, y: HEAP.y, width: HEAP.w, height: HEAP.h, rx: 14, class: 'tf-mem-block' }, renderer.layerLabels)
    renderer.el('text', { x: HEAP.x + 16, y: HEAP.y + 26, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '堆(线程共享)— 对象分配与 GC 主战场'

    renderer.el('rect', { x: EDEN.x, y: EDEN.y, width: EDEN.w, height: EDEN.h, rx: 10, class: 'tf-jvm-gen' }, renderer.layerLabels)
    renderer.el('text', { x: EDEN.x + 10, y: EDEN.y + 20, class: 'tf-label--muted' }, renderer.layerLabels).textContent = 'Eden(新生对象)'

    renderer.el('rect', { x: S0.x, y: S0.y, width: S0.w, height: S0.h, rx: 10, class: 'tf-jvm-gen' }, renderer.layerLabels)
    renderer.el('text', { x: S0.x + 10, y: S0.y + 20, class: 'tf-label--muted' }, renderer.layerLabels).textContent = 'Survivor A'
    renderer.el('rect', { x: S1.x, y: S1.y, width: S1.w, height: S1.h, rx: 10, class: 'tf-jvm-gen' }, renderer.layerLabels)
    renderer.el('text', { x: S1.x + 10, y: S1.y + 20, class: 'tf-label--muted' }, renderer.layerLabels).textContent = 'Survivor B'

    renderer.el('rect', { x: OLD.x, y: OLD.y, width: OLD.w, height: OLD.h, rx: 10, class: 'tf-jvm-gen tf-jvm-gen--old' }, renderer.layerLabels)
    renderer.el('text', { x: OLD.x + 10, y: OLD.y + 20, class: 'tf-label--muted' }, renderer.layerLabels).textContent = '老年代'

    // Eden 使用率条
    this.edenFill = renderer.el('rect', { x: EDEN.x + 10, y: EDEN.y + 30, width: 0, height: 8, rx: 4, class: 'tf-tw-fill' }, renderer.layerLabels)

    // 对象层
    this.chipLayer = renderer.el('g', {}, renderer.layerNodes)

    // GC 徽标
    this.gcBadge = renderer.el('g', {}, renderer.layerOverlay)
    renderer.el('rect', { x: HEAP.x + HEAP.w - 170, y: HEAP.y + 6, width: 150, height: 30, rx: 8, class: 'tf-ip-error-bg' }, this.gcBadge)
    this.gcText = renderer.el('text', { x: HEAP.x + HEAP.w - 95, y: 26, 'text-anchor': 'middle', class: 'tf-ip-error-text' }, this.gcBadge)
    this.gcBadge.style.display = 'none'

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 12, text: '教学简化模型:未建模对象间引用、写屏障与并发收集器细节', kind: 'muted' })
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'boot',
        title: 'JVM 启动:运行时数据区',
        description: '线程私有区(栈/PC)+ 共享区(堆/元空间)。',
        explanation:
          'JVM 运行时数据区分为**线程私有**(虚拟机栈、程序计数器、本地方法栈,随线程生灭)与**线程共享**(堆、方法区/元空间)。变量引用在**栈**,对象本体在**堆** —— 「Student s = new Student()」里,s 在栈帧局部变量表,Student 实例在堆。本教程只讲运行时数据区;**Java 内存模型(JMM)** 是另一回事(并发可见性,见正文第 4 章)。',
        duration: 1500,
        action: 'boot',
      },
      {
        id: 'main',
        title: 'main() 压栈',
        description: '栈帧:局部变量表 + 操作数栈。',
        explanation: '调用 main() 时压入一个**栈帧**:包含局部变量表、操作数栈、动态链接、返回地址。栈深超限抛 StackOverflowError —— 死递归的报错来源。',
        duration: 1200,
        action: 'main',
      },
      {
        id: 'new-user',
        title: 'new User():Eden 分配',
        description: '对象优先在新生代 Eden 区分配。',
        explanation: '对象优先在 **Eden** 区分配(HotSpot 里线程先在自己的 TLAB 中分配,避免并发竞争)。基于「绝大多数对象朝生夕死」的经验规律,新生代用复制算法 —— 本模型简化为「Eden → Survivor → Old」。',
        duration: 1400,
        action: 'new-user',
      },
      {
        id: 'ref',
        title: '引用建立:栈变量指向堆对象',
        description: '局部变量 s 持有 User#1 的地址。',
        explanation: '栈帧局部变量 s 的值是堆中对象的**引用**(教学上简化为一个指针)。GC 判定对象存活的方式就是:**从这些引用出发能不能走到它** —— 这组引用被称为 **GC Roots**(局部变量、静态变量、JNI 引用等)。',
        duration: 1300,
        action: 'ref',
      },
      {
        id: 'call',
        title: '调用 createOrder():压栈 + new Order()',
        description: '更深的方法,新的栈帧。',
        explanation: '调用 createOrder() 压入新栈帧(栈顶);它在 Eden 又分配了 Order 对象,由自己的局部变量 o 引用。两个对象目前都**可达**。',
        duration: 1300,
        action: 'call',
      },
      {
        id: 'return',
        title: '方法返回:栈帧弹出',
        description: '局部变量 o 随栈帧消失 → Order 不可达。',
        explanation: 'createOrder() 返回,**栈帧弹出**,局部变量 o 不复存在 —— Order#2 从此没有任何 GC Root 能走到它,进入「可回收」状态。注意它还占着内存:可回收 ≠ 已回收,要等 GC。',
        duration: 1400,
        action: 'return',
      },
      {
        id: 'gc-trigger',
        title: 'Eden 满 → 触发 Minor GC',
        description: '分配不下新对象时,GC 被触发。',
        explanation: '继续分配对象直到 Eden 满,触发 **Minor GC**(教学模型)。真实的 JVM 还会在老年代占比、元空间压力等条件下触发 Full GC,代价更高。',
        duration: 1300,
        action: 'gc-trigger',
      },
      {
        id: 'mark',
        title: '可达性分析:从 GC Roots 标记',
        description: '能从根走到的对象标记为存活。',
        explanation: 'GC 从 **GC Roots** 出发遍历引用链:**能走到的标记存活**(User#1,被 main 的 s 引用),**走不到的判死**(Order#2)。相比早期「引用计数」,可达性分析天然解决循环引用问题。',
        duration: 1400,
        action: 'mark',
      },
      {
        id: 'sweep',
        title: '清理与幸存者晋升',
        description: '不可达对象被回收;存活对象进 Survivor,年龄 +1。',
        explanation: '不可达对象被清理(内存回收);存活对象从 Eden **复制到 Survivor 区**,GC 年龄 +1。每熬过一次 GC 年龄 +1,达到阈值(默认 15)晋升**老年代** —— 长期存活的对象不再参与频繁的新生代回收。',
        duration: 1500,
        action: 'sweep',
      },
      {
        id: 'promote',
        title: '多次 GC 后:晋升老年代',
        description: '长期存活的对象最终进入老年代。',
        explanation: '再经历两次 GC,User#1 年龄达到 3,晋升**老年代**。老年代对象少回收、采用不同算法(标记-整理等)。⚠️ **教学简化声明**:本动画是简化模型,真实的 HotSpot 收集器(Serial/Parallel/G1/ZGC)在并发标记、Region 布局、写屏障等实现上复杂得多,生产请以官方文档为准。',
        duration: 1500,
        action: 'promote',
      },
      {
        id: 'jmm',
        title: '别混淆:JMM ≠ 运行时数据区',
        description: '两个同名概念,完全不同的层次。',
        explanation: '「JVM 内存模型」社区里常混用两个东西:**运行时数据区**(本教程,内存布局)与 **Java 内存模型 JMM / JSR-133**(并发规范:volatile/synchronized 语义、happens-before 规则、工作内存与主内存的抽象)。前者回答「内存怎么分区」,后者回答「一个线程的写何时对另一个线程可见」。涉及多线程可见性时请查阅 JMM 专门资料。',
        duration: 1500,
        action: 'jmm',
      },
    ]

    const transitions: StepTransition<JvmState>[] = [
      () => createJvmState(this.edenCap),
      s => callMethod(s, 'main()'),
      s => newObject(s, 'User', 2, 's'),
      s => ({ ...s, log: [...s.log, '局部变量 s → User#1(GC Root)'] }),
      s => newObject(callMethod(s, 'createOrder()'), 'Order', 4, 'o'),
      s => ({ ...returnFromMethod(s), log: [...returnFromMethod(s).log, 'Order#2 失去引用,等待 GC'] }),
      s => newObject(newObject(s, 'byte[]', 8, null), 'Cache', 16, null),
      s => ({ ...s, log: [...s.log, '标记阶段:User#1 可达(存活);Order#2 / byte[]#3 / Cache#4 不可达'] }),
      s => minorGc(s),
      s => minorGc(minorGc(s)),
      s => ({ ...s, log: [...s.log, '提示:运行时数据区(布局)≠ JMM(并发可见性规范)'] }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): JvmState {
    return createJvmState(this.edenCap)
  }

  private effectiveState(stepState: JvmState): JvmState {
    return this.live ?? stepState
  }

  private chipPos(obj: JvmObject, indexInGen: number): { x: number; y: number } {
    const box = obj.gen === 'eden' ? EDEN : obj.gen === 'survivor' ? (indexInGen % 2 === 0 ? S0 : S1) : OLD
    if (obj.gen === 'old') {
      return { x: OLD.x + 10, y: OLD.y + 40 + indexInGen * 36 }
    }
    if (obj.gen === 'survivor') {
      return { x: box.x + 10, y: box.y + 34 + Math.floor(indexInGen / 2) * 34 }
    }
    return { x: box.x + 10 + (indexInGen % 3) * 90, y: box.y + 50 + Math.floor(indexInGen / 3) * 46 }
  }

  /** 重建对象芯片(状态驱动的声明式渲染) */
  private renderHeap(heap: JvmState, timeline: GsapTimeline | null, animate: boolean): void {
    if (!this.chipLayer) return
    const byGen: Record<string, JvmObject[]> = { eden: [], survivor: [], old: [] }
    for (const obj of heap.heap) byGen[obj.gen]?.push(obj)

    // 移除已消失的芯片
    const liveIds = new Set(heap.heap.map(o => o.id))
    for (const [id, chip] of [...this.objChips.entries()]) {
      if (!liveIds.has(id)) {
        if (timeline) {
          timeline.to(chip.g, { opacity: 0, scale: 0.6, duration: 0.35, transformOrigin: 'center' }, 0)
          timeline.add(() => chip.g.remove(), 0.4)
        } else {
          chip.g.remove()
        }
        this.objChips.delete(id)
      }
    }

    for (const gen of ['eden', 'survivor', 'old'] as const) {
      const objs = byGen[gen] ?? []
      objs.forEach((obj, i) => {
        const pos = this.chipPos(obj, i)
        let chip = this.objChips.get(obj.id)
        if (!chip) {
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          g.setAttribute('class', 'tf-jvm-obj')
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          rect.setAttribute('width', '82')
          rect.setAttribute('height', '28')
          rect.setAttribute('rx', '6')
          g.appendChild(rect)
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          text.setAttribute('x', '8')
          text.setAttribute('y', '19')
          g.appendChild(text)
          const age = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          age.setAttribute('x', '74')
          age.setAttribute('y', '19')
          age.setAttribute('text-anchor', 'end')
          g.appendChild(age)
          this.chipLayer?.appendChild(g)
          chip = { g, rect, text, age }
          this.objChips.set(obj.id, chip)
        }
        chip.rect.setAttribute('class', `tf-jvm-obj-rect ${obj.gen === 'old' ? 'is-old' : obj.gen === 'survivor' ? 'is-survivor' : ''}`)
        chip.text.textContent = `${obj.kind} ${obj.sizeKB}KB`
        if (chip.age) chip.age.textContent = `a${obj.age}`
        const target = { x: pos.x, y: pos.y }
        if (timeline && animate) {
          timeline.to(chip.g, { x: target.x, y: target.y, duration: 0.5, ease: 'power1.inOut' }, 0)
        } else {
          chip.g.setAttribute('transform', `translate(${target.x} ${target.y})`)
        }
      })
    }

    // Eden 使用率
    const used = edenUsedKB(heap)
    const ratio = Math.min(1, used / heap.edenCapKB)
    if (this.edenFill) {
      const w = (EDEN.w - 20) * ratio
      if (timeline && animate) timeline.to(this.edenFill, { attr: { width: w }, duration: 0.4 }, 0)
      else this.edenFill.setAttribute('width', String(w))
    }
  }

  protected render(stepState: JvmState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    // 栈帧
    if (!this.frameChips.length) {
      for (let i = 0; i < 4; i++) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('x', String(STACK.x + 16))
        rect.setAttribute('width', String(STACK.w - 32))
        rect.setAttribute('height', '64')
        rect.setAttribute('rx', '8')
        rect.setAttribute('class', 'tf-jvm-frame')
        g.appendChild(rect)
        const method = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        method.setAttribute('x', String(STACK.x + 30))
        method.setAttribute('y', '0')
        method.setAttribute('class', 'tf-http-title')
        g.appendChild(method)
        const locals = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        locals.setAttribute('x', String(STACK.x + 30))
        locals.setAttribute('y', '0')
        locals.setAttribute('class', 'tf-subnet-mono')
        g.appendChild(locals)
        // 栈自底向上:frames[0] 在最下方
        const slotY = STACK.y + STACK.h - 84 - i * 74
        g.setAttribute('transform', `translate(0 ${slotY})`)
        this.chipLayer?.appendChild(g)
        this.frameChips.push({ g, method, locals, refLine: null })
      }
    }
    for (let i = 0; i < this.frameChips.length; i++) {
      const chip = this.frameChips[i]
      if (!chip) continue
      const frame = state.frames[i]
      const slotY = STACK.y + STACK.h - 84 - i * 74
      if (frame) {
        chip.method.textContent = frame.method
        chip.locals.textContent = frame.locals.map(l => `${l.name}→${l.objId ?? 'null'}`).join('  ') || '(无局部变量)'
        chip.g.style.opacity = '1'
        chip.g.setAttribute('transform', `translate(0 ${slotY})`)
        chip.method.setAttribute('y', String(slotY + 24))
        chip.locals.setAttribute('y', String(slotY + 46))
      } else {
        chip.g.style.opacity = '0'
      }
    }

    this.renderHeap(state, tl, Boolean(tl && opts.animate))

    // GC 徽标
    if (this.gcBadge && this.gcText) {
      if (state.gcCount > 0) {
        this.gcText.textContent = `Minor GC ×${state.gcCount}`
        this.gcBadge.style.display = 'block'
      } else {
        this.gcBadge.style.display = 'none'
      }
    }
  }

  protected snapshotData(stepState: JvmState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    return {
      rows: [
        { label: '栈帧', value: state.frames.map(f => f.method).join(' → ') || '(空栈)' },
        { label: 'GC Roots', value: String(state.frames.reduce((acc, f) => acc + f.locals.filter(l => l.objId).length, 0)) },
        { label: '堆对象', value: `${state.heap.length} 个(${state.heap.reduce((a, o) => a + o.sizeKB, 0)}KB)` },
        { label: 'Eden 使用', value: `${edenUsedKB(state)} / ${state.edenCapKB} KB`, tone: edenUsedKB(state) >= state.edenCapKB ? 'danger' : 'success' },
        { label: 'Survivor 对象', value: String(state.heap.filter(o => o.gen === 'survivor').length) },
        { label: '老年代对象', value: String(state.heap.filter(o => o.gen === 'old').length) },
        { label: 'Minor GC 次数', value: String(state.gcCount), tone: state.gcCount > 0 ? 'accent' : 'default' },
        { label: '累计回收', value: `${state.collectedKB} KB` },
        { label: '晋升老年代', value: `${state.promoted} 个` },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'create-object',
        label: '创建对象(Eden 分配)',
        params: [{ name: 'kind', label: '类型', type: 'select', options: KIND_OPTIONS.map(k => ({ value: k, label: k })) }],
      },
      {
        name: 'drop-ref',
        label: '断开引用(变量置 null)',
        params: [
          {
            name: 'var',
            label: '变量',
            type: 'select',
            options: [
              { value: 's', label: 's(User#1)' },
              { value: 'o', label: 'o(Order#2)' },
            ],
          },
        ],
      },
      { name: 'trigger-gc', label: '手动触发 Minor GC' },
      {
        name: 'allocate-storm',
        label: '分配风暴(挑战:连续分配直至 GC)',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    switch (name) {
      case 'create-object': {
        const kind = String(params?.kind ?? 'User')
        const size = kind === 'byte[]' ? 8 : 2
        this.live = newObject(base(), kind, size, null)
        break
      }
      case 'drop-ref': {
        const v = String(params?.var ?? 's')
        this.live = dropRef(base(), v)
        break
      }
      case 'trigger-gc':
        this.live = minorGc(base())
        break
      case 'allocate-storm': {
        let st = base()
        for (let i = 0; i < 6; i++) st = newObject(st, 'byte[]', 8, null)
        st = minorGc(st)
        this.live = st
        break
      }
      default:
        return
    }
    if (this.live) {
      this.render(this.live, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new JvmMemoryScene(),
}

export default sceneModule
