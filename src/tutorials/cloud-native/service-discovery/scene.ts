import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Connection } from '@/engine/components/Connection'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  HEARTBEAT_THRESHOLD,
  createRegistryState,
  discover,
  heartbeat,
  instanceCount,
  register,
  tick,
} from './model'
import type { RegistryState } from './model'

/** 服务发现场景:注册中心 + 两个 provider + consumer,注册/心跳/剔除/发现全流程 */

const VIEW = { width: 840, height: 620 }
const REGISTRY = { x: 420, y: 130 }
const PROVIDER_A = { x: 110, y: 320 }
const PROVIDER_B = { x: 110, y: 470 }
const CONSUMER = { x: 700, y: 400 }
const ORDER = 'order-service'

class ServiceDiscoveryScene extends BaseScene<RegistryState> {
  private registryNode!: NetworkNode
  private providerA!: NetworkNode
  private providerB!: NetworkNode
  private consumerNode!: NetworkNode
  private registryListLabel: Label | null = null
  private cacheLabel: Label | null = null
  private heartbeatBadgeA: SVGTextElement | null = null
  private heartbeatBadgeB: SVGTextElement | null = null
  private versionChip: SVGTextElement | null = null
  private removedBanner: SVGTextElement | null = null
  private slots: Packet[] = []
  private live: RegistryState | null = null

