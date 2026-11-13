import { describe, expect, it } from 'vitest'
import {
  bubbleStep,
  createBubbleState,
  isSorted,
} from '@/tutorials/algorithm/bubble-sort/model'
import {
  createQuickState,
  quickFinished,
  quickStep,
} from '@/tutorials/algorithm/quick-sort/model'
import {
  SQ_CAPACITY,
  createStackQueueState,
  dequeue,
  enqueue,
  popStack,
  pushStack,
  twoStackQueuePop,
  twoStackQueuePush,
} from '@/tutorials/algorithm/stack-queue/model'
import {
  accessAt,
  buildPointers,
  createLinkedListState,
  insertHead,
  insertTail,
  removeAt,
  traverseStep,
} from '@/tutorials/algorithm/linked-list/model'

describe('冒泡排序微步模型', () => {
  function runToDone(arr: number[]) {
    let s = createBubbleState(arr)
    let guard = 0
    while (s.phase !== 'done' && guard < 200) {
      s = bubbleStep(s)
      guard++
    }
    return s
  }

  it('完整执行:排序正确并达到 done', () => {
    const s = runToDone([5, 3, 8, 1, 4])
    expect(isSorted(s.arr)).toBe(true)
    expect(s.arr).toEqual([1, 3, 4, 5, 8])
  })

  it('比较次数符合 n(n-1)/2(无提前终止时)', () => {
    const s = runToDone([8, 7, 6, 5, 4]) // 逆序:每轮都有交换,跑满
    expect(s.comparisons).toBe(10)
  })

  it('几乎有序:触发提前终止', () => {
    const s = runToDone([1, 2, 3, 5, 4])
    expect(isSorted(s.arr)).toBe(true)
    expect(s.comparisons).toBeLessThan(10)
    expect(s.log.some(l => l.includes('提前终止'))).toBe(true)
  })

  it('每轮结束有序后缀生长', () => {
    let s = createBubbleState([5, 3, 8, 1, 4])
    // 4 次比较 + 1 次轮末检测:第 1 轮后 sortedFrom 应为 4
    for (let i = 0; i < 5; i++) s = bubbleStep(s)
    expect(s.sortedFrom).toBe(4)
    expect(s.pass).toBe(2)
  })
})

describe('快速排序微步模型(Lomuto)', () => {
  function runToDone(arr: number[]) {
    let s = createQuickState(arr)
    let guard = 0
    while (!quickFinished(s) && guard < 400) {
      s = quickStep(s)
      guard++
    }
    return s
  }

  it('完整执行:排序正确且全部归位', () => {
    const s = runToDone([5, 3, 8, 1, 4, 7])
    expect(s.arr).toEqual([1, 3, 4, 5, 7, 8])
    expect(s.sorted.length).toBe(6)
    expect(quickFinished(s)).toBe(true)
  })

  it('随机排列也能正确排序', () => {
    const s = runToDone([4, 1, 7, 2, 8, 3])
    expect(s.arr).toEqual([1, 2, 3, 4, 7, 8])
  })

  it('单元素数组:立即完成', () => {
    const s = runToDone([5])
    expect(s.arr).toEqual([5])
    expect(s.sorted.length).toBe(1)
  })

  it('已有序数组(最坏退化)仍然排序正确', () => {
    const s = runToDone([1, 2, 3, 4, 5, 6])
    expect(s.arr).toEqual([1, 2, 3, 4, 5, 6])
    // 教学关注点:比较次数显著更多(O(n²) 退化),这里只验证正确性
  })
})

