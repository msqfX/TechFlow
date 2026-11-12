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
  EDGE_NODES,
  cnameResponse,
  createCdnState,
  deliverToUser,
  gslbSchedule,
  purgeEdge,
  requestEdge,
  serveOrFetchOrigin,
  switchRegion,
} from './model'
import type { CdnState } from './model'

/** CDN 场景:解析链 + 调度 + 边缘缓存/回源 */

const VIEW = { width: 840, height: 640 }
const NODE_POS: Record<string, { x: number; y: number }> = {
  user: { x: 90, y: 170 },
  localDns: { x: 90, y: 400 },
  authDns: { x: 300, y: 90 },
  gslb: { x: 520, y: 90 },
  'edge-gz': { x: 330, y: 400 },
  'edge-sh': { x: 510, y: 400 },
  'edge-bj': { x: 690, y: 400 },
  origin: { x: 700, y: 190 },
}

class CdnScene extends BaseScene<CdnState> {
  private nodes = new Map<string, NetworkNode>()
  private edgeCacheChips = new Map<string, SVGTextElement>()
  private hitBadge: SVGTextElement | null = null
  private slots: Packet[] = []
  private regionChip: SVGTextElement | null = null

  constructor() {
    super({ id: 'cdn', viewBox: VIEW, label: 'CDN 调度与边缘缓存拓扑' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    const mk = (id: string, label: string, glyph: string, w = 128, h = 50) => {
      const pos = NODE_POS[id]!
      this.nodes.set(id, new NetworkNode(renderer, { id, x: pos.x, y: pos.y, width: w, height: h, label, glyph }))
    }
    mk('user', '用户', '你', 110)
    mk('localDns', '本地 DNS', 'LDNS')
    mk('authDns', '源站权威 DNS', 'AUTH')
    mk('gslb', 'CDN 调度 GSLB', 'GSLB')
    mk('edge-gz', '广州边缘', 'EDGE')
    mk('edge-sh', '上海边缘', 'EDGE')
    mk('edge-bj', '北京边缘', 'EDGE')
    mk('origin', '源站', 'ORIGIN')

    const conn = (a: string, b: string, dashed = true, label?: string) => {
      const pa = NODE_POS[a]!
      const pb = NODE_POS[b]!
      new Connection(renderer, { id: `${a}-${b}`, from: { x: pa.x, y: pa.y }, to: { x: pb.x, y: pb.y }, dashed, label, arrow: false })
    }
    conn('user', 'localDns', false, '解析')
    conn('localDns', 'authDns', true)
    conn('localDns', 'gslb', true)
    conn('user', 'edge-gz', false, '')
    conn('user', 'edge-sh', false, '')
    conn('user', 'edge-bj', false, '')
    conn('edge-bj', 'origin', false, '回源')

    // 边缘缓存芯片
    EDGE_NODES.forEach((n, i) => {
      const pos = NODE_POS[n.id]!
      const chip = renderer.el('text', {
        x: pos.x,
        y: pos.y + 52,
        'text-anchor': 'middle',
        class: 'tf-subnet-mono',
      }, renderer.layerLabels)
      this.edgeCacheChips.set(n.id, chip)
      void i
    })

    this.regionChip = renderer.el('text', { x: 90, y: 112, 'text-anchor': 'middle', class: 'tf-label--accent' }, renderer.layerLabels)

    this.hitBadge = renderer.el('text', { x: VIEW.width / 2, y: 560, 'text-anchor': 'middle', class: 'tf-subnet-result' }, renderer.layerLabels)

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '解析链(CNAME→GSLB)决定「去哪个边缘」;缓存决定「边缘能不能直接给」', kind: 'muted' })

    this.slots = []
    for (let i = 0; i < 12; i++) {
      this.slots.push(new Packet(renderer, { id: `cdn-slot-${i}`, color: 'accent', shape: 'rect', width: 78, height: 22 }))
    }
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'request',
        title: '用户请求静态资源',
        description: 'GET app.js —— 但先要解析域名。',
        explanation: `用户(广州)请求 \`app.js\`。这个域名已接入 CDN:它在源站权威 DNS 里不是 A 记录,而是一条 **CNAME**,指向 CDN 的调度域名。解析链马上会变长 —— 但换来的是「每次解析都顺便完成一次就近调度」。`,
        duration: 1200,
        action: 'request',
      },
      {
        id: 'cname',
        title: '权威 DNS 返回 CNAME 委托',
        description: 'static.example.com → cdn.example.com.cn。',
        explanation: '**CNAME 是 CDN 接入的开关**:源站权威 DNS 不再回答 IP,而是把解析权委托给 CDN 厂商的调度域名。用户无感知,回滚也只需删掉这条 CNAME。',
        duration: 1300,
        action: 'cname',
      },
      {
        id: 'gslb',
        title: 'GSLB 就近调度',
        description: '本地 DNS 问 CDN 调度系统,拿到广州边缘节点 IP。',
        explanation: `CDN 的 **GSLB**(全局负载均衡)看「发来查询的本地 DNS 属于哪个区域/运营商」(大致代表用户位置),结合节点负载与健康度,返回**就近边缘节点**的 IP。调度精度受本地 DNS 位置限制 —— HTTPDNS/EDNS 是增强方案。`,
        duration: 1400,
        action: 'gslb',
      },
      {
        id: 'edge-request',
        title: '请求直达边缘节点',
        description: '用户与广州边缘建立连接,GET /app.js。',
        explanation: `用户拿到的 IP 是**边缘节点**的,后续 TCP/TLS 都在用户与边缘之间完成(边缘持有证书)。请求到达后,边缘节点检查自己的缓存表:有没有 app.js?`,
        duration: 1200,
        action: 'edge-request',
      },
      {
        id: 'miss',
        title: '缓存未命中 → 回源',
        description: '广州节点没有 app.js → 向源站取。',
        explanation: `边缘没有这份文件(**X-Cache: MISS**),节点向源站发起回源请求。注意回源走的是 CDN 内部的优化链路;源站此刻承受的请求只有「各边缘的第一次」,而不是全部用户 —— 这就是源站卸载。`,
        duration: 1400,
        action: 'miss',
      },
      {
        id: 'cache-write',
        title: '取回并在边缘缓存',
        description: '按 TTL 缓存,下一位用户即命中。',
        explanation: `回源取回的副本按 **TTL** 缓存在广州节点。此后所有(广州)请求同一个文件的用户都直接命中 —— 一次回源,服务整个区域的用户。命中率由此累积:热门内容命中率轻松 95%+。`,
        duration: 1300,
        action: 'cache-write',
      },
      {
        id: 'deliver',
        title: '内容送达用户',
        description: '首字节时间主要来自回源链路。',
        explanation: '首次请求略慢(回源),之后的请求都是 <10ms 的边缘命中。发布新版本时用**预热**提前推送、用**刷新(Purge)**强制清掉旧副本 —— 两个操作配合 TTL,是 CDN 运维的日常。',
        duration: 1200,
        action: 'deliver',
      },
    ]

    const transitions: StepTransition<CdnState>[] = [
      s => createCdnState(s.file, s.userRegion),
      s => cnameResponse(s),
      s => gslbSchedule(s),
      s => requestEdge(s),
      s => serveOrFetchOrigin(s),
      s => ({ ...s, log: [...s.log, '边缘缓存已写入(按 TTL)'] }),
      s => deliverToUser(s),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): CdnState {
    return createCdnState()
  }

  private effectiveState(stepState: CdnState): CdnState {
    return this.live ?? stepState
  }

  private live: CdnState | null = null

  private nodePoint(id: string): { x: number; y: number } {
    return NODE_POS[id] ?? { x: 90, y: 170 }
  }

  protected render(stepState: CdnState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    // 节点状态
    for (const [id, node] of this.nodes.entries()) {
      const active =
        (id === 'user' && state.packets.some(p => p.to === 'user' || p.from === 'user' && p.kind === 'request')) ||
        state.scheduledNode === id
      if (active) node.setStatus('active')
      else node.setStatus('idle')
    }

    // 用户地区芯片
    if (this.regionChip) this.regionChip.textContent = `用户:${state.userRegion}`

    // 边缘缓存芯片
    for (const [id, chip] of this.edgeCacheChips.entries()) {
      const files = state.edgeCaches[id] ?? []
      const isScheduled = state.scheduledNode === id
      chip.textContent = `缓存: ${files.length ? files.join(', ') : '(空)'}`
      chip.setAttribute('class', `tf-subnet-mono ${isScheduled ? 'ok' : ''}`)
    }

    // 命中徽标
    if (this.hitBadge) {
      if (state.cacheHit === true) {
        this.hitBadge.textContent = 'X-Cache: HIT —— 边缘直接返回'
        this.hitBadge.setAttribute('class', 'tf-subnet-result ok')
        this.hitBadge.style.opacity = '1'
      } else if (state.cacheHit === false) {
        this.hitBadge.textContent = 'X-Cache: MISS —— 需要回源'
        this.hitBadge.setAttribute('class', 'tf-subnet-result bad')
        this.hitBadge.style.opacity = '1'
      } else {
        this.hitBadge.style.opacity = '0'
      }
    }

    // 报文
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (!slot) continue
      const pkt = state.packets[i]
      if (!pkt) {
        slot.show(false)
        continue
      }
      const settled = !opts.animate || i < state.packets.length - 1 || tl === null
      const color =
        pkt.kind === 'response' || pkt.kind === 'deliver' || pkt.kind === 'origin-return'
          ? 'success'
          : pkt.kind === 'origin-fetch'
            ? 'warning'
            : 'accent'
      slot.options.color = color
      const body = slot.group.querySelector('.tf-packet-body-rect')
      if (body) body.setAttribute('class', `tf-packet-body-rect tf-packet-body--${color}`)

      const from = this.nodePoint(pkt.from)
      const to = this.nodePoint(pkt.to)
      if (settled) {
        slot.placeAt(to.x, to.y - 40)
        slot.show(true)
        continue
      }
      slot.placeAt(from.x, from.y - 40)
      slot.show(true)
      tl.to(slot.group, { x: to.x - from.x, y: to.y - 40 - from.y + 40, duration: 0.55, ease: 'power1.inOut' }, 0)
    }
  }

  protected snapshotData(stepState: CdnState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const edge = state.scheduledNode ? EDGE_NODES.find(n => n.id === state.scheduledNode) : undefined
    const last = state.packets[state.packets.length - 1]
    return {
      rows: [
        { label: '请求文件', value: `/${state.file}`, tone: 'accent' },
        { label: '用户位置', value: state.userRegion },
        { label: '调度节点', value: edge ? `${edge.region}(${edge.ip})` : '未调度', tone: edge ? 'accent' : 'default' },
        { label: '边缘缓存', value: edge ? (state.edgeCaches[edge.id] ?? []).join(', ') || '(空)' : '—' },
        { label: 'X-Cache', value: state.cacheHit === true ? 'HIT' : state.cacheHit === false ? 'MISS' : '—', tone: state.cacheHit === true ? 'success' : state.cacheHit === false ? 'warning' : 'default' },
        { label: '回源次数', value: String(state.originHits), tone: state.originHits > 0 ? 'warning' : 'success' },
        { label: '最近报文', value: last ? `${last.from} → ${last.to}: ${last.label}` : '(无)' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-region',
        label: '切换用户位置',
        description: '观察 GSLB 调度到不同边缘节点。',
        params: [
          {
            name: 'region',
            label: '用户位置',
            type: 'select',
            options: [
              { value: '广州', label: '广州' },
              { value: '上海', label: '上海' },
              { value: '北京', label: '北京' },
            ],
          },
        ],
      },
      {
        name: 'set-file',
        label: '请求另一个文件',
        description: '切换未缓存文件触发回源。',
        params: [
          {
            name: 'file',
            label: '文件',
            type: 'select',
            options: [
              { value: 'app.js', label: 'app.js' },
              { value: 'logo.svg', label: 'logo.svg' },
              { value: 'video.mp4', label: 'video.mp4(全新)' },
            ],
          },
        ],
      },
      {
        name: 'purge',
        label: '刷新边缘缓存(Purge)',
        description: '挑战:清空全部边缘副本,下一次请求将回源。',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: CdnState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'set-region': {
        const region = String(params?.region ?? '广州') as CdnState['userRegion']
        apply(switchRegion(base(), region))
        break
      }
      case 'set-file': {
        const file = String(params?.file ?? 'app.js')
        let st: CdnState = { ...base(), file, cacheHit: null, scheduledNode: base().scheduledNode, log: [...base().log, `请求切换为 ${file}`] }
        st = requestEdge(st)
        st = serveOrFetchOrigin(st)
        st = deliverToUser(st)
        apply(st)
        break
      }
      case 'purge':
        apply(purgeEdge(base()))
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new CdnScene(),
}

export default sceneModule