  constructor() {
    super({ id: 'service-discovery', viewBox: VIEW, label: '服务注册中心与实例拓扑' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.registryNode = new NetworkNode(renderer, {
      id: 'registry', x: REGISTRY.x, y: REGISTRY.y, width: 170, height: 60, label: '注册中心', glyph: 'REGISTRY',
    })
    this.providerA = new NetworkNode(renderer, {
      id: 'prov-a', x: PROVIDER_A.x, y: PROVIDER_A.y, width: 150, height: 54, label: 'order-service', glyph: 'PROVIDER',
    })
    this.providerB = new NetworkNode(renderer, {
      id: 'prov-b', x: PROVIDER_B.x, y: PROVIDER_B.y, width: 150, height: 54, label: 'order-service', glyph: 'PROVIDER',
    })
    this.consumerNode = new NetworkNode(renderer, {
      id: 'consumer', x: CONSUMER.x, y: CONSUMER.y, width: 150, height: 54, label: '消费者', glyph: 'CONSUMER',
    })

    new Connection(renderer, { id: 'reg-a', from: PROVIDER_A, to: REGISTRY, dashed: true, label: '注册+心跳' })
    new Connection(renderer, { id: 'reg-b', from: PROVIDER_B, to: REGISTRY, dashed: true })
    new Connection(renderer, { id: 'reg-c', from: CONSUMER, to: REGISTRY, dashed: true, label: '订阅/发现' })
    new Connection(renderer, { id: 'call-line', from: CONSUMER, to: PROVIDER_A, arrow: true, dashed: false, label: '调用(客户端负载均衡)' })

    // 注册表(中心右侧)
    this.registryListLabel = new Label(renderer, { x: 540, y: 190, text: '', kind: 'mono', anchor: 'start' })
    this.versionChip = renderer.el('text', { x: 540, y: 166, class: 'tf-subnet-mono' }, renderer.layerLabels)

    // consumer 缓存(右下)
    this.cacheLabel = new Label(renderer, { x: 620, y: 490, text: '', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 620, y: 466, text: 'consumer 本地缓存:', kind: 'muted', anchor: 'start' })

    // 心跳徽标
    this.heartbeatBadgeA = renderer.el('text', { x: PROVIDER_A.x + 80, y: PROVIDER_A.y - 14, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.heartbeatBadgeB = renderer.el('text', { x: PROVIDER_B.x + 80, y: PROVIDER_B.y - 14, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, renderer.layerLabels)

    // 剔除横幅
    this.removedBanner = renderer.el('text', { x: VIEW.width / 2, y: 30, 'text-anchor': 'middle', class: 'tf-ip-error-text' }, renderer.layerLabels)
    this.removedBanner.textContent = ''

    new Label(renderer, { x: 120, y: 562, text: `心跳缺失 ${HEARTBEAT_THRESHOLD} 个周期 → 注册中心剔除实例并推送变更`, kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 120, y: 586, text: '对照 DNS:注册中心是应用层实时电话簿(秒级),DNS 是公网通用(分钟级)', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '注册中心短暂宕机也不怕:consumer 手里的缓存列表还能用(有损服务)', kind: 'muted' })

    this.slots = []
    for (let i = 0; i < 10; i++) {
      this.slots.push(new Packet(renderer, { id: `sd-slot-${i}`, color: 'accent', shape: 'rect', width: 70, height: 20 }))
    }
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'register',
        title: '服务实例注册',
        description: 'order-service 两个实例上线,上报地址。',
        explanation: `服务启动后向注册中心**上报自己**(服务名 + IP:端口 + 元数据)—— 「order-service 有两个实例」。这一步之后,调用方才第一次有能力按名字找到它。新实例注册会**推送变更**给订阅方(版本号 +1)。`,
        duration: 1400,
        action: 'register',
      },
      {
        id: 'heartbeat',
        title: '心跳保活',
        description: '实例周期性发心跳证明「我还活着」。',
        explanation: `注册中心靠**心跳**判断实例存活:每个实例周期性续约(如每 5 秒);缺失 ${HEARTBEAT_THRESHOLD} 个周期即被判定死亡并**剔除**。优雅停机的服务会**主动注销**而非等超时 —— 发布新版本时流量平滑切换的机制底座就在这里。`,
        duration: 1400,
        action: 'heartbeat',
      },
      {
        id: 'subscribe',
        title: '消费者订阅 + 本地缓存',
        description: '拉取实例列表缓存到内存,变更时收到推送。',
        explanation: `consumer 启动时**订阅** order-service:拉取实例列表缓存到本地内存。此后调用**不再询问注册中心** —— 直接从缓存列表按客户端负载均衡(轮询/加权)挑一个。注册中心因此不会成为调用瓶颈。`,
        duration: 1400,
        action: 'subscribe',
      },
      {
        id: 'call',
        title: '调用:从缓存挑一个实例',
        description: '客户端负载均衡 —— 选择权在调用方手里。',
        explanation: `调用时 consumer 从本地缓存挑选实例(轮询分摊流量)。对照 Nginx:**服务端负载均衡**的选路发生在中间代理;这里是**客户端负载均衡**,少一跳网络。注册中心宕机一小会儿也不怕 —— 缓存列表还能用,只是暂时收不到变更(有损服务思想)。`,
        duration: 1400,
        action: 'call',
      },
      {
        id: 'timeout',
        title: '挑战:实例 B 宕机 → 心跳超时被剔除',
        description: '缺失 3 个周期 → 剔除 + 推送 → consumer 缓存更新。',
        explanation: `实例 B 宕机不再续约:注册中心在 **${HEARTBEAT_THRESHOLD} 个心跳周期**后把它剔除,**推送变更**,consumer 的缓存列表立即更新 —— 后续调用不再打向死实例。这就是微服务「自动摘除故障节点」的机制底座。`,
        duration: 1600,
        action: 'timeout',
      },
    ]

    const transitions: StepTransition<RegistryState>[] = [
      s => register(register(register(s ?? createRegistryState(), ORDER, '10.0.0.11:8080'), ORDER, '10.0.0.12:8080'), 'user-service', '10.0.0.21:9000'),
      s => heartbeat(heartbeat(s, ORDER, '10.0.0.11:8080'), ORDER, '10.0.0.12:8080'),
      s => discover(s, ORDER),
      s => discover(s, ORDER),
      s => tick(tick(tick(s))),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): RegistryState {
    return createRegistryState()
  }

  private effectiveState(stepState: RegistryState): RegistryState {
    return this.live ?? stepState
  }

  protected render(stepState: RegistryState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    const orderList = state.services[ORDER] ?? []
    const hasA = orderList.some(i => i.addr === '10.0.0.11:8080')
    const hasB = orderList.some(i => i.addr === '10.0.0.12:8080')

    this.providerA.setStatus(hasA ? (orderList.find(i => i.addr === '10.0.0.11:8080')!.missedBeats > 0 ? 'processing' : 'success') : 'error')
    this.providerB.setStatus(hasB ? 'success' : 'dim')
    this.consumerNode.setStatus(state.consumerCache[ORDER]?.length ? 'active' : 'idle')
    this.registryNode.setStatus('idle')

    if (this.registryListLabel) {
      const lines: string[] = []
      for (const [name, list] of Object.entries(state.services)) {
        lines.push(`${name} ×${list.length}`)
      }
      this.registryListLabel.setText(lines.length ? lines.join(' · ') : '(空)')
    }
    if (this.versionChip) {
      this.versionChip.textContent = `注册表 v${state.version}`
    }
    if (this.cacheLabel) {
      const cached = state.consumerCache[ORDER] ?? []
      this.cacheLabel.setText(cached.length ? `[${cached.join(', ')}]` : '(未订阅)')
    }
    const instA = orderList.find(i => i.addr === '10.0.0.11:8080')
    if (this.heartbeatBadgeA) {
      this.heartbeatBadgeA.textContent = hasA && instA ? `心跳缺失 ${instA.missedBeats}/${HEARTBEAT_THRESHOLD}` : ''
      this.heartbeatBadgeA.setAttribute('class', `tf-subnet-mono ${instA && instA.missedBeats > 0 ? '' : 'ok'}`)
    }
    if (this.heartbeatBadgeB) {
      this.heartbeatBadgeB.textContent = hasB ? '心跳正常' : ''
    }
    if (this.removedBanner) {
      const removed = [...state.log].reverse().find(l => l.includes('剔除')) ?? null
      this.removedBanner.textContent = removed ? `⚠ ${removed}` : ''
    }

    // 报文:最近注册/心跳/发现包沿各自连线
    const events: Array<{ from: string; kind: string; label: string }> = [
      ...(hasA ? [{ from: 'prov-a', kind: 'heartbeat', label: '心跳' }] : []),
      ...(hasB ? [{ from: 'prov-b', kind: 'heartbeat', label: '心跳' }] : []),
      ...(state.consumerCache[ORDER]?.length ? [{ from: 'consumer', kind: 'discover', label: '发现' }] : []),
    ]
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (!slot) continue
      const ev = events[i]
      if (!ev) {
        slot.show(false)
        continue
      }
      const from = ev.from === 'prov-a' ? PROVIDER_A : ev.from === 'prov-b' ? PROVIDER_B : CONSUMER
      const mid = { x: (from.x + REGISTRY.x) / 2, y: (from.y + REGISTRY.y) / 2 }
      slot.placeAt(from.x + (mid.x - from.x) * 0.5, from.y + (mid.y - from.y) * 0.5)
      slot.show(true)
      void tl
    }
  }

  protected snapshotData(stepState: RegistryState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const orderList = state.services[ORDER] ?? []
    return {
      rows: [
        { label: '注册表版本', value: `v${state.version}`, tone: 'accent' },
        { label: 'order-service 实例', value: orderList.length ? orderList.map(i => i.addr).join(' | ') : '(无 — 全部下线!)', tone: orderList.length ? 'success' : 'danger' },
        { label: 'user-service 实例', value: String(instanceCount(state, 'user-service')) },
        { label: 'consumer 缓存', value: (state.consumerCache[ORDER] ?? []).join(' | ') || '(未订阅)', tone: (state.consumerCache[ORDER] ?? []).length ? 'success' : 'default' },
        { label: '心跳阈值', value: `${HEARTBEAT_THRESHOLD} 个周期` },
        { label: '最近事件', value: state.lastEvent ?? '—', tone: state.lastEvent?.startsWith('DEREGISTER') ? 'danger' : 'default' },
        { label: '一致性模式', value: 'AP(Eureka/Nacos 临时)· CP(ZK/Consul)' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'register-new', label: '扩容:新实例注册', description: '高峰扩容 —— 新实例注册并推送变更。' },
      { name: 'heartbeat', label: '发送心跳续约' },
      { name: 'tick', label: '注册中心时钟推进', description: '挑战:连续推进 3 次,未续约实例被剔除。', danger: true },
      { name: 'discover', label: 'consumer 发现(刷新缓存)' },
      { name: 'reset', label: '复位' },
    ]
  }

  performAction(name: string): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: RegistryState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'register-new':
        apply(register(base(), ORDER, `10.0.0.1${Math.floor(Math.random() * 9)}:8080`))
        break
      case 'heartbeat':
        apply(heartbeat(base(), ORDER, '10.0.0.11:8080'))
        break
      case 'tick':
        apply(tick(base()))
        break
      case 'discover':
        apply(discover(base(), ORDER))
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

const sceneModule: SceneModule = {
  create: () => new ServiceDiscoveryScene(),
}

export default sceneModule
