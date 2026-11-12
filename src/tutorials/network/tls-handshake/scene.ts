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
  DEFAULT_CERT,
  createTlsState,
  deriveSessionKey,
  exchangeFinished,
  sendClientHello,
  sendKeyExchange,
  sendServerHello,
  verifyCertificate,
} from './model'
import type { CertificateInfo, TlsState } from './model'

/** TLS 握手场景:报文时序 + 证书链验证 + 密钥推导可视化 */

const VIEW = { width: 840, height: 640 }
const CLIENT_X = 120
const SERVER_X = 700
const LANE_TOP = 210
const LANE_STEP = 56

interface TlsSceneConfig {
  cert: CertificateInfo
  visiting: string
}

class TlsHandshakeScene extends BaseScene<TlsState> {
  private config: TlsSceneConfig = { cert: { ...DEFAULT_CERT }, visiting: 'www.example.com' }

  private clientNode!: NetworkNode
  private serverNode!: NetworkNode
  private slots: Packet[] = []
  private labels: Label[] = []
  private chainRows: Array<{ g: SVGGElement; name: SVGTextElement; state: SVGTextElement }> = []
  private keyRow: SVGGElement | null = null
  private keyText: SVGTextElement | null = null
  private phaseChips: Partial<Record<string, SVGTextElement>> = {}

