import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { bubbleStep, createBubbleState, isSorted } from './model'
import type { BubbleState } from './model'

/** 冒泡排序场景:柱状图 + 比较对高亮 + 有序后缀生长 */

const VIEW = { width: 840, height: 460 }
const TEACHING_ARRAY = [5, 3, 8, 1, 4]
const BAR_X0 = 90
const BAR_W = 130
const BAR_STEP = 150
const BAR_BASE = 300
const BAR_MAX_H = 190

class BubbleSortScene extends BaseScene<BubbleState> {
  private bars: Array<{ rect: SVGRectElement; text: SVGTextElement; idx: SVGTextElement }> = []
  private compareArc: SVGPathElement | null = null
  private counters: SVGTextElement[] = []
  /** 教学数组(实验面板可替换) */
  private array = TEACHING_ARRAY

  constructor() {
    super({ id: 'bubble-sort', viewBox: VIEW, label: '冒泡排序柱状动画' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.bars = []
    for (let i = 0; i < this.array.length; i++) {
      const x = BAR_X0 + i * BAR_STEP
      const rect = renderer.el('rect', { x, width: BAR_W, rx: 8, class: 'tf-bar' }, renderer.layerNodes)
      const text = renderer.el('text', { x: x + BAR_W / 2, class: 'tf-bar-value', 'text-anchor': 'middle' }, renderer.layerNodes)
      const idx = renderer.el('text', { x: x + BAR_W / 2, y: BAR_BASE + 26, class: 'tf-label--muted', 'text-anchor': 'middle' }, renderer.layerLabels)
      idx.textContent = `arr[${i}]`
      this.bars.push({ rect, text, idx })
    }

    this.compareArc = renderer.el('path', { class: 'tf-bar-link', fill: 'none' }, renderer.layerOverlay)

    new Label(renderer, { x: BAR_X0, y: 60, text: '每一轮:从左到右相邻比较,逆序就交换 —— 最大的值冒到最右', kind: 'muted', anchor: 'start' })
    const countersG = renderer.el('g', {}, renderer.layerLabels)
    ;['比较次数', '交换次数', '有序后缀'].forEach((t, i) => {
      renderer.el('text', { x: 60 + i * 240, y: 90, class: 'tf-label--muted' }, countersG).textContent = t
      const v = renderer.el('text', { x: 150 + i * 240, y: 90, class: 'tf-subnet-mono' }, countersG)
      this.counters.push(v)
    })
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: 'n=5 → 比较 n(n-1)/2 = 10 次;右侧绿色 = 已归位的有序后缀', kind: 'muted' })
  }

  protected buildSteps() {
    // 由模型自动生成微步骤(基于当前教学数组)
    const steps: SceneStep[] = [
      {
        id: 'intro',
        title: '初始数组',
        description: `[${this.array.join(', ')}] —— 相邻比较,逆序交换。`,
        explanation:
          '冒泡排序规则:**从左到右两两比较相邻元素,逆序就交换**。一轮走完最大的元素被「冒泡」到最右端;重复 n-1 轮即可全部有序。点击下一步开始逐帧执行(每步 = 一次比较,可能伴随交换)。',
        duration: 1000,
        action: 'intro',
      },
    ]
    const arr = this.array
    const transitions: StepTransition<BubbleState>[] = [() => createBubbleState(arr)]

    let st = createBubbleState(arr)
    let passShown = 1
    let guard = 0
    let cmpInPass = 0
    while (st.phase !== 'done' && guard < 120) {
      const before = st
      st = bubbleStep(st)
      const li = st.log.length - 1
      const logLine = st.log[li] ?? ''
      const isPassEnd = st.sortedFrom < before.sortedFrom || (st.phase === 'done' && !st.swappedThisPass)
      let title: string
      let explanation: string
      if (isPassEnd && st.phase === 'done' && !st.swappedThisPass && before.swappedThisPass === false) {
        title = `第 ${before.pass} 轮结束:无交换,提前终止`
        explanation =
          '**提前终止优化**:这一轮一次交换都没发生,说明数组已经完全有序 —— 立即结束,不用跑满 n-1 轮。对几乎有序的输入,这让冒泡接近 O(n)。这也是冒泡「稳定且易优化」的体现。'
      } else if (isPassEnd) {
        title = `第 ${passShown} 轮完成:最大值归位`
        explanation = `本轮走完,**当前最大值被冒泡到有序边界** —— 有序后缀向左生长一格(图中绿色区域)。下一轮的比较范围缩短 1:总比较次数是 (n-1)+(n-2)+…+1 = n(n-1)/2,这就是 O(n²) 的来源。`
        passShown += 1
        cmpInPass = 0
      } else if (st.phase === 'swap') {
        title = `比较并交换(第 ${passShown} 轮)`
        explanation = `**逆序 → 交换**:左边的值大于右边,交换两者。交换后较大的值向右移动一格 —— 它正被「冒泡」着推向终点。注意相等元素不交换,所以冒泡是**稳定排序**。`
        cmpInPass += 1
      } else {
        title = `比较(第 ${passShown} 轮)`
        explanation = `**顺序 → 不动**:左边不大于右边,两个元素保持原位,扫描指针右移。继续比较下一对。`
        cmpInPass += 1
      }
      void logLine
      const stepIdx = steps.length
      steps.push({
        id: `step-${stepIdx}`,
        title,
        description: logLine,
        explanation,
        duration: 900,
        action: st.phase,
      })
      transitions.push(s => bubbleStep(s))
    }

    steps.push({
      id: 'conclusion',
      title: '排序完成:数一数比较次数',
      description: `共 ${st.comparisons} 次比较、${st.swaps} 次交换。`,
      explanation: `n=5 时比较 **n(n-1)/2 = 10** 次 —— O(n²)。若换快速排序,同样 5 个元素只需约 7~9 次比较;100 个元素时差距变成 4950 vs ~600 次。点右侧「实验操作」换一组数组,或继续学习《快速排序》看分治如何打破这个平方壁垒。`,
      duration: 1200,
      action: 'conclusion',
    })
    transitions.push(s => ({ ...s, log: [...s.log, `最终结果:[${s.arr.join(', ')}] — ${isSorted(s.arr) ? '有序 ✓' : '未有序!'}`] }))

    return { steps, transitions }
  }

