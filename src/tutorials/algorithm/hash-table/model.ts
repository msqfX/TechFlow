/**
 * 哈希表模型(链地址法;纯函数,可测试)。
 * hashFunc 为确定性的字符串哈希(字符码求和),便于测试。
 * 负载因子超过阈值自动翻倍 rehash。
 */

export interface HashEntry {
  key: string
  value: string
}

export interface HashTableState {
  bucketCount: number
  buckets: HashEntry[][]
  lastKey: string | null
  lastBucket: number | null
  /** 最近一次操作是否发生冲突 */
  collided: boolean
  size: number
  rehashes: number
  /** 最近一次查询结果(展示) */
  lastLookup: { key: string; found: boolean; value?: string; hops: number } | null
  log: string[]
}

export const LOAD_FACTOR_THRESHOLD = 0.75

/** 确定性哈希:字符码求和(教学用;真实实现用 SipHash 等带密钥哈希) */
export function hashFunc(key: string, bucketCount: number): number {
  let sum = 0
  for (let i = 0; i < key.length; i++) {
    sum += key.charCodeAt(i)
  }
  return sum % bucketCount
}

export function createHashTableState(bucketCount = 4): HashTableState {
  return {
    bucketCount,
    buckets: Array.from({ length: bucketCount }, () => []),
    lastKey: null,
    lastBucket: null,
    collided: false,
    size: 0,
    rehashes: 0,
    lastLookup: null,
    log: [`哈希表就绪:${bucketCount} 个桶;负载因子阈值 ${LOAD_FACTOR_THRESHOLD}`],
  }
}

function loadFactor(s: HashTableState): number {
  return s.size / s.bucketCount
}

/** rehash:桶数翻倍,全部键重新分配 */
export function rehash(s: HashTableState): HashTableState {
  const newCount = s.bucketCount * 2
  const buckets: HashEntry[][] = Array.from({ length: newCount }, () => [])
  let collisions = 0
  for (const chain of s.buckets) {
    for (const entry of chain) {
      const b = hashFunc(entry.key, newCount)
      if (buckets[b]!.length > 0) collisions++
      buckets[b]!.push(entry)
    }
  }
  return {
    ...s,
    bucketCount: newCount,
    buckets,
    rehashes: s.rehashes + 1,
    collided: collisions > 0,
    log: [
      ...s.log,
      `负载因子 ${loadFactor(s).toFixed(2)} 超阈值 → rehash:桶数 ${s.bucketCount} → ${newCount},全部 ${s.size} 个键重新分配(代价 O(n),均摊 O(1))`,
    ],
  }
}

/** put:定位桶 → 同 key 覆盖 / 冲突追加链尾 → 检查负载因子(可能触发 rehash) */
export function put(s: HashTableState, key: string, value: string): HashTableState {
  const bucket = hashFunc(key, s.bucketCount)
  const chain = s.buckets[bucket]!
  const existing = chain.findIndex(e => e.key === key)
  const collided = existing >= 0 ? chain.length > 0 : chain.length > 0
  let buckets = s.buckets
  let size = s.size
  let log: string[]
  if (existing >= 0) {
    buckets = s.buckets.map((b, i) =>
      i === bucket ? b.map(e => (e.key === key ? { key, value } : e)) : b,
    )
    log = [...s.log, `put ${key}=${value}:哈希 → 桶 ${bucket};键已存在,覆盖旧值(链长 ${chain.length},比较 ${existing + 1} 次)`]
  } else {
    buckets = s.buckets.map((b, i) =>
      i === bucket ? [...b, { key, value }] : b,
    )
    size = s.size + 1
    log = [
      ...s.log,
      collided
        ? `put ${key}=${value}:哈希 → 桶 ${bucket};冲突!链地址法追加到链尾(链长 ${chain.length + 1})`
        : `put ${key}=${value}:哈希 → 桶 ${bucket};桶为空,直接放入 O(1)`,
    ]
  }
  let state: HashTableState = {
    ...s,
    buckets,
    size,
    lastKey: key,
    lastBucket: bucket,
    collided,
    log,
  }
  if (loadFactor(state) > LOAD_FACTOR_THRESHOLD) {
    state = rehash(state)
  }
  return state
}

/** get:定位桶 → 沿链逐个比对(hops = 比较次数) */
export function get(s: HashTableState, key: string): HashTableState {
  const bucket = hashFunc(key, s.bucketCount)
  const chain = s.buckets[bucket]!
  const idx = chain.findIndex(e => e.key === key)
  const hops = idx >= 0 ? idx + 1 : Math.max(chain.length, 0)
  return {
    ...s,
    lastKey: key,
    lastBucket: bucket,
    lastLookup: { key, found: idx >= 0, value: idx >= 0 ? chain[idx]!.value : undefined, hops },
    log: [
      ...s.log,
      idx >= 0
        ? `get ${key}:哈希 → 桶 ${bucket};沿链比对 ${hops} 次 → 找到「${chain[idx]!.value}」`
        : `get ${key}:哈希 → 桶 ${bucket};沿链比对 ${hops} 次 → 不存在`,
    ],
  }
}

/** remove:定位桶 → 链中摘除 */
export function removeKey(s: HashTableState, key: string): HashTableState {
  const bucket = hashFunc(key, s.bucketCount)
  const chain = s.buckets[bucket]!
  const idx = chain.findIndex(e => e.key === key)
  if (idx < 0) {
    return {
      ...s,
      lastKey: key,
      lastBucket: bucket,
      log: [...s.log, `remove ${key}:桶 ${bucket} 中不存在,删除失败`],
    }
  }
  const buckets = s.buckets.map((b, i) => (i === bucket ? b.filter(e => e.key !== key) : b))
  return {
    ...s,
    buckets,
    size: s.size - 1,
    lastKey: key,
    lastBucket: bucket,
    log: [...s.log, `remove ${key}:从桶 ${bucket} 的链中摘除(O(1) 指针操作),剩余链长 ${chain.length - 1}`],
  }
}
