import { describe, expect, it } from 'vitest'
import {
  accessAt,
  append,
  createArrayState,
  insertAt,
  removeAt,
} from '@/tutorials/algorithm/array/model'
import {
  createHashTableState,
  get,
  hashFunc,
  put,
  removeKey,
} from '@/tutorials/algorithm/hash-table/model'
import {
  createMergeState,
  mergeStep,
} from '@/tutorials/algorithm/merge-sort/model'

describe('数组(动态数组)模型', () => {
  it('随机访问:一次地址计算', () => {
    let s = createArrayState([3, 7, 12], 4)
    s = accessAt(s, 2)
    expect(s.highlight).toBe(2)
    expect(s.log[s.log.length - 1]).toContain('O(1)')
  })

  it('中间插入:后移计数 = size - index', () => {
    let s = createArrayState([3, 7, 12], 4)
    s = insertAt(s, 1, 99)
    expect(s.cells.slice(0, s.size)).toEqual([3, 99, 7, 12])
    expect(s.shifts.length).toBe(2) // 7、12 后移
    expect(s.size).toBe(4)
  })

  it('中间删除:前移补洞', () => {
    let s = createArrayState([3, 7, 12], 4)
    s = removeAt(s, 0)
    expect(s.cells.slice(0, s.size)).toEqual([7, 12])
    expect(s.shifts.length).toBe(2)
  })

  it('尾部追加:无移位 O(1)', () => {
    let s = createArrayState([3, 7, 12], 4)
    s = append(s, 42)
    expect(s.shifts.length).toBe(0)
    expect(s.size).toBe(4)
    expect(s.resizes).toBe(0)
  })

  it('满容量追加:翻倍扩容 + 整体拷贝', () => {
    let s = createArrayState([3, 7, 12], 4)
    s = append(s, 42) // 容量 4 用满
    s = append(s, 55) // 触发扩容 4→8
    expect(s.cells.length).toBe(8)
    expect(s.resizes).toBe(1)
    expect(s.copied).toBe(4)
    expect(s.cells.slice(0, s.size)).toEqual([3, 7, 12, 42, 55])
  })

  it('连续追加的均摊拷贝量有界', () => {
    let s = createArrayState([1], 1)
    for (let i = 0; i < 32; i++) s = append(s, i)
    expect(s.size).toBe(33)
    // 翻倍式扩容:总拷贝 < 2n
    expect(s.copied).toBeLessThan(2 * 33)
  })

  it('越界访问/非法插入被拒绝', () => {
    let s = createArrayState([3], 4)
    s = accessAt(s, 5)
    expect(s.log[s.log.length - 1]).toContain('越界')
    s = insertAt(s, 9, 1)
    expect(s.log[s.log.length - 1]).toContain('非法')
  })
})

describe('哈希表模型(链地址法)', () => {
  it('hashFunc 确定性且在桶范围内', () => {
    for (const key of ['age', 'name', 'eat', 'city']) {
      const b1 = hashFunc(key, 8)
      const b2 = hashFunc(key, 8)
      expect(b1).toBe(b2)
      expect(b1).toBeGreaterThanOrEqual(0)
      expect(b1).toBeLessThan(8)
    }
  })

  it('put/get 基本流程', () => {
    let s = createHashTableState(4)
    s = put(s, 'age', '18')
    expect(s.size).toBe(1)
    s = get(s, 'age')
    expect(s.lastLookup).toMatchObject({ key: 'age', found: true, value: '18' })
  })

  it('教学键冲突:name 与 mean 互为变位词(字符码和相同)', () => {
    expect(hashFunc('name', 4)).toBe(hashFunc('mean', 4))
    let s = createHashTableState(4)
    s = put(s, 'name', 'Alice')
    s = put(s, 'mean', 'verb')
    expect(s.collided).toBe(true)
    // 同桶成链
    const b = hashFunc('name', 4)
    expect(s.buckets[b]!.length).toBe(2)
    // get 沿链比对 2 次
    s = get(s, 'mean')
    expect(s.lastLookup?.hops).toBe(2)
  })

  it('同 key put 覆盖不新增', () => {
    let s = createHashTableState(4)
    s = put(s, 'age', '18')
    s = put(s, 'age', '20')
    expect(s.size).toBe(1)
    s = get(s, 'age')
    expect(s.lastLookup?.value).toBe('20')
  })

  it('负载因子超阈值自动 rehash:桶翻倍且全部键可寻', () => {
    let s = createHashTableState(4)
    const keys = ['k1', 'k2', 'k3', 'k4'] // 4 键/4 桶 = 1.0 > 0.75
    for (const [i, k] of keys.entries()) s = put(s, k, `v${i}`)
    expect(s.bucketCount).toBe(8)
    expect(s.rehashes).toBeGreaterThanOrEqual(1)
    // rehash 后所有键都能找到
    for (const [i, k] of keys.entries()) {
      s = get(s, k)
      expect(s.lastLookup?.found).toBe(true)
      expect(s.lastLookup?.value).toBe(`v${i}`)
    }
  })

  it('remove:链中摘除', () => {
    let s = createHashTableState(4)
    s = put(s, 'age', '18')
    s = put(s, 'eat', 'noodles')
    s = removeKey(s, 'age')
    expect(s.size).toBe(1)
    s = get(s, 'age')
    expect(s.lastLookup?.found).toBe(false)
  })
})

describe('归并排序模型(自底向上)', () => {
  function runToDone(arr: number[]) {
    let s = createMergeState(arr)
    let guard = 0
    while (s.phase !== 'done' && guard < 600) {
      s = mergeStep(s)
      guard++
    }
    return s
  }

  it('完整执行:排序正确', () => {
    const s = runToDone([5, 3, 8, 1, 4, 7])
    expect(s.phase).toBe('done')
    expect(s.arr).toEqual([1, 3, 4, 5, 7, 8])
  })

  it('随机数组也正确', () => {
    const s = runToDone([4, 1, 7, 2, 8, 3])
    expect(s.arr).toEqual([1, 2, 3, 4, 7, 8])
  })

  it('已有序数组:步数不膨胀(无 O(n²) 退化)', () => {
    const sorted = runToDone([1, 2, 3, 4, 5, 6])
    const random = runToDone([4, 1, 7, 2, 8, 3])
    // 归并的比较次数只与 n 有关,与输入顺序基本无关(±常数)
    expect(Math.abs(sorted.comparisons - random.comparisons)).toBeLessThanOrEqual(6)
  })

  it('比较次数符合 O(n log n) 上界', () => {
    const s = runToDone([5, 3, 8, 1, 4, 7])
    const n = 6
    const bound = n * Math.ceil(Math.log2(n + 1))
    expect(s.comparisons).toBeLessThanOrEqual(bound)
  })

  it('单元素数组:立即 done', () => {
    const s = runToDone([5])
    expect(s.phase).toBe('done')
    expect(s.arr).toEqual([5])
  })

  it('双元素:一次比较完成', () => {
    const s = runToDone([7, 2])
    expect(s.arr).toEqual([2, 7])
    expect(s.comparisons).toBe(1)
  })

  it('游程宽度翻倍推进', () => {
    let s = createMergeState([5, 3, 8, 1, 4, 7])
    // width=1 的第一段合并完成后进入 [2..4)(width 仍为 1),全部 width=1 段完成后翻倍
    let guard = 0
    while (s.width === 1 && s.phase !== 'done' && guard < 50) {
      s = mergeStep(s)
      guard++
    }
    expect(s.width).toBe(2)
  })
})
