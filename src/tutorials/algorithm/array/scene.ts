import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { ELEMENT_BYTES, accessAt, append, createArrayState, insertAt, removeAt } from './model'
import type { ArrayState } from './model'

/** 数组场景:连续内存格子 + 移位箭头 + 容量条 + 扩容横幅 */

const VIEW = { width: 840, height: 560 }
const CELL_X0 = 60
const CELL_W = 88
const CELL_STEP = 100
const CELL_H = 64
const CELL_Y = 240
const MAX_CELLS = 8

class ArrayScene extends BaseScene<ArrayState> {
  private cells: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; idx: SVGTextElement; addr: SVGTextElement }> = []
  private shiftArrows: SVGPathElement[] = []
  private resizeBanner: SVGTextElement | null = null
  private capFill: SVGRectElement | null = null
  private live: ArrayState | null = null

  constructor() {
    super({ id: 'array', viewBox: VIEW, label: '数组连续内存与移位' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // 内存格子(固定 8 个槽位,空槽虚线)
    this.cells = []
    for (let i = 0; i < MAX_CELLS; i++) {
      const x = CELL_X0 + i * CELL_STEP
      const g = renderer.el('g', {}, renderer.layerNodes)
      const rect = renderer.el('rect', { x, y: CELL_Y, width: CELL_W, height: CELL_H, rx: 8, class: 'tf-jvm-frame' }, g)
      const text = renderer.el('text', { x: x + CELL_W / 2, y: CELL_Y + CELL_H / 2 + 6, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g)
      const idx = renderer.el('text', { x: x + CELL_W / 2, y: CELL_Y + CELL_H + 24, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, g)
      idx.textContent = `[${i}]`
      const addr = renderer.el('text', { x: x + CELL_W / 2, y: CELL_Y + CELL_H + 44, 'text-anchor': 'middle', class: 'tf-label--muted' }, g)
      addr.textContent = `+${i * ELEMENT_BYTES}B`
      g.style.opacity = '0'
      this.cells.push({ g, rect, text, idx, addr })
    }

    // 移位箭头
    this.shiftArrows = []
    for (let i = 0; i < MAX_CELLS - 1; i++) {
      const x = CELL_X0 + i * CELL_STEP + CELL_W + 2
      const arrow = renderer.el('path', { class: 'tf-bar-link', fill: 'none', stroke: 'var(--warning)' }, renderer.layerOverlay)
      arrow.setAttribute('d', `M ${x} ${CELL_Y + CELL_H / 2} H ${x + CELL_STEP - CELL_W - 8} M ${x + CELL_STEP - CELL_W - 14} ${CELL_Y + CELL_H / 2 - 5} l 6 5 l -6 5`)
      arrow.style.opacity = '0'
      this.shiftArrows.push(arrow)
    }

    this.resizeBanner = renderer.el('text', { x: VIEW.width / 2, y: 190, 'text-anchor': 'middle', class: 'tf-ip-error-text' }, renderer.layerLabels)

    // 容量条
    new Label(renderer, { x: CELL_X0, y: 150, text: 'size / capacity', kind: 'accent', anchor: 'start' })
    renderer.el('rect', { x: CELL_X0 + 130, y: 136, width: 320, height: 18, rx: 6, class: 'tf-tw-bar' }, renderer.layerNodes)
    this.capFill = renderer.el('rect', { x: CELL_X0 + 130, y: 136, width: 0, height: 18, rx: 6, class: 'tf-tw-fill' }, renderer.layerNodes)

    new Label(renderer, { x: 60, y: 440, text: '地址公式:arr[k] = 首地址 + k × 4B —— 一步算出,O(1) 随机访问', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 60, y: 466, text: '黄色箭头 = 插入/删除引发的移位(移多少个元素,就 O(n))', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 60, y: 492, text: '对照《链表》:数组读快写慢;链表写快读慢 —— 选型看读写比', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '教学简化:元素按 4 字节计;扩容倍数取 2(工程常见 1.5~2)', kind: 'muted' })
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: '连续内存中的数组',
        description: '[3, 7, 12],容量 4 —— 第 4 格是空位。',
        explanation: `数组把元素放进**连续内存**:每个格子下方就是它的下标与相对地址(+0B/+4B/+8B…)。**arr[k] 的地址 = 首地址 + k × 4B** —— 一条公式,访问任何下标都是 O(1)。这就是链表(节点分散,必须顺指针走)给不了的能力。`,
        duration: 1300,
        action: 'init',
      },
      {
        id: 'access',
        title: '随机访问 arr[2]:一步直达',
        description: '首地址 + 2 × 4B → O(1)。',
        explanation: `不管访问第 1 个还是第 100000 个元素,都只是一次地址计算 —— **O(1) 随机访问**是数组的招牌。对照《链表》:同样的操作要顺指针走 k 步。有序数组还因此获得**二分查找 O(log n)** 的资格。`,
        duration: 1200,
        action: 'access',
      },
      {
        id: 'insert-mid',
        title: '中间插入:整体后移',
        description: '在下标 1 插入 99 → 7、12 后移一格。',
        explanation: `腾出空位必须**把后面的元素整体后移**(黄色箭头)。移动的元素数与位置成正比,平均 n/2 → **O(n)**。对照《链表》:同样动作只需改一个指针 —— 但链表要**先花 O(n) 找到位置**,两者扯平。`,
        duration: 1500,
        action: 'insert-mid',
      },
      {
        id: 'append',
        title: '尾部追加:数组的主场',
        description: '追加 42 到末尾 —— 没有任何移位。',
        explanation: `尾部没有元素需要移动,**O(1)**。这就是为什么「批量收集数据」几乎都用数组/动态数组:顺序写入是它们的最佳场景,而且连续内存对 CPU 缓存极其友好(顺路读下一个元素基本不 miss)。`,
        duration: 1200,
        action: 'append',
      },
      {
        id: 'append-full',
        title: '容量满了:翻倍扩容',
        description: '容量 4→8,旧元素整体拷贝 —— 单次 O(n)。',
        explanation: `动态数组的容量是**固定的底层静态数组**;满了就申请一块**两倍大**的新内存,把旧元素整体拷贝过去。单次代价 O(n),但把 n 次追加的总拷贝摊开 ≈ 2n —— **均摊 O(1)**。已知规模时预分配容量可完全避免拷贝。`,
        duration: 1500,
        action: 'append-full',
      },
      {
        id: 'remove-mid',
        title: '中间删除:前移补洞',
        description: '删除 arr[1] → 后面整体前移。',
        explanation: `删除与插入对称:**后面的元素整体前移**补洞,O(n)。至此数组的画像完整:**读 O(1)、尾写 O(1)、中写 O(n)、缓存友好** —— 和《链表》正好互补。工程上多数场景选数组系(读多 + 缓存红利),链表留给频繁已知位置增删的场景。`,
        duration: 1400,
        action: 'remove-mid',
      },
    ]

    const transitions: StepTransition<ArrayState>[] = [
      () => createArrayState([3, 7, 12], 4),
      s => accessAt(s, 2),
      s => insertAt(s, 1, 99),
      s => append(s, 42),
      s => append(s, 55),
      s => removeAt(s, 1),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): ArrayState {
    return createArrayState([3, 7, 12], 4)
  }

  private effectiveState(stepState: ArrayState): ArrayState {
    return this.live ?? stepState
  }

  protected render(stepState: ArrayState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      if (!cell) continue
      const used = i < state.cells.length
      const value = state.cells[i]
      const isEmptySlot = value === null
      const target = used ? '1' : '0'
      if (cell.text) cell.text.textContent = isEmptySlot ? '' : String(value)
      if (cell.rect) {
        const cls = ['tf-jvm-frame']
        const hl = state.highlight
        if (!isEmptySlot && hl !== null && i === hl) cls.push('is-top')
        cell.rect.setAttribute('class', cls.join(' '))
      }
      if (tl) tl.to(cell.g, { opacity: target, duration: 0.25 }, i * 0.05)
      else cell.g.style.opacity = target
    }

    // 移位箭头
    this.shiftArrows.forEach((arrow, i) => {
      arrow.style.opacity = state.shifts.includes(i) || state.shifts.includes(i - 1) ? '1' : '0'
    })

    if (this.resizeBanner) {
      this.resizeBanner.textContent = state.resizes > 0 ? `⚡ 已扩容 ×${state.resizes}(容量翻倍,累计拷贝 ${state.copied} 个元素)` : ''
    }

    if (this.capFill) {
      const cap = state.cells.length
      const w = (320 * state.size) / cap
      if (tl) tl.to(this.capFill, { attr: { width: w }, duration: 0.4 }, 0)
      else this.capFill.setAttribute('width', String(w))
    }
  }

  protected snapshotData(stepState: ArrayState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const cells = state.cells
    return {
      rows: [
        { label: '逻辑内容', value: `[${cells.slice(0, state.size).join(', ')}]`, tone: 'accent' },
        { label: 'size / capacity', value: `${state.size} / ${cells.length}`, tone: state.size >= cells.length ? 'warning' : 'success' },
        { label: 'arr[k] 地址', value: `首地址 + k × ${ELEMENT_BYTES}B` },
        { label: '随机访问', value: 'O(1)(一条公式)', tone: 'success' },
        { label: '中间插入/删除', value: '移位 · O(n)', tone: 'warning' },
        { label: '尾部追加', value: '均摊 O(1)', tone: 'success' },
        { label: '扩容次数', value: `${state.resizes} 次(累计拷贝 ${state.copied} 个)`, tone: state.resizes ? 'warning' : 'default' },
        { label: '二分查找', value: '有序时 O(log n)(需连续内存随机访问)' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'append', label: '尾部追加(随机值)', description: '满容量时自动翻倍扩容。' },
      {
        name: 'insert-head',
        label: '头部插入(随机值)',
        description: '全体后移 —— 最贵的插入位置。',
        danger: true,
      },
      {
        name: 'remove-head',
        label: '头部删除',
        description: '全体前移补洞。',
        danger: true,
      },
      {
        name: 'access',
        label: '按下标访问',
        params: [{ name: 'index', label: '下标', type: 'number', min: 0, max: 7, placeholder: '2' }],
      },
      { name: 'reset', label: '复位为 [3, 7, 12]' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: ArrayState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    const randVal = () => Math.floor(Math.random() * 90) + 10
    switch (name) {
      case 'append':
        apply(append(base(), randVal()))
        break
      case 'insert-head':
        apply(insertAt(base(), 0, randVal()))
        break
      case 'remove-head':
        apply(removeAt(base(), 0))
        break
      case 'access': {
        const idx = Math.round(Number(params?.index ?? 0))
        if (Number.isFinite(idx) && idx >= 0 && idx < base().size) apply(accessAt(base(), idx))
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
  create: () => new ArrayScene(),
}

export default sceneModule