  protected buildInitialState(): BubbleState {
    return createBubbleState(this.array)
  }

  private effectiveState(stepState: BubbleState): BubbleState {
    return this.live ?? stepState
  }

  private live: BubbleState | null = null

  protected render(stepState: BubbleState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    for (let i = 0; i < this.bars.length; i++) {
      const bar = this.bars[i]
      if (!bar) continue
      const v = state.arr[i] ?? 0
      const h = (v / 8) * BAR_MAX_H
      const inSuffix = i >= state.sortedFrom
      const isCompare = state.j === i || state.j + 1 === i
      let cls = 'tf-bar'
      if (inSuffix) cls += ' is-sorted'
      else if (isCompare) cls += state.phase === 'swap' ? ' is-swap' : ' is-active'
      bar.rect.setAttribute('class', cls)
      if (tl) {
        tl.to(bar.rect, { attr: { y: BAR_BASE - h, height: h }, duration: 0.35, ease: 'power2.out' }, 0)
        tl.to(bar.text, { attr: { y: BAR_BASE - h - 12 }, duration: 0.35 }, 0)
      } else {
        bar.rect.setAttribute('y', String(BAR_BASE - h))
        bar.rect.setAttribute('height', String(h))
        bar.text.setAttribute('y', String(BAR_BASE - h - 12))
      }
      bar.text.textContent = String(v)
    }

    // 比较对弧线
    if (this.compareArc) {
      const x1 = BAR_X0 + state.j * BAR_STEP
      const x2 = x1 + BAR_W + (BAR_STEP - BAR_W)
      const y = BAR_BASE + 48
      const show = state.phase !== 'done' && state.j + 1 < state.sortedFrom
      this.compareArc.style.opacity = show ? '1' : '0'
      this.compareArc.setAttribute('d', `M ${x1} ${y} H ${x2}`)
      this.compareArc.setAttribute('stroke', state.phase === 'swap' ? 'var(--danger)' : 'var(--warning)')
    }

    const counters = [String(state.comparisons), String(state.swaps), `${state.arr.length - state.sortedFrom} 个`]
    this.counters.forEach((el, i) => {
      el.textContent = counters[i] ?? ''
    })
  }

  protected snapshotData(stepState: BubbleState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    return {
      rows: [
        { label: '当前数组', value: `[${state.arr.join(', ')}]`, tone: 'accent' },
        { label: '轮次', value: `第 ${state.pass} 轮` },
        { label: '比较位置', value: state.phase === 'done' ? '(完成)' : `arr[${state.j}] ↔ arr[${state.j + 1}]` },
        { label: '比较次数', value: `${state.comparisons} / ${((state.arr.length * (state.arr.length - 1)) / 2).toString()}(上界)`, tone: 'warning' },
        { label: '交换次数', value: String(state.swaps) },
        { label: '有序后缀', value: state.sortedFrom >= state.arr.length ? '(无)' : `arr[${state.sortedFrom}..](${state.arr.length - state.sortedFrom} 个)` },
        { label: '本轮已交换', value: state.swappedThisPass ? '是' : '否(可能提前终止)' },
        { label: '状态', value: state.phase === 'done' ? '排序完成' : state.phase === 'swap' ? '刚发生交换' : '比较中', tone: state.phase === 'done' ? 'success' : 'accent' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-array',
        label: '换一组数组',
        description: '自定义 5 个元素(0~8),重新逐帧执行。',
        params: [
          { name: 'a', label: '元素1', type: 'number', min: 0, max: 8, placeholder: '5' },
          { name: 'b', label: '元素2', type: 'number', min: 0, max: 8, placeholder: '3' },
          { name: 'c', label: '元素3', type: 'number', min: 0, max: 8, placeholder: '8' },
          { name: 'd', label: '元素4', type: 'number', min: 0, max: 8, placeholder: '1' },
          { name: 'e', label: '元素5', type: 'number', min: 0, max: 8, placeholder: '4' },
        ],
      },
      { name: 'presorted', label: '载入几乎有序的数组', description: '观察提前终止优化:一轮无交换立即结束。' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    if (name === 'set-array') {
      const vals = ['a', 'b', 'c', 'd', 'e'].map(k => Math.min(8, Math.max(0, Math.round(Number(params?.[k] ?? 0)))))
      if (vals.every(Number.isFinite)) {
        this.array = vals
        this.rebuild()
      }
      return
    }
    if (name === 'presorted') {
      this.array = [1, 2, 3, 5, 4]
      this.rebuild()
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new BubbleSortScene(),
}

export default sceneModule
