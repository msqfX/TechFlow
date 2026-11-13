/**
 * 数组(动态数组)操作模型(纯函数,可测试)。
 * cells 含容量槽位(null = 空);size 为逻辑长度。
 * 演示:随机访问地址公式、中间插入移位、尾部追加、满容量翻倍扩容。
 */

export interface ArrayState {
  cells: Array<number | null>
  /** 逻辑长度(cells 前缀非空部分) */
  size: number
  highlight: number | null
  /** 正在发生的移位下标(可视化) */
  shifts: number[]
  /** 扩容次数 */
  resizes: number
  /** 累计拷贝的元素个数(扩容代价可视化) */
  copied: number
  addressFormula: string
  log: string[]
}

export const ELEMENT_BYTES = 4

export function createArrayState(initial: number[], capacity?: number): ArrayState {
  const cap = Math.max(capacity ?? initial.length, initial.length)
  const cells: Array<number | null> = Array.from({ length: cap }, (_, i) => (i < initial.length ? initial[i]! : null))
  return {
    cells,
    size: initial.length,
    highlight: null,
    shifts: [],
    resizes: 0,
    copied: 0,
    addressFormula: `首地址 + 下标 × ${ELEMENT_BYTES}`,
    log: [`初始数组 [${initial.join(', ')}],容量 ${cap}`],
  }
}

/** 按下标访问 O(1):一次地址计算,零移动 */
export function accessAt(s: ArrayState, index: number): ArrayState {
  if (index < 0 || index >= s.size) {
    return { ...s, log: [...s.log, `访问下标 ${index} 越界(长度 ${s.size})`] }
  }
  return {
    ...s,
    highlight: index,
    log: [...s.log, `访问 arr[${index}] = ${s.cells[index]}:地址 = 首地址 + ${index} × ${ELEMENT_BYTES},一步直达 O(1)`],
  }
}

/** 中间插入 O(n):k 及之后整体后移,再写入 k */
export function insertAt(s: ArrayState, index: number, value: number): ArrayState {
  if (index < 0 || index > s.size) {
    return { ...s, log: [...s.log, `插入位置 ${index} 非法(允许 0..${s.size})`] }
  }
  if (s.size >= s.cells.length) {
    return { ...s, log: [...s.log, `容量已满(${s.cells.length}),请先扩容 —— 动态数组会自动翻倍`] }
  }
  const cells = [...s.cells]
  // 从末尾向前逐个后移
  const shifts: number[] = []
  for (let i = s.size; i > index; i--) {
    cells[i] = cells[i - 1]!
    shifts.push(i)
  }
  cells[index] = value
  return {
    ...s,
    cells,
    size: s.size + 1,
    highlight: index,
    shifts,
    log: [...s.log, `在 [${index}] 插入 ${value}:${shifts.length} 个元素后移 —— O(n)(移动越多越慢)`],
  }
}

/** 按下标删除 O(n):k 之后整体前移补洞 */
export function removeAt(s: ArrayState, index: number): ArrayState {
  if (index < 0 || index >= s.size) {
    return { ...s, log: [...s.log, `删除下标 ${index} 越界(长度 ${s.size})`] }
  }
  const removed = s.cells[index]
  const cells = [...s.cells]
  const shifts: number[] = []
  for (let i = index; i < s.size - 1; i++) {
    cells[i] = cells[i + 1]!
    shifts.push(i)
  }
  cells[s.size - 1] = null
  return {
    ...s,
    cells,
    size: s.size - 1,
    highlight: index,
    shifts,
    log: [...s.log, `删除 arr[${index}](${removed}):${shifts.length} 个元素前移补洞 —— O(n)`],
  }
}

/** 尾部追加:有容量则 O(1);满则翻倍扩容(整体拷贝)后追加 */
export function append(s: ArrayState, value: number): ArrayState {
  if (s.size < s.cells.length) {
    const cells = [...s.cells]
    cells[s.size] = value
    return {
      ...s,
      cells,
      size: s.size + 1,
      highlight: s.size - 1,
      shifts: [],
      log: [...s.log, `尾部追加 ${value}:无移位,O(1) —— 数组的主场`],
    }
  }
  // 扩容:容量翻倍,旧元素整体拷贝
  const oldCap = s.cells.length
  const newCap = oldCap * 2
  const cells: Array<number | null> = Array.from({ length: newCap }, (_, i) => (i < oldCap ? (s.cells[i] ?? null) : null))
  cells[s.size] = value
  return {
    ...s,
    cells,
    size: s.size + 1,
    highlight: s.size,
    shifts: [],
    resizes: s.resizes + 1,
    copied: s.copied + oldCap,
    log: [
      ...s.log,
      `容量满!扩容 ${oldCap} → ${newCap}:${oldCap} 个元素整体拷贝(代价 O(n))`,
      `扩容后追加 ${value}。n 次追加总拷贝约 2n → 均摊 O(1)`,
    ],
  }
}
