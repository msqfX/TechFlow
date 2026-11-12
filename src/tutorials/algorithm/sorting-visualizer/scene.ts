import { EventBus } from '@/engine/core/EventBus'
import { CanvasRenderer } from '@/engine/renderers/CanvasRenderer'
import type { SceneEventPayloads, PlayerStatus, SceneStateSnapshot, TutorialScene, SceneAction } from '@/engine/types/scene'

/**
 * 排序算法可视化:Canvas 柱状图。
 * 不走步骤状态机 —— 实现 TutorialScene 接口,帧历史支持上一步/跳转。
 */

export type SortAlgo = 'bubble' | 'quick' | 'merge' | 'heap'

export interface SortFrame {
  arr: number[]
  a: number
  b: number
  kind: 'compare' | 'swap' | 'sorted' | 'pivot' | 'done'
  comparisons: number
  swaps: number
}

interface SortingState {
  algorithm: SortAlgo
  size: number
  status: PlayerStatus
  comparisons: number
  swaps: number
  done: boolean
}

function* bubbleSortGen(input: number[]): Generator<SortFrame> {
  const arr = [...input]
  let comparisons = 0
  let swaps = 0
  const n = arr.length
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      comparisons++
      yield { arr: [...arr], a: j, b: j + 1, kind: 'compare', comparisons, swaps }
      if ((arr[j] ?? 0) > (arr[j + 1] ?? 0)) {
        ;[arr[j], arr[j + 1]] = [arr[j + 1]!, arr[j]!]
        swaps++
        yield { arr: [...arr], a: j, b: j + 1, kind: 'swap', comparisons, swaps }
      }
    }
    yield { arr: [...arr], a: n - 1 - i, b: -1, kind: 'sorted', comparisons, swaps }
  }
  yield { arr: [...arr], a: 0, b: -1, kind: 'done', comparisons, swaps }
}

function* quickSortGen(input: number[]): Generator<SortFrame> {
  const arr = [...input]
  let comparisons = 0
  let swaps = 0

  function* partition(lo: number, hi: number): Generator<SortFrame> {
    const pivot = arr[hi] ?? 0
    yield { arr: [...arr], a: hi, b: -1, kind: 'pivot', comparisons, swaps }
    let i = lo
    for (let j = lo; j < hi; j++) {
      comparisons++
      yield { arr: [...arr], a: j, b: hi, kind: 'compare', comparisons, swaps }
      if ((arr[j] ?? 0) < pivot) {
        if (i !== j) {
          ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
          swaps++
          yield { arr: [...arr], a: i, b: j, kind: 'swap', comparisons, swaps }
        }
        i++
      }
    }
    if (i !== hi) {
      ;[arr[i], arr[hi]] = [arr[hi]!, arr[i]!]
      swaps++
      yield { arr: [...arr], a: i, b: hi, kind: 'swap', comparisons, swaps }
    }
    yield { arr: [...arr], a: i, b: -1, kind: 'sorted', comparisons, swaps }
    return i
  }

  function* qs(lo: number, hi: number): Generator<SortFrame> {
    if (lo >= hi) {
      if (lo === hi) yield { arr: [...arr], a: lo, b: -1, kind: 'sorted', comparisons, swaps }
      return
    }
    const gen = partition(lo, hi)
    let p = lo
    for (const frame of gen) {
      if (frame.kind === 'sorted') p = frame.a
      yield frame
    }
    void p
    yield* qs(lo, p - 1)
    yield* qs(p + 1, hi)
  }

  yield* qs(0, arr.length - 1)
  yield { arr: [...arr], a: 0, b: -1, kind: 'done', comparisons, swaps }
}

function* mergeSortGen(input: number[]): Generator<SortFrame> {
  const arr = [...input]
  const aux = [...arr]
  let comparisons = 0
  let swaps = 0

  function* merge(lo: number, mid: number, hi: number): Generator<SortFrame> {
    for (let k = lo; k <= hi; k++) aux[k] = arr[k] ?? 0
    let i = lo
    let j = mid + 1
    for (let k = lo; k <= hi; k++) {
      if (i > mid) {
        arr[k] = aux[j++] ?? 0
      } else if (j > hi) {
        arr[k] = aux[i++] ?? 0
      } else {
        comparisons++
        yield { arr: [...arr], a: i, b: j, kind: 'compare', comparisons, swaps }
        if ((aux[i] ?? 0) <= (aux[j] ?? 0)) arr[k] = aux[i++] ?? 0
        else arr[k] = aux[j++] ?? 0
      }
      swaps++
      yield { arr: [...arr], a: k, b: -1, kind: 'swap', comparisons, swaps }
    }
  }

  function* sort(lo: number, hi: number): Generator<SortFrame> {
    if (lo >= hi) return
    const mid = Math.floor((lo + hi) / 2)
    yield* sort(lo, mid)
    yield* sort(mid + 1, hi)
    yield* merge(lo, mid, hi)
  }

  yield* sort(0, arr.length - 1)
  yield { arr: [...arr], a: 0, b: -1, kind: 'done', comparisons, swaps }
}

