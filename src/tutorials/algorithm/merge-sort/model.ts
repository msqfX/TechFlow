/**
 * 归并排序模型(自底向上迭代版;纯函数,可测试)。
 * 游程宽度 1→2→4…翻倍;mergeStep 推进一个微操作:取左/取右/回写/进入下一段。
 * 相等取左游程 → 稳定。
 */

export type MergePhase = 'idle' | 'take' | 'copyback' | 'next' | 'done'

export interface MergeState {
  arr: number[]
  /** 当前归并游程宽度 */
  width: number
  /** 当前归并段起点 */
  lo: number
  /** 左/右游程指针(绝对下标;i ∈ [lo, mid),j ∈ [mid, hi)) */
  i: number
  j: number
  mid: number
  hi: number
  /** 辅助数组(当前段的合并结果写入这里,展示用) */
  aux: Array<number | null>
  comparisons: number
  writes: number
  phase: MergePhase
  log: string[]
}

export function createMergeState(arr: number[]): MergeState {
  const n = arr.length
  return {
    arr: [...arr],
    width: 1,
    lo: 0,
    i: 0,
    j: Math.min(1, n),
    mid: Math.min(1, n),
    hi: Math.min(2, n),
    aux: Array.from({ length: n }, () => null),
    comparisons: 0,
    writes: 0,
    phase: 'idle',
    log: [`初始数组 [${arr.join(', ')}];自底向上归并:游程宽度 1 → 2 → 4 → …(相等取左,稳定)`],
  }
}

/** 推进一个微操作 */
export function mergeStep(s: MergeState): MergeState {
  if (s.phase === 'done') return s

  const n = s.arr.length

  // 当前段已合并完(copyback 之后):进入下一段或翻倍宽度
  if (s.lo >= n || s.mid >= s.hi) {
    return nextRun(s)
  }

  const { mid, hi } = s
  const writePos = s.lo + (s.i - s.lo) + (s.j - mid)
  const aux = [...s.aux]

  // 双指针取小(相等取左 → 稳定)
  if (s.i < mid && s.j < hi) {
    const left = s.arr[s.i]!
    const right = s.arr[s.j]!
    const comparisons = s.comparisons + 1
    if (left <= right) {
      aux[writePos] = left
      return {
        ...s,
        aux,
        comparisons,
        writes: s.writes + 1,
        i: s.i + 1,
        phase: 'take',
        log: [...s.log, `merge [${s.lo}..${hi}):a[${s.i}]=${left} ≤ a[${s.j}]=${right} → 取左(相等取左保证稳定),写 aux[${writePos}]`],
      }
    }
    aux[writePos] = right
    return {
      ...s,
      aux,
      comparisons,
      writes: s.writes + 1,
      j: s.j + 1,
      phase: 'take',
      log: [...s.log, `merge [${s.lo}..${hi}):a[${s.j}]=${right} < a[${s.i}]=${left} → 取右,写 aux[${writePos}]`],
    }
  }

  // 一侧耗尽:另一侧剩余直接写入
  if (s.i < mid) {
    aux[writePos] = s.arr[s.i]!
    return { ...s, aux, writes: s.writes + 1, i: s.i + 1, phase: 'take', log: [...s.log, `左游程剩余直接写 aux[${writePos}] = ${s.arr[s.i]}`] }
  }
  if (s.j < hi) {
    aux[writePos] = s.arr[s.j]!
    return { ...s, aux, writes: s.writes + 1, j: s.j + 1, phase: 'take', log: [...s.log, `右游程剩余直接写 aux[${writePos}] = ${s.arr[s.j]}`] }
  }

  // 本段合并完成:辅助数组回写 arr,推进到下一段
  const arr = [...s.arr]
  for (let k = s.lo; k < hi; k++) {
    arr[k] = aux[k]!
  }
  return nextRun({ ...s, arr, log: [...s.log, `段 [${s.lo}..${hi}) 合并完成并回写 —— 有序游程长度翻倍至 ${Math.min(hi - s.lo + 1, s.arr.length)}`] })
}

function nextRun(s: MergeState): MergeState {
  const n = s.arr.length
  let lo = s.lo + 2 * s.width
  let width = s.width
  while (lo >= n) {
    width *= 2
    lo = 0
    if (width >= n) {
      return {
        ...s,
        width,
        lo: 0,
        i: 0,
        j: 0,
        phase: 'done',
        aux: s.arr.map(v => v as number | null),
        log: [...s.log, `游程宽度 ${width} ≥ ${n} —— 归并完成,数组有序 ✓(共 ${s.comparisons} 次比较、${s.writes} 次写入)`],
      }
    }
  }
  const mid = Math.min(lo + width, n)
  const hi = Math.min(lo + 2 * width, n)
  return {
    ...s,
    lo,
    width,
    i: lo,
    j: mid,
    mid,
    hi,
    aux: Array.from({ length: n }, (_, k) => (k >= lo && k < hi ? null : (s.aux[k] ?? null))),
    phase: 'next',
    log: [...s.log, `下一段:合并游程 [${lo}..${mid}) 与 [${mid}..${hi})(宽度 ${width})`],
  }
}