describe('栈与队列模型', () => {
  it('栈 LIFO:压入顺序与弹出顺序相反', () => {
    let s = createStackQueueState()
    s = pushStack(pushStack(pushStack(s, 'A'), 'B'), 'C')
    expect(s.stack).toEqual(['A', 'B', 'C'])
    s = popStack(s)
    expect(s.lastPopped).toBe('C')
    s = popStack(s)
    expect(s.lastPopped).toBe('B')
    s = popStack(s)
    expect(s.lastPopped).toBe('A')
    expect(s.stack.length).toBe(0)
  })

  it('队列 FIFO:出队顺序与入队顺序相同', () => {
    let s = createStackQueueState()
    s = enqueue(enqueue(enqueue(s, 'A'), 'B'), 'C')
    expect(s.queue).toEqual(['A', 'B', 'C'])
    s = dequeue(s)
    expect(s.lastDequeued).toBe('A')
    s = dequeue(s)
    expect(s.lastDequeued).toBe('B')
    expect(s.queue).toEqual(['C'])
  })

  it('空栈弹出 = underflow', () => {
    let s = createStackQueueState()
    s = popStack(s)
    expect(s.error).toContain('栈为空')
    expect(s.lastPopped).toBeNull()
  })

  it('空队列出队报错', () => {
    let s = createStackQueueState()
    s = dequeue(s)
    expect(s.error).toContain('队列为空')
  })

  it('栈溢出:容量上限', () => {
    let s = createStackQueueState()
    for (let i = 0; i < SQ_CAPACITY; i++) s = pushStack(s, `x${i}`)
    expect(s.stack.length).toBe(SQ_CAPACITY)
    s = pushStack(s, 'overflow')
    expect(s.error).toContain('栈溢出')
    expect(s.stack.length).toBe(SQ_CAPACITY)
  })

  it('两个栈模拟队列:双反转为 FIFO', () => {
    let input: string[] = []
    let out: string[] = []
    input = twoStackQueuePush(input, 'A')
    input = twoStackQueuePush(input, 'B')
    input = twoStackQueuePush(input, 'C')
    const r1 = twoStackQueuePop(input, out) // 触发倒栈
    expect(r1.popped).toBe('A')
    const r2 = twoStackQueuePop(r1.inStack, r1.outStack)
    expect(r2.popped).toBe('B')
    const r3 = twoStackQueuePop(r2.inStack, r2.outStack)
    expect(r3.popped).toBe('C')
  })
})

describe('链表模型', () => {
  it('初始状态:指针表正确', () => {
    const s = createLinkedListState([3, 7, 12])
    const ids = s.nodes.map(n => n.id)
    expect(s.nextMap[ids[0]!]).toBe(ids[1])
    expect(s.nextMap[ids[1]!]).toBe(ids[2])
    expect(s.nextMap[ids[2]!]).toBeNull()
    expect(buildPointers(s.nodes)).toEqual(s.nextMap)
  })

  it('头插 O(1):新节点成为 head 且指向旧头', () => {
    let s = createLinkedListState([3, 7, 12])
    s = insertHead(s, 99)
    expect(s.nodes.map(n => n.value)).toEqual([99, 3, 7, 12])
    expect(s.headValue).toBe(99)
    expect(s.nextMap[s.nodes[0]!.id]).toBe(s.nodes[1]!.id)
  })

  it('遍历游标:一步步走,越界返回 null', () => {
    let s = createLinkedListState([3, 7, 12])
    s = traverseStep(s)
    expect(s.cursor).toBe(0)
    s = traverseStep(s)
    expect(s.cursor).toBe(1)
    s = traverseStep(s)
    s = traverseStep(s) // 越界 → null
    expect(s.cursor).toBeNull()
  })

  it('按下标访问 O(n) 教学对照', () => {
    let s = createLinkedListState([3, 7, 12])
    s = accessAt(s, 2)
    expect(s.cursor).toBe(2)
    expect(s.log[s.log.length - 1]).toContain('从头走 3 步')
  })

  it('删除中间节点:指针绕过,顺序保持', () => {
    let s = createLinkedListState([3, 7, 12])
    s = removeAt(s, 1)
    expect(s.nodes.map(n => n.value)).toEqual([3, 12])
    const ids = s.nodes.map(n => n.id)
    expect(s.nextMap[ids[0]!]).toBe(ids[1])
    expect(s.nextMap[ids[1]!]).toBeNull()
  })

  it('尾插:next 指针与 tail 更新', () => {
    let s = createLinkedListState([3, 7])
    s = insertTail(s, 42)
    expect(s.nodes.map(n => n.value)).toEqual([3, 7, 42])
    expect(s.tailValue).toBe(42)
    const ids = s.nodes.map(n => n.id)
    expect(s.nextMap[ids[1]!]).toBe(ids[2])
    expect(s.nextMap[ids[2]!]).toBeNull()
  })

  it('删除全部节点 → 空链表', () => {
    let s = createLinkedListState([3, 7, 12])
    s = removeAt(s, 0)
    s = removeAt(s, 0)
    s = removeAt(s, 0)
    expect(s.nodes.length).toBe(0)
    expect(s.headValue).toBeNull()
  })
})
