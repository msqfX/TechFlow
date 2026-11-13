/**
 * 消息队列模型:生产者/消费者速率差 + 队列深度(纯函数,可测试)。
 * 演示:同步调用阻塞、MQ 异步解耦、削峰填谷(积压与消化)、幂等。
 */

export interface MqState {
  /** 队列中的消息 */
  queue: string[]
  /** 已消费 */
  consumed: string[]
  /** 生产速率(条/tick) */
  producerRate: number
  /** 消费速率(条/tick) */
  consumerRate: number
  /** 同步模式:直接调用下游(不经过队列) */
  syncMode: boolean
  /** 已经历的 tick 数 */
  ticks: number
  /** 队列最大深度(削峰展示) */
  maxDepth: number
  /** 丢弃数(队列满且同步降级时) */
  dropped: number
  log: string[]
}

export const MQ_CAPACITY = 20

export function createMqState(producerRate: number, consumerRate: number): MqState {
  return {
    queue: [],
    consumed: [],
    producerRate,
    consumerRate,
    syncMode: false,
    ticks: 0,
    maxDepth: 0,
    dropped: 0,
    log: [`生产速率 ${producerRate}/tick,消费速率 ${consumerRate}/tick`],
  }
}

/** 洪峰 tick:生产者写入一批;消费者取一批 */
export function mqTick(s: MqState, incoming: number): MqState {
  const produce = s.syncMode ? 0 : Math.min(incoming, s.producerRate)
  const queue = [...s.queue]
  const produced: string[] = []
  let dropped = 0
  for (let i = 0; i < produce; i++) {
    if (queue.length >= MQ_CAPACITY) {
      dropped += 1 // 队列满:内存型 MQ 溢出丢弃(磁盘型如 Kafka 可扛)
      continue
    }
    const id = `msg-${s.ticks}-${i}`
    queue.push(id)
    produced.push(id)
  }
  return finishTick(s, produced, dropped, queue)
}

function finishTick(s: MqState, produced: string[], dropped: number, queue: string[]): MqState {
  const consumed: string[] = []
  const take = Math.min(s.consumerRate, queue.length)
  for (let i = 0; i < take; i++) {
    consumed.push(queue.shift()!)
  }
  const ticks = s.ticks + 1
  const depth = queue.length
  return {
    ...s,
    queue,
    consumed: [...s.consumed, ...consumed],
    ticks,
    maxDepth: Math.max(s.maxDepth, depth),
    dropped: s.dropped + dropped,
    log: [
      ...s.log,
      `tick ${ticks}:生产 ${produced.length} + 积压消化,消费 ${consumed.length} → 队列深度 ${depth}${dropped ? `,溢出丢弃 ${dropped}` : ''}`,
    ],
  }
}

/** 同步调用 tick:上游直接调下游,下游只处理 consumerRate,其余全部失败(阻塞上游) */
export function syncTick(s: MqState, incoming: number): MqState {
  const handled = Math.min(incoming, s.consumerRate)
  const failed = incoming - handled
  return {
    ...s,
    ticks: s.ticks + 1,
    consumed: [...s.consumed, ...Array.from({ length: handled }, (_, i) => `req-${s.ticks}-${i}`)],
    dropped: s.dropped + failed,
    log: [...s.log, `同步 tick ${s.ticks + 1}:${handled} 成功,${failed} 个直接失败(下游速率上限,上游被拖死)`],
  }
}

/** 消费速率提升(扩容消费者) */
export function scaleConsumer(s: MqState, rate: number): MqState {
  return {
    ...s,
    consumerRate: rate,
    log: [...s.log, `消费者扩容:速率 ${s.consumerRate} → ${rate}/tick(加实例分摊)`],
  }
}

/** 消费端幂等检查(教学):重复消息按 id 去重 */
export function dedupe(consumed: string[]): string[] {
  return [...new Set(consumed)]
}