function* heapSortGen(input: number[]): Generator<SortFrame> {
  const arr = [...input]
  let comparisons = 0
  let swaps = 0
  const n = arr.length

  function* sift(start: number, end: number): Generator<SortFrame> {
    let root = start
    while (root * 2 + 1 <= end) {
      const child = root * 2 + 1
      const swapAt = (() => {
        comparisons++
        let s = root
        if ((arr[child] ?? 0) > (arr[s] ?? 0)) s = child
        if (child + 1 <= end && (arr[child + 1] ?? 0) > (arr[s] ?? 0)) s = child + 1
        return s
      })()
      yield { arr: [...arr], a: root, b: child + 1 <= end ? child + 1 : child, kind: 'compare', comparisons, swaps }
      if (swapAt === root) return
      ;[arr[root], arr[swapAt]] = [arr[swapAt]!, arr[root]!]
      swaps++
      yield { arr: [...arr], a: root, b: swapAt, kind: 'swap', comparisons, swaps }
      root = swapAt
    }
  }

  for (let start = Math.floor((n - 2) / 2); start >= 0; start--) {
    yield* sift(start, n - 1)
  }
  for (let end = n - 1; end > 0; end--) {
    ;[arr[0], arr[end]] = [arr[end]!, arr[0]!]
    swaps++
    yield { arr: [...arr], a: 0, b: end, kind: 'swap', comparisons, swaps }
    yield { arr: [...arr], a: end, b: -1, kind: 'sorted', comparisons, swaps }
    yield* sift(0, end - 1)
  }
  yield { arr: [...arr], a: 0, b: -1, kind: 'done', comparisons, swaps }
}

export function createSortGenerator(algo: SortAlgo, input: number[]): Generator<SortFrame> {
  switch (algo) {
    case 'quick':
      return quickSortGen(input)
    case 'merge':
      return mergeSortGen(input)
    case 'heap':
      return heapSortGen(input)
    default:
      return bubbleSortGen(input)
  }
}

const CANVAS = { width: 780, height: 400 }
const BASE_DELAY = 260

export class SortingVisualizerScene implements TutorialScene {
  readonly id = 'sorting'
  readonly events = new EventBus<SceneEventPayloads>()

  private renderer: CanvasRenderer | null = null
  private initialArray: number[] = []
  private generator: Generator<SortFrame> | null = null
  private history: SortFrame[] = []
  private current: SortFrame = { arr: [], a: -1, b: -1, kind: 'done', comparisons: 0, swaps: 0 }
  private status: PlayerStatus = 'idle'
  private speed = 1
  private timer: number | null = null
  private state: SortingState = { algorithm: 'quick', size: 40, status: 'idle', comparisons: 0, swaps: 0, done: false }
  private destroyed = false

  init(container: HTMLElement): void {
    this.renderer = new CanvasRenderer(container, CANVAS)
    this.shuffle(this.state.size)
  }


  /* ---------- 内部 ---------- */

  private shuffle(size?: number): void {
    if (size) this.state.size = size
    const n = this.state.size
    this.initialArray = Array.from({ length: n }, () => 8 + Math.floor(Math.random() * 92))
    this.reset()
  }

  private step(): void {
    if (!this.generator) return
    const frame = this.generator.next()
    if (frame.done || !frame.value) {
      this.state.status = 'completed'
      this.state.done = true
      this.stopTimer()
      this.events.emit('status', this.status)
      this.emitData()
      return
    }
    this.current = frame.value
    this.history.push(frame.value)
    if (this.history.length > 4000) this.history.shift()
    this.state.comparisons = frame.value.comparisons
    this.state.swaps = frame.value.swaps
    if (frame.value.kind === 'done') {
      this.state.done = true
      this.state.status = 'completed'
      this.stopTimer()
      this.events.emit('status', this.status)
    }
    this.draw()
    this.emitData()
  }

  private startTimer(): void {
    this.stopTimer()
    const delay = Math.max(16, BASE_DELAY / this.speed)
    this.timer = window.setInterval(() => {
      if (!this.destroyed && this.state.status === 'playing') this.step()
    }, delay)
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
  }

  private draw(): void {
    if (!this.renderer) return
    const { ctx } = this.renderer
    const { width, height } = CANVAS
    ctx.clearRect(0, 0, width, height)
    const arr = this.current.arr
    const n = arr.length || 1
    const barW = width / n
    const colors = getComputedStyle(document.documentElement)
    const accent = colors.getPropertyValue('--accent-bright').trim() || '#42B8FF'
    const warning = colors.getPropertyValue('--warning').trim() || '#FFB547'
    const success = colors.getPropertyValue('--success').trim() || '#20D6A0'
    const muted = colors.getPropertyValue('--text-3').trim() || '#7384A4'

    arr.forEach((v, i) => {
      const h = (v / 100) * (height - 60)
      const x = i * barW
      const y = height - 24 - h
      let color = accent
      if (this.current.kind === 'sorted' && this.current.a === i) color = success
      else if (this.current.kind === 'done') color = success
      else if (this.current.kind === 'pivot' && this.current.a === i) color = muted
      else if (i === this.current.a || i === this.current.b) color = warning
      ctx.fillStyle = color
      ctx.fillRect(x + barW * 0.12, y, Math.max(1, barW * 0.76), h)
    })

    ctx.fillStyle = muted
    ctx.font = '12px monospace'
    ctx.fillText(
      `${this.state.algorithm} · n=${n} · 比较 ${this.state.comparisons} · 交换 ${this.state.swaps}`,
      14,
      20,
    )
  }

