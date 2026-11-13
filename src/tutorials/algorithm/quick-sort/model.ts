/**
 * 快速排序微步模型(Lomuto 分区,显式递归栈;纯函数,可测试)。
 * 每次调用 quickStep 推进一个微操作:扫描比较、交换、基准归位或取下一个区间。
 */

export type QuickPhase = 'idle' | 'scan' | 'placed' | 'done'

export interface QuickRange {
  lo: number
  hi: number
}

export interface QuickState {
  arr: number[]
  /** 待处理区间(栈顶先处理) */
  stack: QuickRange[]
  cur: QuickRange | null
  /** 基准下标(当前分区取 hi) */
  pivotIdx: number | null
  /** < 基准的分界指针 / 扫描指针 */
  i: number
  j: number
  phase: QuickPhase
  comparisons: number
  swaps: number
  /** 已归位(最终有序)的下标 */
  sorted: number[]
  log: string[]
}

export function createQuickState(arr: number[]): QuickState {
  return {
    arr: [...arr],
    stack: arr.length > 0 ? [{ lo: 0, hi: arr.length - 1 }] : [],
    cur: null,
    pivotIdx: null,
    i: 0,
    j: 0,
    phase: 'idle',
    comparisons: 0,
    swaps: 0,
    sorted: [],
    log: [`初始数组 [${arr.join(', ')}];分治开始(Lomuto 分区,基准取区间末尾)`],
  }
}

/** 是否全部归位 */
export function quickFinished(s: QuickState): boolean {
  return s.sorted.length >= s.arr.length
}

/** 推进一个微操作 */
export function quickStep(s: QuickState): QuickState {
  if (quickFinished(s)) {
    return { ...s, phase: 'done', log: [...s.log, '全部元素归位 ✓'] }
  }

  // 取下一个待分区区间
  if (!s.cur) {
    const next = s.stack.pop()
    if (!next) {
      return { ...s, phase: 'done', log: [...s.log, '区间栈已空 ✓'] }
    }
    if (next.lo >= next.hi) {
      // 长度 ≤ 1 的区间天然有序
      const sorted = s.sorted.includes(next.lo) ? s.sorted : [...s.sorted, next.lo]
      return {
        ...s,
        sorted,
        cur: null,
        log: [...s.log, `区间 [${next.lo}..${next.hi}] 长度 ≤ 1,天然有序`],
      }
    }
    return {
      ...s,
      cur: next,
      pivotIdx: next.hi,
      i: next.lo,
      j: next.lo,
      phase: 'scan',
      log: [...s.log, `取区间 [${next.lo}..${next.hi}]:选基准 arr[${next.hi}] = ${s.arr[next.hi]}(Lomuto 分区)`],
    }
  }

  const { lo, hi } = s.cur
  const pivotIdx = s.pivotIdx!

  // 扫描指针到达基准位置 → 基准归位
  if (s.j >= pivotIdx) {
    const arr = [...s.arr]
    const pv = arr[pivotIdx]!
    arr[pivotIdx] = arr[s.i]!
    arr[s.i] = pv
    const sorted = [...s.sorted, s.i]
    // 子区间长度 ≤ 1 时也入栈:取区间分支会标记单元素为已归位
    const left: QuickRange | null = s.i - 1 >= lo ? { lo, hi: s.i - 1 } : null
    const right: QuickRange | null = hi >= s.i + 1 ? { lo: s.i + 1, hi } : null
    // 右区间先入栈 → 左区间先被处理(深度优先)
    const stack = [...s.stack]
    if (right) stack.push(right)
    if (left) stack.push(left)
    return {
      ...s,
      arr,
      sorted,
      stack,
      cur: null,
      pivotIdx: null,
      swaps: s.swaps + 1,
      phase: 'placed',
      log: [...s.log, `基准 ${pv} 归位到 arr[${s.i}]:左侧全小于它、右侧全大于它;递归 [${lo}..${s.i - 1}] 与 [${s.i + 1}..${hi}]`],
    }
  }

  // 扫描:arr[j] < pivot → 交换到分界左侧
  const a = s.arr[s.j]!
  const pivot = s.arr[pivotIdx]!
  const comparisons = s.comparisons + 1
  if (a < pivot) {
    if (s.i !== s.j) {
      const arr = [...s.arr]
      const tmp = arr[s.i]!
      arr[s.i] = a
      arr[s.j] = tmp
      return {
        ...s,
        arr,
        comparisons,
        swaps: s.swaps + 1,
        i: s.i + 1,
        j: s.j + 1,
        log: [...s.log, `arr[${s.j}]=${a} < 基准 ${pivot}:交换到左侧(分界 i → ${s.i + 1})`],
      }
    }
    return {
      ...s,
      comparisons,
      i: s.i + 1,
      j: s.j + 1,
      log: [...s.log, `arr[${s.j}]=${a} < 基准 ${pivot}:已在分界处,i++`],
    }
  }
  return {
    ...s,
    comparisons,
    j: s.j + 1,
    log: [...s.log, `arr[${s.j}]=${a} ≥ 基准 ${pivot}:留在右侧,j++`],
  }
}
