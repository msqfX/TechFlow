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
  ARP_DEVICES,
  arpSpoof,
  cacheHit,
  clearArpCache,
  createArpState,
  sendArpReply,
  sendArpRequest,
} from './model'
import type { ArpState } from './model'

/** ARP 协议场景:广播请求泛洪 + 单播应答 + ARP 缓存表 + 欺骗演示 */

const VIEW = { width: 840, height: 620 }
const SW = { x: 420, y: 120 }
const PC_Y = 320
const PC_X = [110, 300, 490, 680] as const

class ArpScene extends BaseScene<ArpState> {
  private pcNodes: NetworkNode[] = []
  private tableRows: Array<{ g: SVGGElement; ip: SVGTextElement; mac: SVGTextElement; via: SVGTextElement }> = []
  private slots: Packet[] = []
  private queryLabel: SVGTextElement | null = null
  private spoofBanner: SVGGElement | null = null
  private spoofText: SVGTextElement | null = null

  constructor() {
    super({ id: 'arp', viewBox: VIEW, label: 'ARP 请求与应答拓扑' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    new NetworkNode(renderer, {
      id: 'switch', x: SW.x, y: SW.y, width: 190, height: 60, label: '交换机', glyph: 'SWITCH',
    }).setStatus('idle')
    this.pcNodes = PC_X.map((x, i) =>
      new NetworkNode(renderer, {
        id: `pc${i + 1}`, x, y: PC_Y, width: 130, height: 56,
        label: ARP_DEVICES[i]!.name, glyph: ARP_DEVICES[i]!.ip.replace('192.168.1.', '.'),
      }),
    )
    PC_X.map((x, i) =>
      new Connection(renderer, {
        id: `line-${i}`,
        from: { x, y: PC_Y - 28 },
        to: { x: SW.x - 60 + i * 40, y: SW.y + 30 },
        arrow: false,
      }),
    )

    new Label(renderer, { x: 110, y: 430, text: 'PC1 的 ARP 缓存表(请求方)', kind: 'accent', anchor: 'start' })
    this.tableRows = []
    for (let i = 0; i < 4; i++) {
      const g = renderer.el('g', {}, renderer.layerLabels)
      renderer.el('rect', { x: 110, y: 442 + i * 32, width: 340, height: 26, rx: 6, class: 'tf-subnet-row-bg' }, g)
      const ip = renderer.el('text', { x: 126, y: 460 + i * 32, class: 'tf-subnet-mono' }, g)
      const mac = renderer.el('text', { x: 230, y: 460 + i * 32, class: 'tf-subnet-mono' }, g)
      const via = renderer.el('text', { x: 420, y: 460 + i * 32, class: 'tf-label--muted' }, g)
      g.style.opacity = '0'
      this.tableRows.push({ g, ip, mac, via })
    }

    new Label(renderer, { x: 640, y: 445, text: 'MAC 地址表(交换机层面,见交换机教程)', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: 640, y: 470, text: '蓝色 = 广播请求(泛洪)', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 640, y: 495, text: '绿色 = 单播应答(精准)', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 640, y: 520, text: '红色 = 伪造应答(欺骗)', kind: 'mono', anchor: 'start' })

    this.queryLabel = renderer.el('text', { x: VIEW.width / 2, y: 218, 'text-anchor': 'middle', class: 'tf-label--mono' }, renderer.layerLabels)

    this.spoofBanner = renderer.el('g', {}, renderer.layerOverlay)
    renderer.el('rect', { x: 110, y: 196, width: 500, height: 34, rx: 8, class: 'tf-ip-error-bg' }, this.spoofBanner)
    this.spoofText = renderer.el('text', { x: 126, y: 218, class: 'tf-ip-error-text' }, this.spoofBanner)
    this.spoofBanner.style.display = 'none'

    this.slots = []
    for (let i = 0; i < 10; i++) {
      this.slots.push(new Packet(renderer, { id: `arp-slot-${i}`, color: 'accent', shape: 'rect', width: 84, height: 24 }))
    }
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: 'PC1 要给 PC2 发 IP 包',
        description: 'IP 已知(192.168.1.2),MAC 未知。',
        explanation:
          '以太网帧头部需要**目的 MAC**,而应用层只给了目的 **IP**。三层能跨网段路由,二层只会认 MAC —— 在把包交给网卡之前,PC1 必须先解决「IP → MAC」的翻译问题。此刻四台设备的 ARP 缓存都是空的。',
        duration: 1300,
        action: 'init',
      },
      {
        id: 'cache-miss',
        title: '查本地 ARP 缓存:未命中',
        description: '没有 192.168.1.2 的记录 → 必须发 ARP 请求。',
        explanation: '先查缓存是 ARP 的第一动作:**命中就零开销直接发**,未命中才发起一次广播解析。缓存的存在让「第一次贵、之后免费」。',
        duration: 1100,
        action: 'cache-miss',
      },
      {
        id: 'broadcast',
        title: '广播 ARP 请求',
        description: 'Who has 192.168.1.2? Tell 192.168.1.1 —— 泛洪全网段。',
        explanation: 'PC1 发出**目的 MAC = FF:FF:FF:FF:FF:FF** 的广播帧,交换机泛洪到除入口外的所有端口。注意请求报文里带着完整的**源 IP + 源 MAC** —— 这个细节马上会用到。',
        duration: 1500,
        action: 'broadcast',
      },
      {
        id: 'everyone-learns',
        title: '所有设备收到,顺带学习 PC1',
        description: 'PC2/PC3/PC4 的缓存都记下了 (192.168.1.1 → MAC1)。',
        explanation: '**每一台收到请求的设备都会把发送方写进自己的缓存** —— 因为请求报文里明晃晃写着源 IP 和源 MAC,不记白不记。这叫「顺带学习」,是 ARP 设计里很聪明的一笔:一次广播,全网受益。',
        duration: 1400,
        action: 'everyone-learns',
      },
      {
        id: 'reply',
        title: 'PC2 单播应答',
        description: '192.168.1.2 is-at AA:BB:CC:00:00:02 —— 只发给 PC1。',
        explanation: '只有 IP 匹配的 PC2 会处理请求并应答;PC3/PC4 发现问的不是自己,**直接丢弃**(它们只是被广播打扰了一下)。应答是**单播**:目的 MAC = PC1,精准送达,不再泛洪。',
        duration: 1500,
        action: 'reply',
      },
      {
        id: 'cache-write',
        title: 'PC1 写入缓存,开始正式通信',
        description: '(192.168.1.2 → MAC2) 进入 PC1 的缓存表。',
        explanation: 'PC1 收到应答,把映射写入缓存(带老化时间)。**下一次**再给 PC2 发包时缓存命中,直接封装帧发送 —— 一次广播解析,后续全程零开销。',
        duration: 1300,
        action: 'cache-write',
      },
      {
        id: 'hit',
        title: '再次通信:缓存命中',
        description: '不再广播,直接发数据。',
        explanation: '观察右侧操作:清空缓存再发一次,会重新经历广播解析。真实网络里 ARP 缓存命中率极高,广播流量与「新设备/新连接」频率正相关 —— 缓存老化(约 60s~2min)则是「设备变更后旧记录不会永久生效」的保证。',
        duration: 1300,
        action: 'hit',
      },
      {
        id: 'spoof',
        title: 'ARP 欺骗:协议的先天弱点',
        description: 'PC3 伪造应答宣称自己是网关 —— 全网缓存被污染。',
        explanation:
          '**ARP 应答没有任何认证**,谁都可以声称「192.168.1.1 is-at 我的MAC」。攻击者持续伪造应答污染全网缓存,流量先经过它 —— 中间人窃听。防护:交换机 DAI(动态 ARP 检测)、网关静态绑定,以及全站 HTTPS 让窃听者看不懂。右侧挑战模式可以注入欺骗,观察缓存表被污染的过程。',
        duration: 1600,
        action: 'spoof',
      },
    ]

    const transitions: StepTransition<ArpState>[] = [
      () => createArpState(),
      s => ({ ...s, active: 'PC1', log: [...s.log, 'PC1 查 ARP 缓存:未命中'] }),
      s => sendArpRequest(s, 'PC1', '192.168.1.2'),
      s => {
        const after = { ...s }
        // 顺带学习已在 sendArpRequest 中完成;此步仅强调
        return { ...after, log: [...after.log, 'PC2/PC3/PC4 都把 (192.168.1.1 → MAC1) 写入了自己的缓存'] }
      },
      s => sendArpReply(s, 'PC2', 'PC1'),
      s => ({ ...s, active: 'PC1', log: [...s.log, 'PC1 缓存:(192.168.1.2 → MAC2),可以正式发包了'] }),
      s => ({ ...s, active: 'PC1', log: [...s.log, '再次发送:缓存命中,不再广播'] }),
      s => arpSpoof(s, 'PC3', '192.168.1.1'),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): ArpState {
    return createArpState()
  }

  private effectiveState(stepState: ArpState): ArpState {
    return this.live ?? stepState
  }

  private live: ArpState | null = null

  private devicePoint(name: string): { x: number; y: number } {
    const idx = ARP_DEVICES.findIndex(d => d.name === name)
    return { x: PC_X[idx] ?? 110, y: PC_Y }
  }

  protected render(stepState: ArpState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    // 节点状态
    this.pcNodes.forEach((node, i) => {
      const name = ARP_DEVICES[i]!.name
      node.setStatus(state.active === name ? 'active' : name === 'PC3' && state.spoofed ? 'error' : 'idle')
    })

    // PC1 缓存表(教学重点)
    const pc1Table = state.caches.PC1 ?? []
    for (let i = 0; i < this.tableRows.length; i++) {
      const row = this.tableRows[i]
      if (!row) continue
      const entry = pc1Table[i]
      if (entry) {
        row.ip.textContent = entry.ip
        row.mac.textContent = entry.mac
        row.via.textContent = entry.learnedVia === 'spoof' ? '(被污染!)' : entry.learnedVia === 'reply' ? '应答写入' : '请求顺带学习'
      }
      const target = entry ? '1' : '0'
      if (tl) tl.to(row.g, { opacity: target, duration: 0.25 }, i * 0.1)
      else row.g.style.opacity = target
    }

    if (this.queryLabel) {
      const last = state.packets[state.packets.length - 1]
      this.queryLabel.textContent = last
        ? `${last.sender}:「Who has ${last.queryIp}? Tell ${last.sender === 'PC3' ? '192.168.1.1' : last.sender}.」`
        : ''
    }

    if (this.spoofBanner && this.spoofText) {
      this.spoofText.textContent = state.spoofed ? '⚠ ARP 欺骗:全网把 192.168.1.1 解析成了 PC3 的 MAC' : ''
      this.spoofBanner.style.display = state.spoofed ? 'block' : 'none'
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
      const color = pkt.lost ? 'danger' : pkt.kind === 'request' ? 'accent' : pkt.kind === 'reply' ? 'success' : 'danger'
      slot.options.color = color
      const body = slot.group.querySelector('.tf-packet-body-rect')
      if (body) body.setAttribute('class', `tf-packet-body-rect tf-packet-body--${color}`)

      const isBroadcast = pkt.broadcast
      const targetName = pkt.target ?? pkt.sender
      if (settled) {
        const p = this.devicePoint(pkt.lost ? pkt.sender : isBroadcast ? state.devices.find(d => d.name !== pkt.sender)!.name : targetName)
        slot.placeAt(p.x, p.y - 46)
        slot.show(true)
        continue
      }
      const src = this.devicePoint(pkt.sender)
      slot.placeAt(src.x, src.y - 46)
      slot.show(true)
      if (pkt.lost) {
        tl.to(slot.group, { x: (SW.x - src.x) / 2, y: SW.y - src.y - 46, duration: 0.5 }, 0)
        tl.to(slot.group, { opacity: 0.5, duration: 0.25 }, 0.4)
      } else if (isBroadcast) {
        // 广播:先到交换机,再向三台设备泛洪(取第一跳示意)
        tl.to(slot.group, { x: SW.x - src.x, y: SW.y + 10 - src.y + 46 - 46, duration: 0.4 }, 0)
        const t0 = this.devicePoint('PC2')
        tl.to(slot.group, { x: t0.x - SW.x, y: t0.y - 46 - SW.y - 10, duration: 0.5 }, 0.45)
      } else {
        const dst = this.devicePoint(targetName)
        tl.to(slot.group, { x: dst.x - src.x, y: dst.y - 46 - src.y + 46, duration: 0.6, ease: 'power1.inOut' }, 0)
      }
    }
  }

  protected snapshotData(stepState: ArpState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const last = state.packets[state.packets.length - 1]
    return {
      rows: [
        { label: 'PC1 缓存表', value: (state.caches.PC1 ?? []).map(e => `${e.ip}→${e.mac.slice(-5)}`).join(' | ') || '(空)', tone: (state.caches.PC1 ?? []).some(e => e.learnedVia === 'spoof') ? 'danger' : 'success' },
        { label: 'PC2 缓存表', value: (state.caches.PC2 ?? []).map(e => `${e.ip}→${e.mac.slice(-5)}`).join(' | ') || '(空)' },
        { label: '最近报文', value: last ? `${last.kind === 'request' ? '广播请求' : last.kind === 'reply' ? '单播应答' : '伪造应答'}: Who has ${last.queryIp}?` : '(无)', tone: last?.kind === 'spoof' ? 'danger' : 'accent' },
        { label: '广播 vs 单播', value: last ? (last.broadcast ? '广播帧(泛洪全网段)' : '单播帧(精准送达)') : '—' },
        { label: '缓存污染', value: state.spoofed ? '已被 PC3 污染' : '无', tone: state.spoofed ? 'danger' : 'success' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'resolve',
        label: '解析一个 IP',
        description: '任选源设备与目标 IP,观察缓存命中/未命中。',
        params: [
          { name: 'src', label: '源设备', type: 'select', options: ARP_DEVICES.map(d => ({ value: d.name, label: d.name })) },
          { name: 'ip', label: '目标 IP', type: 'select', options: ARP_DEVICES.map(d => ({ value: d.ip, label: `${d.name}(${d.ip})` })) },
        ],
      },
      {
        name: 'clear-cache',
        label: '清空全部缓存',
        description: '模拟老化或设备重启,再次通信将重新广播。',
      },
      {
        name: 'spoof',
        label: '注入 ARP 欺骗',
        description: '挑战:PC3 伪造网关应答,观察全网缓存被污染。',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: ArpState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'resolve': {
        const src = String(params?.src ?? 'PC1')
        const ip = String(params?.ip ?? '192.168.1.2')
        let st = base()
        if (cacheHit(st, src, ip)) {
          st = { ...st, active: src, log: [...st.log, `${src} → ${ip}:ARP 缓存命中,直接封装帧发送(无广播)`] }
        } else {
          st = sendArpRequest(st, src, ip)
          const dev = st.devices.find(d => d.ip === ip)!
          st = sendArpReply(st, dev.name, src)
        }
        apply(st)
        break
      }
      case 'clear-cache':
        apply(clearArpCache(base()))
        break
      case 'spoof': {
        const victimIp = String(params?.ip ?? '192.168.1.1')
        apply(arpSpoof(base(), 'PC3', victimIp))
        break
      }
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new ArpScene(),
}

export default sceneModule
