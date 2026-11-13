import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { MQ_CAPACITY, createMqState, mqTick, scaleConsumer, syncTick } from './model'
import type { MqState } from './model'

/** 消息队列场景:生产者 → 队列(蓄水池)→ 消费者,速率差与削峰动画 */

const VIEW = { width: 840, height: 620 }
const PRODUCER = { x: 110, y: 150 }
const CONSUMER = { x: 110, y: 460 }
const QUEUE_X0 = 340
const QUEUE_Y = 180
const MSG_W = 88
const MSG_STEP = 100
const MSG_ROWS = 2
const MSG_H = 42

class MqScene extends BaseScene<MqState> {
  private producerNode!: NetworkNode
  private consumerNode!: NetworkNode
  private msgBoxes: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }> = []
  private depthChip: SVGTextElement | null = null
  private syncChip: SVGTextElement | null = null
  private rateChips: SVGTextElement[] = []
  private live: MqState | null = null

  constructor() {
    super({ id: 'message-queue', viewBox: VIEW, label: '消息队列:生产者/消费者速率差' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.producerNode = new NetworkNode(renderer, {
      id: 'producer', x: PRODUCER.x, y: PRODUCER.y, width: 150, height: 54, label: '生产者(下单)', glyph: 'PROD',
    })
    this.consumerNode = new NetworkNode(renderer, {
      id: 'consumer', x: CONSUMER.x, y: CONSUMER.y, width: 150, height: 54, label: '消费者(下游)', glyph: 'CONSUMER',
    })

    // 队列框(蓄水池)
    renderer.el('rect', {
      x: QUEUE_X0 - 16, y: QUEUE_Y - 26,
      width: MSG_STEP * 5 + 40, height: MSG_ROWS * MSG_H + 46,
      rx: 12, class: 'tf-jvm-gen',
    }, renderer.layerBg)
    renderer.el('text', { x: QUEUE_X0 - 6, y: QUEUE_Y - 4, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '消息队列(蓄水池:吸收速率差)'

    this.msgBoxes = []
    for (let i = 0; i < MQ_CAPACITY; i++) {
      const row = Math.floor(i / 5)
      const col = i % 5
      const x = QUEUE_X0 + col * MSG_STEP
      const y = QUEUE_Y + row * MSG_H
      const g = renderer.el('g', {}, renderer.layerNodes)
      const rect = renderer.el('rect', { x, y, width: MSG_W, height: MSG_H - 10, rx: 7, class: 'tf-jvm-frame' }, g)
      const text = renderer.el('text', { x: x + MSG_W / 2, y: y + MSG_H / 2 - 2, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, g)
      g.style.opacity = '0'
      this.msgBoxes.push({ g, rect, text })
    }

    this.depthChip = renderer.el('text', { x: QUEUE_X0 + MSG_STEP * 5 - 6, y: QUEUE_Y + MSG_ROWS * MSG_H + 44, 'text-anchor': 'end', class: 'tf-subnet-mono' }, renderer.layerLabels)

    // 速率芯片
    this.rateChips = []
    ;['生产速率', '消费速率', '队列深度', '丢弃'].forEach((t, i) => {
      renderer.el('text', { x: 620, y: 200 + i * 40, class: 'tf-label--muted' }, renderer.layerLabels).textContent = t
      const v = renderer.el('text', { x: 800, y: 200 + i * 40, 'text-anchor': 'end', class: 'tf-cpu-value' }, renderer.layerLabels)
      this.rateChips.push(v)
    })
    this.syncChip = renderer.el('text', { x: 620, y: 380, class: 'tf-ip-error-text' }, renderer.layerLabels)

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 30, text: '生产 > 消费 → 积压(削峰);消费追上 → 填谷。三大价值:异步 · 解耦 · 削峰填谷', kind: 'muted' })
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '新问题:重复消费(幂等)· 分区有序 · 三端防丢失(确认/持久化/手动 ACK)', kind: 'muted' })
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'sync',
        title: '同步调用:下游扛不住,上游被拖死',
        description: '每 tick 10 请求,下游只能处理 3 → 7 个失败!',
        explanation: `下单流程同步调用下游(发短信/加积分):下游每 tick 只能处理 **3** 个,涌入 10 个 → **7 个直接失败**;更糟的是上游被**阻塞**等待 —— 级联失败。右侧「同步模式」就是这个形态。`,
        duration: 1400,
        action: 'sync',
      },
      {
        id: 'mq-intro',
        title: '引入 MQ:异步 + 解耦',
        description: '上游写进队列就返回 —— 不再等下游。',
        explanation: `引入消息队列后,上游把「要做的事」写成**消息**投进队列**立即返回** —— 用户只等核心链路;下游按自己的速率消费。上下游从「强耦合」变成「只依赖队列」:**新增一个关心订单事件的下游,上游零改动**(解耦)。`,
        duration: 1400,
        action: 'mq-intro',
      },
      {
        id: 'burst',
        title: '削峰:洪峰涌入,队列蓄水',
        description: '生产 10/tick,消费 3/tick → 队列深度上涨。',
        explanation: `秒杀洪峰:**生产 10/tick、消费 3/tick**,差额堆进队列 —— 队列像**蓄水池**吸收速率差(削峰)。下游按自己的节奏消化,洪峰过去后队列排空(**填谷**)。队列深度是 MQ 监控的核心指标:持续增长 = 消费能力不足。`,
        duration: 1500,
        action: 'burst',
      },
      {
        id: 'scale',
        title: '扩容消费者:追平积压',
        description: '消费速率 3 → 10,队列快速排空。',
        explanation: `消费者扩容(加实例分摊)后速率追上生产速率,积压排空。注意两个工程细节:**消费实例加多要能分摊**(Kafka 同 group 分区,RabbitMQ 多 consumer);**队列不是无限的** —— 内存型 MQ 要设上限与溢出策略,磁盘型(Kafka)能扛大积压。`,
        duration: 1400,
        action: 'scale',
      },
      {
        id: 'cost',
        title: '代价:重复消费与顺序性',
        description: 'MQ 用复杂度换解耦 —— 消费端必须幂等。',
        explanation: `新问题清单:**重复消费**(生产端重发/消费端重启)→ 消费端**幂等**(按唯一键去重);**顺序性** → 全局有序代价极大,按分区有序妥协(同订单进同分区);**消息丢失** → 三端防:生产端 confirm、Broker 持久化、消费端手动 ACK。判断标准:**能稍后完成的副作用才进 MQ**,要立即拿结果的别用。`,
        duration: 1500,
        action: 'cost',
      },
    ]

    const transitions: StepTransition<MqState>[] = [
      () => syncTick(createMqState(10, 3), 10),
      () => ({ ...createMqState(10, 3), log: ['切换到 MQ 模式:上游写队列即返回'] }),
      s0 => mqTick(s0, 10),
      s0 => scaleConsumer(mqTick(s0, 10), 10),
      s0 => { const t = mqTick(s0, 3); return { ...t, log: [...t.log, '幂等提示:重复消息按唯一键去重,状态机判断已处理'] } },
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): MqState {
    return createMqState(10, 3)
  }

  private effectiveState(stepState: MqState): MqState {
    return this.live ?? stepState
  }

  protected render(stepState: MqState, _opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const renderer = this.renderer
    if (!renderer) return
    void tl_unused(state)

    this.producerNode.setStatus('active')
    this.consumerNode.setStatus(state.syncMode ? 'error' : 'active')

    // 队列格子
    for (let i = 0; i < this.msgBoxes.length; i++) {
      const box = this.msgBoxes[i]
      if (!box) continue
      const msg = state.queue[i]
      const visible = msg !== undefined
      const target = visible ? '1' : '0'
      if (box.text) box.text.textContent = visible ? msg.slice(-8) : ''
      if (box.rect) box.rect.setAttribute('class', `tf-jvm-frame ${visible && state.queue.length >= MQ_CAPACITY ? 'is-front' : ''}`)
      box.g.style.opacity = target
    }

    if (this.depthChip) {
      this.depthChip.textContent = `深度 ${state.queue.length}/${MQ_CAPACITY}`
    }

    const statValues = [
      `${state.syncMode ? 0 : state.producerRate}/tick`,
      `${state.syncMode ? 0 : state.consumerRate}/tick`,
      state.syncMode ? '—(无队列)' : `${state.queue.length}/${MQ_CAPACITY}`,
      String(state.syncMode ? state.dropped : state.dropped),
    ]
    this.rateChips.forEach((el, i) => {
      el.textContent = statValues[i] ?? ''
    })

    if (this.syncChip) {
      this.syncChip.textContent = state.syncMode
        ? `⚠ 同步模式:${state.dropped} 个请求直接失败(上游被拖死)`
        : ''
    }
  }

  protected snapshotData(stepState: MqState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    return {
      rows: [
        { label: '模式', value: state.syncMode ? '同步直调(对照)' : 'MQ 异步', tone: state.syncMode ? 'danger' : 'success' },
        { label: '生产速率', value: `${state.syncMode ? 0 : state.producerRate}/tick` },
        { label: '消费速率', value: `${state.consumerRate}/tick` },
        { label: '队列深度', value: state.syncMode ? '—(无队列)' : `${state.queue.length}/${MQ_CAPACITY}`, tone: state.queue.length >= MQ_CAPACITY ? 'danger' : 'success' },
        { label: '最大深度', value: String(state.maxDepth) },
        { label: '已消费', value: String(state.consumed.length), tone: 'success' },
        { label: '失败/丢弃', value: String(state.dropped), tone: state.dropped ? 'danger' : 'success' },
        { label: '新问题', value: '重复消费→幂等 · 分区有序 · 三端防丢失' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'mq-tick', label: 'MQ tick(生产 10,消费 3)' },
      { name: 'mq-drain', label: '消费追平(速率 10)', description: '扩容消费者,积压排空。' },
      { name: 'sync-tick', label: '同步模式 tick(7 个失败)', danger: true },
      { name: 'reset', label: '复位' },
    ]
  }

  performAction(name: string): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: MqState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'mq-tick':
        apply(mqTick(base(), 10))
        break
      case 'mq-drain':
        apply(scaleConsumer(mqTick(base(), 10), 10))
        break
      case 'sync-tick':
        apply({ ...syncTick({ ...base(), syncMode: true }, 10), syncMode: true })
        break
      case 'reset':
        this.live = null
        this.render(this.states.current, { animate: false, timeline: null, fromIndex: 0 })
        this.events.emit('data', this.getState())
        break
      default:
        break
    }
  }
}

function tl_unused(_s: MqState): void {}

const sceneModule: SceneModule = {
  create: () => new MqScene(),
}

export default sceneModule
