/**
 * 栈与队列操作模型(纯函数,可测试)。
 * 栈:LIFO(压/弹/窥视都在栈顶);队列:FIFO(入队在队尾,出队在队头)。
 * 容量 6,演示溢出与空弹边界。
 */

export const SQ_CAPACITY = 6

export interface StackQueueState {
  stack: string[]
  queue: string[]
  /** 最近一次弹栈/出队的元素(展示) */
  lastPopped: string | null
  lastDequeued: string | null
  /** 边界错误提示(溢出/空弹) */
  error: string | null
  log: string[]
}

export function createStackQueueState(): StackQueueState {
  return {
    stack: [],
    queue: [],
    lastPopped: null,
    lastDequeued: null,
    error: null,
    log: ['栈与队列就绪(容量各 6);栈顶在下方面板高亮,队头在左侧'],
  }
}

/** 栈:压栈(push)—— O(1),放栈顶 */
export function pushStack(s: StackQueueState, item: string): StackQueueState {
  if (s.stack.length >= SQ_CAPACITY) {
    return {
      ...s,
      error: `栈溢出(容量 ${SQ_CAPACITY}):无法压入 ${item}`,
      log: [...s.log, `✗ 压栈失败:${item} —— 栈已满(overflow)`],
    }
  }
  return {
    ...s,
    stack: [...s.stack, item],
    lastPopped: null,
    error: null,
    log: [...s.log, `push ${item} → 栈顶(LIFO:它将是下一个被弹出的)`],
  }
}

/** 栈:弹栈(pop)—— 取出栈顶;空栈弹出 = underflow */
export function popStack(s: StackQueueState): StackQueueState {
  if (s.stack.length === 0) {
    return {
      ...s,
      error: '栈为空:无法弹出(underflow)',
      log: [...s.log, '✗ 弹栈失败:栈为空(underflow)'],
    }
  }
  const item = s.stack[s.stack.length - 1]!
  return {
    ...s,
    stack: s.stack.slice(0, -1),
    lastPopped: item,
    error: null,
    log: [...s.log, `pop → ${item}(最后压入的最先弹出)`],
  }
}

/** 队列:入队(enqueue)—— 加在队尾 */
export function enqueue(s: StackQueueState, item: string): StackQueueState {
  if (s.queue.length >= SQ_CAPACITY) {
    return {
      ...s,
      error: `队列已满(容量 ${SQ_CAPACITY}):无法入队 ${item}`,
      log: [...s.log, `✗ 入队失败:${item} —— 队列已满`],
    }
  }
  return {
    ...s,
    queue: [...s.queue, item],
    lastDequeued: null,
    error: null,
    log: [...s.log, `enqueue ${item} → 队尾(排队等待)`],
  }
}

/** 队列:出队(dequeue)—— 从队头取出;FIFO */
export function dequeue(s: StackQueueState): StackQueueState {
  if (s.queue.length === 0) {
    return {
      ...s,
      error: '队列为空:无法出队',
      log: [...s.log, '✗ 出队失败:队列为空'],
    }
  }
  const item = s.queue[0]!
  return {
    ...s,
    queue: s.queue.slice(1),
    lastDequeued: item,
    error: null,
    log: [...s.log, `dequeue → ${item}(最早入队的最先离开)`],
  }
}

/** 两个栈模拟一个队列(教学经典):s.in 入队,s.out 出队 */
export function twoStackQueuePush(inStack: string[], item: string, cap = SQ_CAPACITY): string[] {
  return inStack.length >= cap ? inStack : [...inStack, item]
}

export function twoStackQueuePop(inStack: string[], outStack: string[]): {
  inStack: string[]
  outStack: string[]
  popped: string | null
} {
  let out = [...outStack]
  let input = [...inStack]
  if (out.length === 0) {
    // 倒栈:in 全部倒入 out(顺序颠倒 → 实现 FIFO)
    while (input.length > 0) {
      out.push(input.pop()!)
    }
  }
  const popped = out.pop() ?? null
  return { inStack: input, outStack: out, popped }
}
