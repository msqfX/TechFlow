import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  SQ_CAPACITY,
  createStackQueueState,
  dequeue,
  enqueue,
  popStack,
  pushStack,
  twoStackQueuePop,
  twoStackQueuePush,
} from './model'
import type { StackQueueState } from './model'

/** 栈与队列场景:双面板(LIFO 栈 + FIFO 队列)实时操作 */

const VIEW = { width: 840, height: 560 }
const STACK_X = 150
const STACK_W = 160
const STACK_H = 52
const STACK_BASE_Y = 400
const QUEUE_X0 = 460
const QUEUE_W = 96
const QUEUE_H = 52
const QUEUE_Y = 330

class StackQueueScene extends BaseScene<StackQueueState> {
  private stackBoxes: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }> = []
  private stackTopArrow: SVGPathElement | null = null
  private poppedChip: SVGTextElement | null = null
  private queueBoxes: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }> = []
  private dequeuedChip: SVGTextElement | null = null
  private errorChip: SVGTextElement | null = null
  private twoStackLabel: SVGTextElement | null = null

  constructor() {
    super({ id: 'stack-queue', viewBox: VIEW, label: '栈(LIFO)与队列(FIFO)' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // ===== 左:栈 =====
    renderer.el('rect', { x: 100, y: 100, width: 260, height: 380, rx: 14, class: 'tf-cpu-block' }, renderer.layerLabels)
    renderer.el('text', { x: 118, y: 126, class: 'tf-label--accent' }, renderer.layerLabels).textContent = '栈 · LIFO 后进先出'
    renderer.el('text', { x: 118, y: 148, class: 'tf-label--muted' }, renderer.layerLabels).textContent = 'push/pop/peek 都在栈顶'

    // 栈框(从底往上)
    renderer.el('rect', { x: STACK_X, y: STACK_BASE_Y - SQ_CAPACITY * STACK_H, width: STACK_W, height: SQ_CAPACITY * STACK_H, rx: 6, class: 'tf-jvm-gen', fill: 'none' }, renderer.layerNodes)

    this.stackBoxes = []
    for (let i = 0; i < SQ_CAPACITY; i++) {
      const g = renderer.el('g', {}, renderer.layerNodes)
      const y = STACK_BASE_Y - (i + 1) * STACK_H + 4
      const rect = renderer.el('rect', { x: STACK_X + 6, y, width: STACK_W - 12, height: STACK_H - 8, rx: 7, class: 'tf-jvm-frame' }, g)
      const text = renderer.el('text', { x: STACK_X + STACK_W / 2, y: y + STACK_H / 2 + 5, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g)
      g.style.opacity = '0'
      this.stackBoxes.push({ g, rect, text })
    }

    this.stackTopArrow = renderer.el('path', { class: 'tf-bar-link', fill: 'none', stroke: 'var(--accent-bright)' }, renderer.layerOverlay)
    this.poppedChip = renderer.el('text', { x: STACK_X + STACK_W + 20, y: STACK_BASE_Y - 30, class: 'tf-subnet-result ok' }, renderer.layerLabels)

    // ===== 右:队列 =====
    renderer.el('rect', { x: 420, y: 260, width: 400, height: 220, rx: 14, class: 'tf-mem-block' }, renderer.layerLabels)
    renderer.el('text', { x: 438, y: 286, class: 'tf-label--accent' }, renderer.layerLabels).textContent = '队列 · FIFO 先进先出'
    renderer.el('text', { x: 438, y: 308, class: 'tf-label--muted' }, renderer.layerLabels).textContent = 'enqueue 队尾进,dequeue 队头出'

    this.queueBoxes = []
    for (let i = 0; i < SQ_CAPACITY; i++) {
      const g = renderer.el('g', {}, renderer.layerNodes)
      const x = QUEUE_X0 + i * QUEUE_W
      const rect = renderer.el('rect', { x, y: QUEUE_Y, width: QUEUE_W - 10, height: QUEUE_H, rx: 7, class: 'tf-jvm-frame' }, g)
      const text = renderer.el('text', { x: x + (QUEUE_W - 10) / 2, y: QUEUE_Y + QUEUE_H / 2 + 5, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g)
      g.style.opacity = '0'
      this.queueBoxes.push({ g, rect, text })
    }
    // 队头/队尾标注
    renderer.el('text', { x: QUEUE_X0, y: QUEUE_Y - 12, class: 'tf-label--accent' }, renderer.layerLabels).textContent = '← 队头(dequeue)'
    renderer.el('text', { x: QUEUE_X0 + SQ_CAPACITY * QUEUE_W - 10, y: QUEUE_Y - 12, 'text-anchor': 'end', class: 'tf-label--muted' }, renderer.layerLabels).textContent = '队尾(enqueue)→'

    this.dequeuedChip = renderer.el('text', { x: QUEUE_X0, y: QUEUE_Y + QUEUE_H + 36, class: 'tf-subnet-result ok' }, renderer.layerLabels)

    // 错误提示
    this.errorChip = renderer.el('text', { x: VIEW.width / 2, y: 530, 'text-anchor': 'middle', class: 'tf-ip-error-text' }, renderer.layerLabels)

    // 两个栈模拟队列的延伸说明
    this.twoStackLabel = renderer.el('text', { x: VIEW.width / 2, y: 96, 'text-anchor': 'middle', class: 'tf-label--muted' }, renderer.layerLabels)
    this.twoStackLabel.textContent = ''

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 6, text: '对照:函数调用栈(压栈/返回)、Ctrl+Z 撤销、任务队列、打印队列 —— 全是这两个结构', kind: 'muted' })
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: '两个结构就绪',
        description: '栈(左)与队列(右),容量各 6,当前为空。',
        explanation: `左面板是**栈**:只有一个出入口(栈顶),push/pop 都发生在这里 —— **后进先出 LIFO**。右面板是**队列**:队尾进、队头出 —— **先进先出 FIFO**。两者的核心操作都是 O(1)。用右侧按钮亲手操作,或点播放看教学序列。`,
        duration: 1200,
        action: 'init',
      },
      {
        id: 'push-abc',
        title: '栈:压入 A、B、C',
        description: '依次压栈 —— C 在栈顶。',
        explanation: `push 把元素**叠在栈顶**:A 在最底,C 在最顶。注意它们进入的顺序是 A→B→C,但「距离出口」的顺序恰好相反 —— 这就是**后进先出**。函数调用栈正是如此:main 调 A、A 调 B,B 的栈帧在栈顶,**最先返回**。`,
        duration: 1400,
        action: 'push-abc',
      },
      {
        id: 'pop-cba',
        title: '栈:弹出 —— 顺序是 C、B、A',
        description: '弹栈顺序与压栈顺序完全相反(LIFO)。',
        explanation: `pop 只能取**栈顶**:C 先出、然后 B、最后 A —— 与压入顺序**完全相反**。这个特性就是「撤销」功能的原理:Ctrl+Z 撤销的总是**最近**一次操作。空栈再弹出会触发 **underflow** 错误 —— 用右侧按钮试试。`,
        duration: 1500,
        action: 'pop-cba',
      },
      {
        id: 'enqueue-abc',
        title: '队列:入队 A、B、C',
        description: 'A、B、C 在队尾排队 —— A 在队头。',
        explanation: `enqueue 把元素加到**队尾**:先来的 A 排在队头位置。和栈完全不同:入口(队尾)和出口(队头)**分在两端** —— 这为「先进先出」创造了物理条件。`,
        duration: 1300,
        action: 'enqueue-abc',
      },
      {
        id: 'dequeue-abc',
        title: '队列:出队 —— 顺序还是 A、B、C',
        description: '出队顺序与入队顺序完全相同(FIFO)。',
        explanation: `dequeue 从**队头**取元素:A 最先来也最先走,B、C 依次 —— 与入队顺序**完全相同**。任务队列、打印队列、消息队列(RocketMQ/Kafka)都遵循这个契约:**先来的请求先被处理**。`,
        duration: 1500,
        action: 'dequeue-abc',
      },
      {
        id: 'two-stack',
        title: '经典组合:两个栈模拟一个队列',
        description: 'in 栈收数据,出队时倒进 out 栈再弹 —— 顺序神奇地恢复 FIFO。',
        explanation: `把栈的 LIFO **反转两次**就回到了 FIFO:入队压进 in 栈;出队时若 out 栈为空,把 in 全部倒入 out(顺序反转一次),再从 out 弹出(再反转一次)—— 最早入队的最先出来。均摊 O(1)。这个技巧是面试常客,也出现在很多池化/调度实现里。`,
        duration: 1500,
        action: 'two-stack',
      },
    ]

    const A = 'A', B = 'B', C = 'C'
    const transitions: StepTransition<StackQueueState>[] = [
      s => createStackQueueState() === s ? s : s,
      s => pushStack(pushStack(pushStack(s, A), B), C),
      s => popStack(popStack(popStack(s))),
      s => enqueue(enqueue(enqueue(s, A), B), C),
      s => dequeue(dequeue(dequeue(s))),
      s => {
        // 演示两个栈模拟队列:in 收 A/B/C,倒栈弹出 A
        let inStack: string[] = []
        inStack = twoStackQueuePush(inStack, A)
        inStack = twoStackQueuePush(inStack, B)
        inStack = twoStackQueuePush(inStack, C)
        const r = twoStackQueuePop(inStack, [])
        return { ...s, log: [...s.log, `双栈模拟:in=[A,B,C] 倒入 out=[C,B,A],弹出 → ${r.popped}(FIFO 恢复!)`] }
      },
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): StackQueueState {
    return createStackQueueState()
  }

  private effectiveState(stepState: StackQueueState): StackQueueState {
    return this.live ?? stepState
  }

  private live: StackQueueState | null = null

  protected render(stepState: StackQueueState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    // 栈盒子(自底向上)
    for (let i = 0; i < this.stackBoxes.length; i++) {
      const box = this.stackBoxes[i]
      if (!box) continue
      const item = state.stack[i]
      const topIdx = state.stack.length - 1
      const visible = item !== undefined
      const target = visible ? '1' : '0'
      if (visible) {
        if (box.text) box.text.textContent = item
        if (box.rect) box.rect.setAttribute('class', `tf-jvm-frame ${i === topIdx ? 'is-top' : ''}`)
      }
      if (tl && visible) {
        tl.to(box.g, { opacity: target, duration: 0.25 }, 0)
      } else {
        box.g.style.opacity = target
      }
    }

    // 栈顶箭头
    if (this.stackTopArrow) {
      const topIdx = state.stack.length
      if (state.stack.length > 0) {
        const y = STACK_BASE_Y - topIdx * STACK_H + 4
        this.stackTopArrow.style.opacity = '1'
        this.stackTopArrow.setAttribute('d', `M ${STACK_X - 14} ${y} h 10 M ${STACK_X - 9} ${y - 4} l 5 4 l -5 4`)
      } else {
        this.stackTopArrow.style.opacity = '0'
      }
    }

    if (this.poppedChip) {
      this.poppedChip.textContent = state.lastPopped ? `pop → ${state.lastPopped}` : ''
    }

    // 队列盒子
    for (let i = 0; i < this.queueBoxes.length; i++) {
      const box = this.queueBoxes[i]
      if (!box) continue
      const item = state.queue[i]
      const visible = item !== undefined
      const target = visible ? '1' : '0'
      if (visible) {
        if (box.text) box.text.textContent = item
        if (box.rect) box.rect.setAttribute('class', `tf-jvm-frame ${i === 0 ? 'is-front' : ''}`)
      }
      if (tl && visible) {
        tl.to(box.g, { opacity: target, duration: 0.25 }, i * 0.06)
      } else {
        box.g.style.opacity = target
      }
    }

    if (this.dequeuedChip) {
      this.dequeuedChip.textContent = state.lastDequeued ? `dequeue → ${state.lastDequeued}` : ''
    }

    if (this.errorChip) {
      this.errorChip.textContent = state.error ?? ''
    }
  }

  protected snapshotData(stepState: StackQueueState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    return {
      rows: [
        { label: '栈内容(底→顶)', value: state.stack.join(' | ') || '(空)', tone: state.stack.length ? 'accent' : 'default' },
        { label: '栈顶', value: state.stack.length ? String(state.stack[state.stack.length - 1]) : '(空)', tone: 'accent' },
        { label: '最近 pop', value: state.lastPopped ?? '—' },
        { label: '队列内容(头→尾)', value: state.queue.join(' | ') || '(空)', tone: state.queue.length ? 'accent' : 'default' },
        { label: '队头 / 队尾', value: state.queue.length ? `${state.queue[0]} / ${state.queue[state.queue.length - 1]}` : '(空)' },
        { label: '最近 dequeue', value: state.lastDequeued ?? '—' },
        { label: '占用', value: `栈 ${state.stack.length}/${SQ_CAPACITY} · 队列 ${state.queue.length}/${SQ_CAPACITY}`, tone: state.stack.length >= SQ_CAPACITY || state.queue.length >= SQ_CAPACITY ? 'danger' : 'default' },
        { label: '边界错误', value: state.error ?? '(无)', tone: state.error ? 'danger' : 'success' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'push', label: '栈:push 压栈', description: '压入一个元素(自动命名)。' },
      { name: 'pop', label: '栈:pop 弹栈', description: '空栈弹出会触发 underflow。', danger: true },
      { name: 'enqueue', label: '队列:enqueue 入队' },
      { name: 'dequeue', label: '队列:dequeue 出队', danger: true },
      { name: 'fill-both', label: '塞满两个结构', description: '挑战:连续压栈/入队直到溢出。', danger: true },
      { name: 'reset', label: '复位' },
    ]
  }

  private pushCounter = 0

  performAction(name: string): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: StackQueueState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    const names = ['A', 'B', 'C', 'D', 'E', 'F']
    switch (name) {
      case 'push':
        this.pushCounter = (this.pushCounter + 1) % names.length
        apply(pushStack(base(), names[this.pushCounter]!))
        break
      case 'pop':
        apply(popStack(base()))
        break
      case 'enqueue':
        this.pushCounter = (this.pushCounter + 1) % names.length
        apply(enqueue(base(), names[this.pushCounter]!))
        break
      case 'dequeue':
        apply(dequeue(base()))
        break
      case 'fill-both': {
        let st = base()
        for (let i = 0; i < SQ_CAPACITY + 1; i++) st = pushStack(st, names[i % names.length]!)
        for (let i = 0; i < SQ_CAPACITY + 1; i++) st = enqueue(st, names[i % names.length]!)
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
  create: () => new StackQueueScene(),
}

export default sceneModule
