/**
 * 冒泡排序微步模型(纯函数,可测试)。
 * 每次调用 bubbleStep 推进一个微操作:一次比较(含可能的交换)或一轮结束。
 */

export type BubblePhase = 'idle' | 'compare' | 'swap' | 'pass-done' | 'done'

export interface BubbleState {
  arr: number[]
  /** 当前轮次 */
  pass: number
  /** 当前比较位置(与 j+1 比较) */
  j: number
  phase: BubblePhase
  comparisons: number
  swaps: number
  /** arr[sortedFrom..] 已有序 */
  sortedFrom: number
  /** 本轮是否发生过交换(提前终止判定) */
  swappedThisPass: boolean
  log: string[]
}

export function createBubbleState(arr: number[]): BubbleState {
  return {
    arr: [...arr],
    pass: 1,
    j: 0,
    phase: 'idle',
    comparisons: 0,
    swaps: 0,
    sortedFrom: arr.length,
    swappedThisPass: false,
    log: [`初始数组 [${arr.join(', ')}];共 ${arr.length} 个元素,最多 ${arr.length - 1} 轮`],
  }
}

/** 推进一个微操作 */
export function bubbleStep(s: BubbleState): BubbleState {
  if (s.phase === 'done') return s

  // 一轮结束判定:本轮扫描位置到达有序边界
  if (s.j + 1 >= s.sortedFrom) {
    const newSortedFrom = s.sortedFrom - 1
    if (newSortedFrom <= 0) {
      return {
        ...s,
        phase: 'done',
        sortedFrom: 0,
        log: [...s.log, `第 ${s.pass} 轮结束 → 全部有序 ✓ 共比较 ${s.comparisons} 次、交换 ${s.swaps} 次`],
      }
    }
    // 提前终止:本轮无交换 = 已有序
    if (!s.swappedThisPass) {
      return {
        ...s,
        phase: 'done',
        sortedFrom: 0,
        log: [...s.log, `第 ${s.pass} 轮无任何交换 → 提前终止,数组已有序 ✓(优化生效)`],
      }
    }
    return {
      ...s,
      phase: 'pass-done',
      sortedFrom: newSortedFrom,
      j: 0,
      pass: s.pass + 1,
      swappedThisPass: false,
      log: [...s.log, `第 ${s.pass} 轮结束:arr[${newSortedFrom}] = ${s.arr[newSortedFrom]} 归位,有序后缀生长到 ${s.arr.length - newSortedFrom} 个`],
    }
  }

  // 比较 arr[j] 与 arr[j+1]
  const a = s.arr[s.j]!
  const b = s.arr[s.j + 1]!
  const comparisons = s.comparisons + 1
  if (a > b) {
    const arr = [...s.arr]
    arr[s.j] = b
    arr[s.j + 1] = a
    return {
      ...s,
      arr,
      j: s.j + 1,
      phase: 'swap',
      comparisons,
      swaps: s.swaps + 1,
      swappedThisPass: true,
      log: [...s.log, `比较 arr[${s.j}]=${a} 与 arr[${s.j + 1}]=${b}:逆序 → 交换(${comparisons} 次比较)`],
    }
  }
  return {
    ...s,
    j: s.j + 1,
    phase: 'compare',
    comparisons,
    log: [...s.log, `比较 arr[${s.j}]=${a} 与 arr[${s.j + 1}]=${b}:顺序 → 不动(${comparisons} 次比较)`],
  }
}

/** 是否全部有序(校验用) */
export function isSorted(arr: number[]): boolean {
  for (let i = 1; i < arr.length; i++) {
    if ((arr[i - 1] ?? 0) > (arr[i] ?? 0)) return false
  }
  return true
}
