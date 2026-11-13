import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { createQuickState, quickFinished, quickStep } from './model'
import type { QuickState } from './model'

/** 快速排序场景:柱状图 + 基准高亮 + 区间括弧 + 递归栈可视化 */

const VIEW = { width: 840, height: 480 }
const TEACHING_ARRAY = [5, 3, 8, 1, 4, 7]
const BAR_X0 = 70
const BAR_W = 110
const BAR_STEP = 124
const BAR_BASE = 300
const BAR_MAX_H = 180

class QuickSortScene extends BaseScene<QuickState> {
  private bars: Array<{ rect: SVGRectElement; text: SVGTextElement; idx: SVGTextElement }> = []
  private rangeBracket: SVGPathElement | null = null
  private rangeLabel: SVGTextElement | null = null
  private pivotArrow: SVGPathElement | null = null
  private jArrow: SVGPathElement | null = null
  private counters: SVGTextElement[] = []
  private stackChips: SVGTextElement[] = []
  private array = TEACHING_ARRAY

  constructor() {
    super({ id: 'quick-sort', viewBox: VIEW, label: '快速排序分区动画' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.bars = []
    for (let i = 0; i < 6; i++) {
      const x = BAR_X0 + i * BAR_STEP
      const rect = renderer.el('rect', { x, width: BAR_W, rx: 8, class: 'tf-bar' }, renderer.layerNodes)
      const text = renderer.el('text', { x: x + BAR_W / 2, class: 'tf-bar-value', 'text-anchor': 'middle' }, renderer.layerNodes)
      const idx = renderer.el('text', { x: x + BAR_W / 2, y: BAR_BASE + 26, class: 'tf-label--muted', 'text-anchor': 'middle' }, renderer.layerLabels)
      idx.textContent = `arr[${i}]`
      this.bars.push({ rect, text, idx })
    }

    this.rangeBracket = renderer.el('path', { class: 'tf-window-bracket', fill: 'none' }, renderer.layerOverlay)
    this.rangeLabel = renderer.el('text', { class: 'tf-label--mono' }, renderer.layerLabels)
    this.pivotArrow = renderer.el('path', { class: 'tf-bar-link', fill: 'none', stroke: 'var(--accent-purple)' }, renderer.layerOverlay)
    this.jArrow = renderer.el('path', { class: 'tf-bar-link', fill: 'none', stroke: 'var(--warning)' }, renderer.layerOverlay)

    new Label(renderer, { x: BAR_X0, y: 60, text: '分治:选基准(紫)→ 小的换到左边 → 基准归位 → 递归两侧', kind: 'muted', anchor: 'start' })

    const countersG = renderer.el('g', {}, renderer.layerLabels)
    ;['比较', '交换', '已归位', '递归栈'].forEach((t, i) => {
      renderer.el('text', { x: 70 + i * 190, y: 92, class: 'tf-label--muted' }, countersG).textContent = t
      const v = renderer.el('text', { x: 130 + i * 190, y: 92, class: 'tf-subnet-mono' }, countersG)
      this.counters.push(v)
    })

    // 递归栈芯片
    this.stackChips = []
    for (let i = 0; i < 4; i++) {
      const chip = renderer.el('text', { x: 640 + i * 52, y: 114, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, renderer.layerLabels)
      this.stackChips.push(chip)
    }

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '每层扫描 O(n),递归 log n 层 → O(n log n);已归位(绿色)= 最终位置', kind: 'muted' })
  }

  protected buildSteps() {
    const arr = this.array
    const steps: SceneStep[] = [
      {
        id: 'intro',
        title: '初始数组',
        description: `[${arr.join(', ')}] —— 分治三步:选基准、分区、递归。`,
        explanation:
          '快速排序的每一步:**① 选基准**(这里取区间末尾元素,紫色箭头标记);**② 分区**(Lomuto:扫描指针 j 扫一遍,小于基准的元素交换到左侧分界 i 之前);**③ 基准归位**(落在它的最终位置,绿色)。然后对左右两个子区间递归。点击下一步逐帧执行。',
        duration: 1000,
        action: 'intro',
      },
    ]
    const transitions: StepTransition<QuickState>[] = [() => createQuickState(arr)]

    let st = createQuickState(arr)
    let guard = 0
    let scanInPartition = 0
    while (!quickFinished(st) && guard < 200) {
      const before = st
      st = quickStep(st)
      const logLine = st.log[st.log.length - 1] ?? ''
      let title: string
      let explanation: string
      const newPlace = st.sorted.length > before.sorted.length
      if (newPlace) {
        title = `基准归位(第 ${st.sorted.length} 个)`
        explanation = `**分区完成**:基准被交换到分界处,它的最终位置就此确定(绿色)—— 左边全小于它、右边全大于它。两个子区间进入递归栈。这与归并排序相反:快排「先处理、后递归」,基准一次到位。`
        scanInPartition = 0
      } else if (logLine.includes('取区间')) {
        title = '取下一个区间,选基准'
        explanation = `从递归栈弹出下一个待分区区间。**基准取区间末尾元素**(紫色箭头)。扫描指针 j 从区间左端出发,分界指针 i 标记「小于基准的区域」的右边界。`
        scanInPartition = 0
      } else if (logLine.includes('天然有序')) {
        title = '子区间长度 ≤ 1:天然有序'
        explanation = '递归的终止条件:区间只剩 0 或 1 个元素时无需任何操作 —— 它们已经在正确位置上。'
      } else if (logLine.includes('留在右侧')) {
        title = `扫描:≥ 基准,不动`
        explanation = `扫描指针 j 处的元素**不小于基准**,它属于右侧区域 —— 不动,j 继续右移。分界 i 不变。`
        scanInPartition += 1
      } else if (logLine.includes('已在分界处')) {
        title = '扫描:< 基准,原地即左区'
        explanation = '该元素小于基准且恰好已在分界位置 —— 无需交换,i 和 j 同时右移。'
        scanInPartition += 1
      } else {
        title = `扫描:小于基准,交换到左侧`
        explanation = `扫描指针 j 发现一个**小于基准**的元素,把它交换到分界指针 i 的位置 ——「小的都挤到左边」正是 Lomuto 分区的核心动作。交换后 i 右移一格(左区扩大),j 继续扫描。`
        scanInPartition += 1
      }
      void scanInPartition
      const stepIdx = steps.length
      steps.push({
        id: `step-${stepIdx}`,
        title,
        description: logLine,
        explanation,
        duration: 900,
        action: st.phase,
      })
      transitions.push(s => quickStep(s))
    }

    steps.push({
      id: 'conclusion',
      title: '排序完成:数一数比较次数',
      description: `共 ${st.comparisons} 次比较、${st.swaps} 次交换。`,
      explanation: `n=6 时约 11 次比较 —— 理论上平均 **n·log₂n ≈ 15** 次以内。对比冒泡的 15 次(n=6)优势还不明显,但 n=100 时是 **~600 vs 4950**。代价:快排是**不稳定排序**,且基准选得差(如已有序数组固定取末尾)会退化到 O(n²) —— 工程上用随机基准/三数取中规避。`,
      duration: 1200,
      action: 'conclusion',
    })
    transitions.push(s => ({ ...s, log: [...s.log, `最终结果:[${s.arr.join(', ')}]`] }))

    return { steps, transitions }
  }

  protected buildInitialState(): QuickState {
    return createQuickState(this.array)
  }

  private effectiveState(stepState: QuickState): QuickState {
    return this.live ?? stepState
  }

  private live: QuickState | null = null

  protected render(stepState: QuickState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline
    const cur = state.cur

    for (let i = 0; i < this.bars.length; i++) {
      const bar = this.bars[i]
      if (!bar) continue
      const v = state.arr[i] ?? 0
      const h = (v / 8) * BAR_MAX_H
      let cls = 'tf-bar'
      if (state.sorted.includes(i)) cls += ' is-sorted'
      else if (cur && i === state.pivotIdx) cls += ' is-pivot'
      else if (cur && i === state.j) cls += state.phase === 'scan' ? ' is-active' : ' is-swap'
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

    // 区间括弧
    if (this.rangeBracket && this.rangeLabel) {
      if (cur) {
        const left = BAR_X0 + cur.lo * BAR_STEP - 6
        const right = BAR_X0 + cur.hi * BAR_STEP + BAR_W + 6
        const w = right - left
        this.rangeBracket.style.opacity = '1'
        this.rangeBracket.setAttribute('d', `M ${left} ${BAR_BASE + 44} h ${w} M ${left} ${BAR_BASE + 44} v 8 M ${left + w} ${BAR_BASE + 44} v 8`)
        this.rangeLabel.textContent = `当前区间 [${cur.lo}..${cur.hi}]`
        this.rangeLabel.setAttribute('x', String(left + w / 2))
        this.rangeLabel.setAttribute('y', String(BAR_BASE + 72))
        this.rangeLabel.setAttribute('text-anchor', 'middle')
      } else {
        this.rangeBracket.style.opacity = '0'
        this.rangeLabel.textContent = ''
      }
    }

    // 指针箭头
    const arrowY = BAR_BASE - 8
    if (this.pivotArrow && cur && state.pivotIdx !== null) {
      const x = BAR_X0 + state.pivotIdx * BAR_STEP + BAR_W / 2
      this.pivotArrow.style.opacity = '1'
      this.pivotArrow.setAttribute('d', `M ${x} ${arrowY - 14} v 10 M ${x - 5} ${arrowY - 9} l 5 5 l 5 -5`)
    } else if (this.pivotArrow) {
      this.pivotArrow.style.opacity = '0'
    }
    if (this.jArrow && cur) {
      const x = BAR_X0 + state.j * BAR_STEP + BAR_W / 2
      this.jArrow.style.opacity = '1'
      this.jArrow.setAttribute('d', `M ${x} ${arrowY + 42} v 10 M ${x - 5} ${arrowY + 47} l 5 5 l 5 -5`)
    } else if (this.jArrow) {
      this.jArrow.style.opacity = '0'
    }

    // 计数与递归栈
    const stackLabel = state.stack.map(r => `[${r.lo}..${r.hi}]`)
    const counters = [String(state.comparisons), String(state.swaps), `${state.sorted.length}/${state.arr.length}`, `${state.stack.length} 个`]
    this.counters.forEach((el, i) => {
      el.textContent = counters[i] ?? ''
    })
    this.stackChips.forEach((chip, i) => {
      chip.textContent = stackLabel[i] ?? ''
      chip.setAttribute('class', `tf-subnet-mono ${i === 0 && stackLabel.length ? 'ok' : ''}`)
    })
  }

  protected snapshotData(stepState: QuickState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const cur = state.cur
    return {
      rows: [
        { label: '当前数组', value: `[${state.arr.join(', ')}]`, tone: 'accent' },
        { label: '当前区间', value: cur ? `[${cur.lo}..${cur.hi}]` : '(无)', tone: cur ? 'accent' : 'default' },
        { label: '基准', value: state.pivotIdx !== null ? `arr[${state.pivotIdx}] = ${state.arr[state.pivotIdx]}` : '(未选)', tone: 'accent' },
        { label: '指针 i / j', value: cur ? `${state.i} / ${state.j}` : '—' },
        { label: '已归位', value: state.sorted.length ? state.sorted.map(i => `arr[${i}]=${state.arr[i]}`).join(', ') : '(无)', tone: 'success' },
        { label: '递归栈', value: state.stack.length ? state.stack.map(r => `[${r.lo}..${r.hi}]`).join(' | ') : '(空)' },
        { label: '比较次数', value: String(state.comparisons), tone: 'warning' },
        { label: '交换次数', value: String(state.swaps) },
        { label: '状态', value: quickFinished(state) ? '排序完成' : state.phase === 'scan' ? '分区扫描中' : '递归中', tone: quickFinished(state) ? 'success' : 'accent' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
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
        label: '载入已有序数组(挑战)',
        description: '固定取末尾基准时,已有序输入会让分区一边倒 —— 观察 O(n²) 退化。',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    if (name === 'set-array') {
      const keys = ['a', 'b', 'c', 'd', 'e', 'f']
      const vals = keys.map(k => Math.min(9, Math.max(0, Math.round(Number(params?.[k] ?? 0)))))
      if (vals.every(Number.isFinite)) {
        this.array = vals
        this.rebuild()
      }
      return
    }
    if (name === 'sorted-input') {
      this.array = [1, 2, 3, 4, 5, 6]
      this.rebuild()
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new QuickSortScene(),
}

export default sceneModule