  constructor() {
    super({ id: 'tls-handshake', viewBox: VIEW, label: 'TLS 握手时序与证书链' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.clientNode = new NetworkNode(renderer, {
      id: 'client', x: CLIENT_X, y: 90, width: 130, height: 52, label: '浏览器', glyph: 'Client',
    })
    this.serverNode = new NetworkNode(renderer, {
      id: 'server', x: SERVER_X, y: 90, width: 130, height: 52, label: 'Web 服务器', glyph: 'Server',
    })

    new Connection(renderer, {
      id: 'client-lane', from: { x: CLIENT_X, y: LANE_TOP - 26 }, to: { x: CLIENT_X, y: LANE_TOP + 6 * LANE_STEP - 30 }, arrow: false, dashed: true,
    })
    new Connection(renderer, {
      id: 'server-lane', from: { x: SERVER_X, y: LANE_TOP - 26 }, to: { x: SERVER_X, y: LANE_TOP + 6 * LANE_STEP - 30 }, arrow: false, dashed: true,
    })

    new Label(renderer, { x: (CLIENT_X + SERVER_X) / 2, y: LANE_TOP - 26, text: 'TCP 已建立(SYN→SYN+ACK→ACK 完成)', kind: 'mono' })

    // 报文槽位
    this.slots = []
    this.labels = []
    const msgs = ['ClientHello', 'ServerHello+Cert', 'KeyExchange', 'FinishedC', 'FinishedS']
    for (let i = 0; i < 6; i++) {
      const packet = new Packet(renderer, { id: `tls-slot-${i}`, color: 'accent', shape: 'rect', width: 130, height: 24 })
      const label = new Label(renderer, { x: 0, y: 0, text: '', kind: 'pill' })
      this.slots.push(packet)
      this.labels.push(label)
      if (msgs[i]) {
        const note = renderer.el('text', {
          x: VIEW.width / 2,
          y: LANE_TOP + i * LANE_STEP + 26,
          'text-anchor': 'middle',
          class: 'tf-label--mono',
        }, renderer.layerLabels)
        note.textContent = msgs[i]!
      }
    }

    // 证书链验证面板(右侧)
    new Label(renderer, { x: 470, y: 462, text: '证书链验证(客户端本地)', kind: 'accent', anchor: 'start' })
    this.chainRows = []
    const chain = [
      { name: '根 CA(系统内置)', state: '信任锚点' },
      { name: '中间 CA(Let\u2019s Encrypt R3)', state: '验签通过' },
      { name: '站点证书 www.example.com', state: '域名匹配 + 未过期' },
    ]
    for (let i = 0; i < chain.length; i++) {
      const g = renderer.el('g', {}, renderer.layerLabels)
      renderer.el('rect', { x: 470, y: 474 + i * 40, width: 350, height: 34, rx: 7, class: 'tf-subnet-row-bg' }, g)
      const name = renderer.el('text', { x: 484, y: 496 + i * 40, class: 'tf-subnet-mono' }, g)
      const state = renderer.el('text', { x: 806, y: 496 + i * 40, 'text-anchor': 'end', class: 'tf-subnet-result ok' }, g)
      name.textContent = chain[i]!.name
      state.textContent = chain[i]!.state
      g.style.opacity = '0'
      this.chainRows.push({ g, name, state })
    }

    // 密钥推导条
    this.keyRow = renderer.el('g', {}, renderer.layerLabels)
    renderer.el('rect', { x: 60, y: 474, width: 380, height: 108, rx: 10, class: 'tf-ip-card' }, this.keyRow)
    renderer.el('text', { x: 76, y: 496, class: 'tf-label--muted' }, this.keyRow).textContent = '会话密钥推导'
    renderer.el('text', { x: 76, y: 520, class: 'tf-label--mono' }, this.keyRow).textContent = '客户端随机数 + 服务端随机数 + 预主密钥'
    this.keyText = renderer.el('text', { x: 76, y: 556, class: 'tf-cpu-value' }, this.keyRow)
    this.keyRow.style.opacity = '0'

    // 阶段芯片
    const phases = ['ClientHello', 'ServerHello', '验证', 'KeyExchange', 'Finished']
    phases.forEach((p, i) => {
      const chip = renderer.el('text', { x: 130 + i * 140, y: 618, 'text-anchor': 'middle', class: 'tf-phase-chip' }, renderer.layerLabels)
      chip.textContent = p
      this.phaseChips[p === '验证' ? 'cert-validate' : p === 'ClientHello' ? 'client-hello' : p === 'ServerHello' ? 'server-hello' : p === 'KeyExchange' ? 'key-exchange' : 'finished'] = chip
    })
  }

  protected buildSteps() {
    const visiting = this.config.visiting
    const cert = this.config.cert
    const steps: SceneStep[] = [
      {
        id: 'hello',
        title: '① ClientHello',
        description: '版本 + 加密套件列表 + 客户端随机数 + SNI。',
        explanation: `TCP 连接建立后,浏览器发出的**第一个字节**就是 ClientHello:支持的 TLS 版本、加密套件列表、一个**客户端随机数**(32 字节),以及 **SNI**(要访问的域名 —— 同一台服务器托管多个 HTTPS 站点时,靠它决定出示哪张证书)。`,
        duration: 1400,
        action: 'hello',
      },
      {
        id: 'server-hello',
        title: '② ServerHello + Certificate',
        description: '选定套件 + 服务端随机数 + 证书(公钥)。',
        explanation: `服务端从套件列表里选定一套,给出**服务端随机数**,并出示**证书**。证书里最关键的是**站点公钥**和签发它的 CA 签名 —— 它是「我就是 www.example.com」的身份证。`,
        duration: 1400,
        action: 'server-hello',
      },
      {
        id: 'verify',
        title: '③ 证书链验证(客户端本地完成)',
        description: '根 CA → 中间 CA → 站点证书;域名匹配 + 未过期。',
        explanation: `验证三件事:**① 签发链** —— 站点证书由中间 CA 签发、中间 CA 由系统内置的根 CA 签发,逐级验签;**② 域名** —— 证书 SAN 列表必须包含你访问的域名;**③ 有效期** —— 没有过期。任何一条失败,浏览器弹出告警(右侧挑战模式可模拟)。`,
        duration: 1600,
        action: 'verify',
      },
      {
        id: 'key-exchange',
        title: '④ 密钥交换',
        description: '客户端生成预主密钥,用证书公钥加密发送。',
        explanation: '客户端生成 48 字节的**预主密钥**,用证书里的公钥加密后发送。整个互联网上只有持**私钥**的服务端能解开它 —— 这就是非对称加密在握手里的全部作用:安全地送一小段秘密。',
        duration: 1400,
        action: 'key-exchange',
      },
      {
        id: 'derive',
        title: '⑤ 推导会话密钥',
        description: '客户端随机数 + 服务端随机数 + 预主密钥 → 会话密钥。',
        explanation: '双方各自用「**三个随机材料**」推导出**相同的会话密钥**(不需要再传输)。之后所有 HTTP 报文都用它做**对称加密**(AES-GCM/ChaCha20)—— 快 100 倍以上,适合海量数据。ECDHE 模式还会为每条连接生成独立密钥,提供**前向安全**。',
        duration: 1400,
        action: 'derive',
      },
      {
        id: 'finished',
        title: '⑥ Finished:加密通道建立',
        description: '双方交换加密的 Finished,校验握手完整性。',
        explanation: '双方各发一条**用会话密钥加密**的 Finished,校验此前所有握手报文未被篡改。通过后进入数据阶段:HTTP 请求/响应全部加密传输。整个 TLS 1.2 握手约 **2-RTT**,TLS 1.3 压缩到 **1-RTT**(套件列表里直接带密钥材料,证书验证与密钥交换并行)。',
        duration: 1500,
        action: 'finished',
      },
    ]

    const transitions: StepTransition<TlsState>[] = [
      () => createTlsState(cert),
      s => sendClientHello(s),
      s => sendServerHello(s),
      s => verifyCertificate(s, visiting),
      s => sendKeyExchange(s),
      s => deriveSessionKey(s),
      s => exchangeFinished(s),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): TlsState {
    return createTlsState(this.config.cert)
  }

  protected render(state: TlsState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const tl = opts.timeline
    const failure = state.phase === 'cert-failed'

    this.clientNode.setStatus(state.established ? 'success' : state.phase === 'idle' ? 'idle' : 'active')
    this.serverNode.setStatus(failure ? 'error' : state.established ? 'success' : state.phase === 'idle' ? 'idle' : 'processing')

    // 报文槽位
    for (let i = 0; i < this.slots.length; i++) {
      const packet = this.slots[i]
      const label = this.labels[i]
      if (!packet || !label) continue
      const m = state.messages[i]
      if (!m) {
        packet.show(false)
        label.setText('')
        continue
      }
      const settled = !opts.animate || i < state.messages.length - 1 || tl === null
      const fromClient = m.kind === 'ClientHello' || m.kind === 'KeyExchange' || m.kind === 'FinishedC'
      const y = LANE_TOP + i * LANE_STEP + 10
      const startX = fromClient ? CLIENT_X : SERVER_X
      const endX = fromClient ? SERVER_X : CLIENT_X
      const color = m.kind === 'Certificate' ? 'warning' : m.kind.includes('Finished') ? 'success' : 'accent'
      packet.options.color = color
      const body = packet.group.querySelector('.tf-packet-body-rect')
      if (body) body.setAttribute('class', `tf-packet-body-rect tf-packet-body--${color}`)
      label.setText(m.kind)

      if (tl && !settled) {
        packet.placeAt(startX, y)
        packet.show(true)
        tl.to(packet.group, { x: endX - startX, duration: 0.6, ease: 'power1.inOut' }, 0)
        label.setPosition(startX, y - 24)
        tl.add(() => label.setPosition(endX, y - 24))
      } else {
        packet.placeAt(endX, y)
        packet.show(true)
        label.setPosition(endX, y - 24)
      }
    }

    // 证书链
    const chainVisible = ['cert-validate', 'key-exchange', 'derive', 'finished', 'cert-failed'].includes(state.phase)
    for (let i = 0; i < this.chainRows.length; i++) {
      const row = this.chainRows[i]
      if (!row) continue
      const okVisible = chainVisible && state.phase !== 'cert-failed'
      const failVisible = chainVisible && state.phase === 'cert-failed'
      if (row.state) {
        row.state.textContent = failVisible ? (i === 2 ? (state.cert.status === 'expired' ? '✗ 已过期' : state.cert.status === 'hostname-mismatch' ? '✗ 域名不匹配' : '✗ CA 不受信') : '✗') : okVisible ? '✓' : ''
        row.state.setAttribute('class', `tf-subnet-result ${failVisible ? 'bad' : 'ok'}`)
      }
      const target = chainVisible ? '1' : '0'
      if (tl) tl.to(row.g, { opacity: target, duration: 0.3 }, i * 0.12)
      else row.g.style.opacity = target
    }

    // 密钥推导
    if (this.keyRow && this.keyText) {
      const visible = ['derive', 'finished', 'established'].includes(state.phase) || state.sessionKey !== null
      if (this.keyText) {
        this.keyText.textContent = state.sessionKey ? `会话密钥 = ${state.sessionKey.slice(0, 12)}…(AES-GCM)` : ''
      }
      const target = visible ? '1' : '0'
      if (tl) tl.to(this.keyRow, { opacity: target, duration: 0.3 }, 0)
      else this.keyRow.style.opacity = target
    }

    // 阶段芯片
    for (const [phase, chip] of Object.entries(this.phaseChips)) {
      if (!chip) continue
      chip.setAttribute('class', `tf-phase-chip ${state.phase === phase ? 'is-active' : ''}`)
    }
  }

  protected snapshotData(state: TlsState, completedSteps: number): Record<string, unknown> {
    const last = state.messages[state.messages.length - 1]
    return {
      rows: [
        { label: '协议', value: state.protocol, tone: 'accent' },
        { label: '访问域名', value: this.config.visiting },
        { label: '证书', value: `${state.cert.subject}(${state.cert.status === 'ok' ? '有效' : state.cert.status})`, tone: state.cert.status === 'ok' ? 'success' : 'danger' },
        { label: '签发链', value: state.chainVerified ? '可信' : state.phase === 'cert-failed' ? '验证失败' : '待验证', tone: state.chainVerified ? 'success' : state.phase === 'cert-failed' ? 'danger' : 'default' },
        { label: '域名匹配', value: state.domainMatched ? '✓' : state.phase === 'cert-failed' ? '✗' : '待验证', tone: state.domainMatched ? 'success' : state.phase === 'cert-failed' ? 'danger' : 'default' },
        { label: '有效期', value: state.notExpired ? '✓' : state.phase === 'cert-failed' ? '✗ 已过期' : '待验证', tone: state.notExpired ? 'success' : state.phase === 'cert-failed' ? 'danger' : 'default' },
        { label: '会话密钥', value: state.sessionKey ? `${state.sessionKey.slice(0, 12)}…` : '未推导', tone: state.sessionKey ? 'success' : 'default' },
        { label: '加密通道', value: state.established ? '已建立(对称加密)' : '协商中', tone: state.established ? 'success' : 'default' },
        { label: '最近报文', value: last ? last.summary : '(无)' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'normal', label: '恢复正常证书' },
      {
        name: 'expired',
        label: '模拟证书过期',
        description: '挑战:最常见的线上事故,观察浏览器拦截。',
        danger: true,
      },
      {
        name: 'hostname-mismatch',
        label: '模拟域名不匹配',
        description: '挑战:证书 SAN 不包含访问的域名。',
        danger: true,
      },
      {
        name: 'self-signed',
        label: '模拟自签名证书',
        description: '挑战:签发链不可信(内部系统常见)。',
        danger: true,
      },
    ]
  }

  performAction(name: string): void {
    switch (name) {
      case 'normal':
        this.config.cert = { ...DEFAULT_CERT }
        this.rebuild()
        break
      case 'expired':
        this.config.cert = { ...DEFAULT_CERT, status: 'expired' }
        this.rebuild()
        break
      case 'hostname-mismatch':
        this.config.cert = { ...DEFAULT_CERT, domains: ['tool.msqf.cc'] }
        this.rebuild()
        break
      case 'self-signed':
        this.config.cert = { ...DEFAULT_CERT, issuer: '自签名(无受信 CA)' , status: 'self-signed' }
        this.rebuild()
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new TlsHandshakeScene(),
}

export default sceneModule