  private emitData(): void {
    this.events.emit('data', this.getState())
  }

  /* ---------- TutorialScene ---------- */

  play(): void {
    if (this.destroyed || this.state.done) return
    this.state.status = 'playing'
    this.status = 'playing'
    this.events.emit('status', this.status)
    this.startTimer()
  }

  pause(): void {
    if (this.state.status !== 'playing') return
    this.stopTimer()
    this.state.status = 'paused'
    this.status = 'paused'
    this.events.emit('status', this.status)
  }

  nextStep(): void {
    this.stopTimer()
    if (this.state.status === 'playing') {
      this.state.status = 'paused'
      this.status = 'paused'
      this.events.emit('status', this.status)
    }
    this.step()
  }

  previousStep(): void {
    const prev = this.history[this.history.length - 2]
    if (!prev) {
      this.reset()
      return
    }
    this.history.pop()
    this.current = prev
    this.state.comparisons = prev.comparisons
    this.state.swaps = prev.swaps
    this.draw()
    this.emitData()
  }

  goToStep(index: number): void {
    this.reset()
    const clamped = Math.max(0, index)
    for (let i = 0; i < clamped; i++) {
      const frame = this.generator?.next()
      if (!frame || frame.done || !frame.value) break
      this.current = frame.value
      this.history.push(frame.value)
      this.state.comparisons = frame.value.comparisons
      this.state.swaps = frame.value.swaps
    }
    this.draw()
    this.emitData()
  }

  reset(): void {
    // 对外 reset 保持同一数组,便于对比
    this.stopTimer()
    this.generator = createSortGenerator(this.state.algorithm, this.initialArray)
    this.history = []
    this.current = { arr: [...this.initialArray], a: -1, b: -1, kind: 'done', comparisons: 0, swaps: 0 }
    this.state.status = 'idle'
    this.state.done = false
    this.state.comparisons = 0
    this.state.swaps = 0
    this.status = 'idle'
    this.draw()
    this.events.emit('status', this.status)
    this.emitData()
  }

  setSpeed(speed: number): void {
    this.speed = speed
    if (this.state.status === 'playing') this.startTimer()
    this.emitData()
  }

  getState(): SceneStateSnapshot {
    return {
      stepIndex: this.history.length,
      totalSteps: 0,
      stepStatuses: [],
      data: {
        rows: [
          { label: '算法', value: { bubble: '冒泡排序', quick: '快速排序', merge: '归并排序', heap: '堆排序' }[this.state.algorithm], tone: 'accent' },
          { label: '数组规模', value: `n = ${this.state.size}` },
          { label: '比较次数', value: String(this.state.comparisons) },
          { label: '交换/写入次数', value: String(this.state.swaps) },
          { label: '播放速度', value: `${this.speed}x` },
          { label: '状态', value: this.state.status === 'completed' ? '排序完成' : this.state.status === 'playing' ? '播放中' : this.state.status === 'paused' ? '已暂停' : '待开始' },
        ],
      },
    }
  }

  /* ---------- InteractiveScene ---------- */

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-algorithm',
        label: '切换算法',
        params: [
          {
            name: 'algo',
            label: '算法',
            type: 'select',
            options: [
              { value: 'bubble', label: '冒泡 O(n²)' },
              { value: 'quick', label: '快速 O(n log n)' },
              { value: 'merge', label: '归并 O(n log n)' },
              { value: 'heap', label: '堆排序 O(n log n)' },
            ],
          },
        ],
      },
      {
        name: 'set-size',
        label: '设置数组规模',
        params: [{ name: 'size', label: 'n', type: 'number', min: 5, max: 120, placeholder: '40' }],
      },
      { name: 'shuffle', label: '重新生成随机数组' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    switch (name) {
      case 'set-algorithm': {
        const algo = String(params?.algo ?? 'bubble') as SortAlgo
        if (['bubble', 'quick', 'merge', 'heap'].includes(algo)) {
          this.state.algorithm = algo
          this.reset()
        }
        break
      }
      case 'set-size': {
        const size = Number(params?.size)
        if (Number.isFinite(size) && size >= 5 && size <= 120) {
          this.shuffle(Math.floor(size))
        }
        break
      }
      case 'shuffle':
        this.shuffle()
        break
      default:
        break
    }
  }

  destroy(): void {
    this.destroyed = true
    this.stopTimer()
    this.renderer?.destroy()
    this.renderer = null
    this.events.clear()
  }
}

const sceneModule: { create: () => TutorialScene } = { create: () => new SortingVisualizerScene() }

export default sceneModule
