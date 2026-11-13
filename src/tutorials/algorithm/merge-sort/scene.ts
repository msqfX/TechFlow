import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { createMergeState, mergeStep } from './model'
import type { MergeState } from './model'

/** 归并排序场景:arr 行 + aux 行 + 游程括弧 + i/j 指针 */

const VIEW = { width: 840, height: 560 }
const BOX_X0 = 80
const BOX_W = 100
const BOX_STEP = 120
const ARR_Y = 150
const AUX_Y = 340
const BOX_H = 52
const MAX_BOXES = 6

class MergeSortScene extends BaseScene<MergeState> {
  private arrBoxes: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; idx: SVGTextElement }> = []
  private auxBoxes: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }> = []
  private runBracket: SVGPathElement | null = null
  private runLabel: SVGTextElement | null = null
  private iArrow: SVGPathElement | null = null
  private jArrow: SVGPathElement | null = null
  private copyArrow: SVGPathElement | null = null
  private counters: SVGTextElement[] = []
  private array = [5, 3, 8, 1, 4, 7]

  constructor() {
    super({ id: 'merge-sort', viewBox: VIEW, label: '归并排序自底向上合并' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    renderer.el('text', { x: BOX_X0, y: ARR_Y - 36, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      'arr(原数组,合并结果回写到这里)'
    this.arrBoxes = []
    for (let i = 0; i < MAX_BOXES; i++) {
      const x = BOX_X0 + i * BOX_STEP
      const g = renderer.el('g', {}, renderer.layerNodes)
      const rect = renderer.el('rect', { x, y: ARR_Y, width: BOX_W, height: BOX_H, rx: 8, class: 'tf-jvm-frame' }, g)
      const text = renderer.el('text', { x: x + BOX_W / 2, y: ARR_Y + BOX_H / 2 + 6, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g)
      const idx = renderer.el('text', { x: x + BOX_W / 2, y: ARR_Y + BOX_H + 24, 'text-anchor': 'middle', class: 'tf-label--muted' }, g)
      idx.textContent = `[${i}]`
      g.style.opacity = '0'
      this.arrBoxes.push({ g, rect, text, idx })
    }

    renderer.el('text', { x: BOX_X0, y: AUX_Y - 36, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      'aux(辅助数组,O(n) 额外空间 —— 归并的代价)'
    this.auxBoxes = []
    for (let i = 0; i < MAX_BOXES; i++) {
      const x = BOX_X0 + i * BOX_STEP
      const g = renderer.el('g', {}, renderer.layerNodes)
      const rect = renderer.el('rect', { x, y: AUX_Y, width: BOX_W, height: BOX_H, rx: 8, class: 'tf-jvm-frame', 'stroke-dasharray': '4 3' }, g)
      const text = renderer.el('text', { x: x + BOX_W / 2, y: AUX_Y + BOX_H / 2 + 6, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g)
      g.style.opacity = '0'
      this.auxBoxes.push({ g, rect, text })
    }

    // 回写箭头(合并完成后 aux → arr)
    this.copyArrow = renderer.el('path', { class: 'tf-bar-link', fill: 'none', stroke: 'var(--success)' }, renderer.layerOverlay)
    this.copyArrow.setAttribute('d', `M ${VIEW.width / 2} ${AUX_Y - 60} v 40 M ${VIEW.width / 2 - 5} ${AUX_Y - 26} l 5 6 l 5 -6`)
    this.copyArrow.style.opacity = '0'
    renderer.el('text', { x: VIEW.width / 2 + 12, y: AUX_Y - 34, class: 'tf-label--mono' }, renderer.layerLabels).textContent = '回写'

    this.runBracket = renderer.el('path', { class: 'tf-window-bracket', fill: 'none' }, renderer.layerOverlay)
    this.runLabel = renderer.el('text', { class: 'tf-label--mono' }, renderer.layerLabels)
    this.iArrow = renderer.el('path', { class: 'tf-bar-link', fill: 'none', stroke: 'var(--accent-bright)' }, renderer.layerOverlay)
    this.jArrow = renderer.el('path', { class: 'tf-bar-link', fill: 'none', stroke: 'var(--warning)' }, renderer.layerOverlay)

    const countersG = renderer.el('g', {}, renderer.layerLabels)
    ;['比较', '写入'].forEach((t, i) => {
      renderer.el('text', { x: 600 + i * 110, y: ARR_Y - 36, class: 'tf-label--muted' }, countersG).textContent = t
      const v = renderer.el('text', { x: 650 + i * 110, y: ARR_Y - 36, class: 'tf-subnet-mono' }, countersG)
      this.counters.push(v)
    })

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '自底向上:游程 1→2→4 翻倍;蓝箭头 i 取左、黄箭头 j 取右,相等取左(稳定)', kind: 'muted' })
  }

  protected buildSteps() {
    const arr = this.array
    const steps: SceneStep[] = [
      {
        id: 'intro',
        title: '自底向上:每个元素都是长度 1 的有序游程',
        description: `[${arr.join(', ')}] —— 游程宽度 1 → 2 → 4 → …`,
        explanation: `归并排序的迭代写法:开始时**每个元素自己就是有序游程**(长度 1);两两合并成长度 2 的游程,再合并成 4……宽度翻倍 log n 轮后覆盖全数组。下方虚线框是**辅助数组 aux** —— merge 的写入目标,也是归并 O(n) 空间代价的来源。`,
        duration: 1200,
        action: 'intro',
      },
      {
        id: 'merge-demo',
        title: '合并 [0..2):第一次 merge',
        description: '双指针比较两侧游程头部,取小者写入 aux。',
        explanation: `merge 的规则:**比较左右游程的头部,取小者写入 aux**,对应指针右移。注意蓝色 i 是左游程指针、黄色 j 是右游程指针 —— **相等时取左**,左半区元素保持在前,这就是归并**稳定**的原因。一侧耗尽后另一侧剩余直接接上。`,
        duration: 1500,
        action: 'merge-demo',
      },
      {
        id: 'copyback',
        title: '回写:aux → arr',
        description: '合并结果从辅助数组拷回原数组。',
        explanation: `一段合并完成后把 aux 的内容**回写**到 arr 对应区间 —— 来回拷贝就是归并 O(n) 空间与缓存劣势的来源。对照快排:快排完全原地,基准一次归位,不用辅助数组。`,
        duration: 1300,
        action: 'copyback',
      },
      {
        id: 'width-doubles',
        title: '宽度翻倍:有序游程 2 → 4',
        description: '每轮扫描总计 O(n),轮数 log₂n。',
        explanation: `游程宽度翻倍:上一轮所有长度 2 的游程现在两两合并成长度 4。每轮都完整扫描数组一遍 = O(n),共 log₂n 轮 → **O(n log n)**。而且无论输入多糟糕(已有序/逆序/随机),这个界**永远成立** —— 归并没有快排那种 O(n²) 最坏退化。`,
        duration: 1400,
        action: 'width-doubles',
      },
      {
        id: 'conclusion',
        title: '归并完成:稳定且无最坏退化',
        description: `数组有序;总比较 ${'约 n·log n'} 次。`,
        explanation: `对照《快速排序》:**归并稳定(相等取左)、O(n log n) 有保证**;代价是 O(n) 辅助数组与来回拷贝。工程映射:Java 对象排序(TimSort)、数据库外部排序选归并系(要稳定/要最坏可控);追求平均速度与原地内存选快排系 —— 场景匹配,没有绝对赢家。`,
        duration: 1200,
        action: 'conclusion',
      },
    ]

    const transitions: StepTransition<MergeState>[] = [
      () => createMergeState(arr),
      s => mergeStep(s),
      s => mergeStep(s),
      s => mergeStep(s),
      s => mergeStep(s),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): MergeState {
    return createMergeState(this.array)
  }

  private effectiveState(stepState: MergeState): MergeState {
    return this.live ?? stepState
  }

  private live: MergeState | null = null

  protected render(stepState: MergeState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    const inRun = (i: number) => i >= state.lo && i < state.hi

    // arr 行
    for (let i = 0; i < this.arrBoxes.length; i++) {
      const box = this.arrBoxes[i]
      if (!box) continue
      const v = state.arr[i]
      const target = v !== undefined ? '1' : '0'
      if (box.text) box.text.textContent = v !== undefined ? String(v) : ''
      if (box.rect) {
        let cls = 'tf-jvm-frame'
        if (state.phase === 'done') cls += ' is-sorted-frame'
        else if (inRun(i) && state.i === i) cls += ' is-top'
        else if (inRun(i) && state.j === i) cls += ' is-front'
        box.rect.setAttribute('class', cls)
      }
      if (tl) tl.to(box.g, { opacity: target, duration: 0.25 }, i * 0.05)
      else box.g.style.opacity = target
    }

    // aux 行
    for (let i = 0; i < this.auxBoxes.length; i++) {
      const box = this.auxBoxes[i]
      if (!box) continue
      const v = state.aux[i]
      const show = i < state.arr.length && state.aux[i] !== null
      const target = show ? '1' : '0'
      if (box.text) box.text.textContent = show ? String(v) : ''
      if (tl) tl.to(box.g, { opacity: target, duration: 0.2 }, i * 0.04)
      else box.g.style.opacity = target
    }

    // 游程括弧
    if (this.runBracket && this.runLabel) {
      if (state.phase !== 'done' && state.lo < state.arr.length) {
        const left = BOX_X0 + state.lo * BOX_STEP - 6
        const right = BOX_X0 + (state.hi - 1) * BOX_STEP + BOX_W + 6
        const w = right - left
        this.runBracket.style.opacity = '1'
        this.runBracket.setAttribute('d', `M ${left} ${ARR_Y - 14} h ${w} M ${left} ${ARR_Y - 14} v 8 M ${left + w} ${ARR_Y - 14} v 8`)
        this.runLabel.textContent = `合并 [${state.lo}..${state.hi})(宽度 ${state.width})`
        this.runLabel.setAttribute('x', String(left + w / 2))
        this.runLabel.setAttribute('y', String(ARR_Y - 22))
        this.runLabel.setAttribute('text-anchor', 'middle')
      } else {
        this.runBracket.style.opacity = '0'
        this.runLabel.textContent = ''
      }
    }

    // i / j 箭头
    const arrowY = ARR_Y + BOX_H + 42
    if (this.iArrow) {
      if (state.phase === 'take' && state.i < state.mid && state.i < MAX_BOXES) {
        const x = BOX_X0 + state.i * BOX_STEP + BOX_W / 2
        this.iArrow.style.opacity = '1'
        this.iArrow.setAttribute('d', `M ${x} ${arrowY} v 12 M ${x - 5} ${arrowY + 7} l 5 5 l 5 -5`)
      } else {
        this.iArrow.style.opacity = '0'
      }
    }
    if (this.jArrow) {
      if (state.phase === 'take' && state.j < state.hi && state.j >= state.mid && state.j < MAX_BOXES) {
        const x = BOX_X0 + state.j * BOX_STEP + BOX_W / 2
        this.jArrow.style.opacity = '1'
        this.jArrow.setAttribute('d', `M ${x} ${arrowY} v 12 M ${x - 5} ${arrowY + 7} l 5 5 l 5 -5`)
      } else {
        this.jArrow.style.opacity = '0'
      }
    }

    // 回写箭头
    if (this.copyArrow) {
      this.copyArrow.style.opacity = state.phase === 'copyback' ? '1' : '0'
    }

    const counters = [String(state.comparisons), String(state.writes)]
    this.counters.forEach((el, i) => {
      el.textContent = counters[i] ?? ''
    })
  }

  protected snapshotData(stepState: MergeState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    return {
      rows: [
        { label: '数组', value: `[${state.arr.join(', ')}]`, tone: 'accent' },
        { label: '游程宽度', value: `${state.width}(轮次 ${state.width >= state.arr.length ? 'log n' : Math.max(1, Math.round(Math.log2(state.width || 1)) + 1)})` },
        { label: '当前段', value: state.phase === 'done' ? '(完成)' : `[${state.lo}..${state.hi})`, tone: 'accent' },
        { label: '指针 i / j', value: state.phase === 'take' ? `${state.i} / ${state.j}` : '—' },
        { label: '辅助数组 aux', value: state.aux.some(v => v !== null) ? `[${state.aux.map(v => (v === null ? '·' : v)).join(', ')}]` : '(空)', tone: 'warning' },
        { label: '比较次数', value: String(state.comparisons), tone: 'warning' },
        { label: '写入次数', value: String(state.writes) },
        { label: '保证', value: 'O(n log n) 无最坏退化 · 稳定', tone: 'success' },
        { label: '代价', value: 'O(n) 辅助数组(对照快排:原地)' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'step', label: '推进一个 merge 微操作' },
      {
        name: 'set-array',
        label: '换一组数组(6 个元素)',
        params: [
          { name: 'a', label: '元素1', type: 'number', min: 0, max: 9, placeholder: '5' },
          { name: 'b', label: '元素2', type: 'number', min: 0, max: 9, placeholder: '3' },
          { name: 'c', label: '元素3', type: 'number', min: 0, max: 9, placeholder: '8' },
          { name: 'd', label: '元素4', type: 'number', min: 0, max: 9, placeholder: '1' },
          { name: 'e', label: '元素5', type: 'number', min: 0, max: 9, placeholder: '4' },
          { name: 'f', label: '元素6', type: 'number', min: 0, max: 9, placeholder: '7' },
        ],
      },
      {
        name: 'sorted-input',
        label: '载入已有序数组',
        description: '归并没有 O(n²) 退化:步数几乎不变(对照快排挑战)。',
      },
      { name: 'reset', label: '复位' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: MergeState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'step':
        apply(mergeStep(base()))
        break
      case 'set-array': {
        const vals = ['a', 'b', 'c', 'd', 'e', 'f'].map(k => Math.min(9, Math.max(0, Math.round(Number(params?.[k] ?? 0)))))
        if (vals.every(Number.isFinite)) {
          this.array = vals
          this.rebuild()
        }
        break
      }
      case 'sorted-input':
        this.array = [1, 2, 3, 4, 5, 6]
        this.rebuild()
        break
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
  create: () => new MergeSortScene(),
}

export default sceneModule
