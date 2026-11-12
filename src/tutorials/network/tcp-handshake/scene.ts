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
  createHandshakeState,
  receiveAckEstablished,
  receiveSynAckSendAck,
  receiveSynSendSynAck,
  retransmitSyn,
  sendSyn,
} from './model'
import type { HandshakeMsg, HandshakeState } from './model'

/** TCP 三次握手场景:双方时序图 + TCP 状态机 + Seq/Ack 标注 */

interface HsSceneConfig {
  isnClient: number
  isnServer: number
  scenario: 'normal' | 'syn-lost'
}

const VIEW = { width: 800, height: 560 }
const CLIENT_X = 130
const SERVER_X = 670
const LANE_TOP = 190
const LANE_STEP = 74

class TcpHandshakeScene extends BaseScene<HandshakeState> {
  private config: HsSceneConfig = { isnClient: 100, isnServer: 500, scenario: 'normal' }

  private clientNode!: NetworkNode
  private serverNode!: NetworkNode
  private clientStateChip!: SVGTextElement
  private serverStateChip!: SVGTextElement
  private halfOpenBadge: SVGGElement | null = null
  private halfOpenText: SVGTextElement | null = null
  private msgSlots: Array<{ packet: Packet; label: Label }> = []
  private isnLabel: Label | null = null
  private seqLabels: SVGTextElement[] = []

  constructor() {
    super({ id: 'tcp-handshake', viewBox: VIEW, label: 'TCP 三次握手时序图' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.clientNode = new NetworkNode(renderer, {
      id: 'client',
      x: CLIENT_X,
      y: 100,
      width: 110,
      height: 52,
      label: '客户端',
      glyph: 'Client',
    })
    this.serverNode = new NetworkNode(renderer, {
      id: 'server',
      x: SERVER_X,
      y: 100,
      width: 110,
      height: 52,
      label: '服务端',
      glyph: 'Server',
    })
    this.clientNode.setStatus('dim')
    this.serverNode.setStatus('dim')

    new Connection(renderer, {
      id: 'client-lane',
      from: { x: CLIENT_X, y: LANE_TOP - 30 },
      to: { x: CLIENT_X, y: LANE_TOP + 6 * LANE_STEP - 40 },
      arrow: false,
      dashed: true,
    })
    new Connection(renderer, {
      id: 'server-lane',
      from: { x: SERVER_X, y: LANE_TOP - 30 },
      to: { x: SERVER_X, y: LANE_TOP + 6 * LANE_STEP - 40 },
      arrow: false,
      dashed: true,
    })

    // TCP 状态芯片
    this.clientStateChip = renderer.el('text', {
      x: CLIENT_X,
      y: 158,
      'text-anchor': 'middle',
      class: 'tf-tcp-state',
    }, renderer.layerLabels)
    this.serverStateChip = renderer.el('text', {
      x: SERVER_X,
      y: 158,
      'text-anchor': 'middle',
      class: 'tf-tcp-state',
    }, renderer.layerLabels)

    // 半开连接徽标
    this.halfOpenBadge = renderer.el('g', {}, renderer.layerLabels)
    renderer.el('rect', { x: SERVER_X - 82, y: 196, width: 164, height: 26, rx: 13, class: 'tf-label-pill-bg' }, this.halfOpenBadge)
    this.halfOpenText = renderer.el('text', {
      x: SERVER_X,
      y: 214,
      'text-anchor': 'middle',
      class: 'tf-label-pill',
    }, this.halfOpenBadge)

    // ISN 标注
    this.isnLabel = new Label(renderer, {
      x: VIEW.width / 2,
      y: 34,
      text: '',
      kind: 'mono',
    })

    // 报文槽位(最多 5 条)
    this.msgSlots = []
    this.seqLabels = []
    for (let i = 0; i < 5; i++) {
      const packet = new Packet(renderer, {
        id: `hs-msg-${i}`,
        color: 'accent',
        shape: 'rect',
        width: 92,
        height: 26,
      })
      const label = new Label(renderer, { x: 0, y: 0, text: '', kind: 'pill' })
      this.msgSlots.push({ packet, label })
      const seqNote = renderer.el('text', {
        x: VIEW.width / 2,
        y: LANE_TOP + i * LANE_STEP + 34,
        'text-anchor': 'middle',
        class: 'tf-label--mono',
      }, renderer.layerLabels)
      this.seqLabels.push(seqNote)
    }
  }

  protected buildSteps() {
    if (this.config.scenario === 'syn-lost') {
      return this.buildSynLostSteps()
    }
    return this.buildNormalSteps()
  }

  private buildNormalSteps() {
    const isnC = this.config.isnClient
    const isnS = this.config.isnServer
    const steps: SceneStep[] = [
      {
        id: 'closed',
        title: '初始状态',
        description: '客户端 CLOSED,服务端 LISTEN(等待连接)。',
        explanation: `握手开始前,服务端已经监听端口(LISTEN);客户端主动发起。双方约定好初始序列号 ISN:客户端 **ISN=${isnC}**,服务端 **ISN=${isnS}**。ISN 是随时间变化的伪随机数,作用是防旧报文混淆与防伪造。`,
        duration: 1300,
        action: 'closed',
      },
      {
        id: 'syn',
        title: '第一次握手:客户端发送 SYN',
        description: `SYN=1,seq=${isnC}。客户端进入 SYN_SENT。`,
        explanation: `SYN 报文的含义是「我的数据流从序号 **${isnC}** 开始,请注意」。它不携带数据,但**占用一个序号**。发出后客户端进入 **SYN_SENT**,等待服务端的确认。`,
        duration: 1500,
        action: 'syn',
      },
      {
        id: 'syn-ack',
        title: '第二次握手:服务端回复 SYN+ACK',
        description: `SYN=1,ACK=1,seq=${isnS},ack=${isnC + 1}。服务端进入 SYN_RCVD。`,
        explanation: `服务端收到 SYN 后做两件事:① 用 **ack=${isnC + 1}** 确认客户端的 SYN(「请从 ${isnC + 1} 开始发数据」);② 发出自己的 SYN(seq=${isnS})。此时服务端进入 **SYN_RCVD** —— 这是「半开连接」状态,服务端已为这条可能成立的连接分配了资源。`,
        duration: 1600,
        action: 'syn-ack',
      },
      {
        id: 'ack',
        title: '第三次握手:客户端回复 ACK',
        description: `ACK=1,ack=${isnS + 1}。客户端进入 ESTABLISHED。`,
        explanation: `客户端收到 SYN+ACK,确认了服务端的 ISN,回复 **ack=${isnS + 1}**。客户端发出 ACK 后立即进入 **ESTABLISHED**,可以先发送数据(ACK 可以搭载数据一起发)。`,
        duration: 1500,
        action: 'ack',
      },
      {
        id: 'established',
        title: '服务端收到 ACK:连接建立',
        description: '双方进入 ESTABLISHED,双向通路就绪。',
        explanation: `服务端收到 ACK 后进入 **ESTABLISHED**。至此:双方都确认了「自己发的 SYN 被收到」与「对方发的 SYN 自己已确认」—— 双向能力与双向序列号全部闭环,可以开始可靠传输。`,
        duration: 1300,
        action: 'established',
      },
      {
        id: 'review',
        title: '为什么恰好是三次',
        description: '两次不安全,四次冗余。',
        explanation:
          '**两次的问题**:服务端无法确认「自己的 SYN+ACK 被客户端收到」,而且一个迟到的旧 SYN 会建立无效连接,白白占用半开资源。**三次刚好**:第三次 ACK 让客户端有机会识别旧连接并回 RST。**四次冗余**:TCP 的 SYN 和 ACK 可以合并进同一个报文。右侧挑战模式可以模拟 SYN 丢失,观察重传如何兜底。',
        duration: 1400,
        action: 'review',
      },
    ]

    const transitions: StepTransition<HandshakeState>[] = [
      () => createHandshakeState(isnC, isnS),
      s => sendSyn(s, true),
      s => receiveSynSendSynAck(s),
      s => receiveSynAckSendAck(s),
      s => receiveAckEstablished(s),
      s => ({ ...s, log: [...s.log, '连接进入稳态,双方可以开始传输数据'] }),
    ]
    return { steps, transitions }
  }

  /** 挑战场景:第一个 SYN 在网络中丢失 */
  private buildSynLostSteps() {
    const isnC = this.config.isnClient
    const isnS = this.config.isnServer
    const steps: SceneStep[] = [
      {
        id: 'closed',
        title: '初始状态',
        description: '故障注入:本次实验的第一个 SYN 将在途中丢失。',
        explanation: `这是一个**故障模拟**:客户端发出的第一个 SYN 不会到达服务端。观察客户端如何靠「超时重传」兜底 —— 这就是 TCP 可靠性的第一课。ISN:客户端 ${isnC},服务端 ${isnS}。`,
        duration: 1300,
        action: 'closed',
      },
      {
        id: 'syn-lost',
        title: 'SYN 发出,但在途中丢失',
        description: '报文在链路上被丢弃,服务端毫无感知。',
        explanation:
          'SYN 报文**在网络中丢失**(丢包、路由黑洞、防火墙静默丢弃都可能)。客户端进入 SYN_SENT 开始等待;**服务端完全不知道有连接请求** —— 它仍在 LISTEN,没有分配任何资源。这与「服务端收到了但拒绝」完全不同。',
        duration: 1500,
        action: 'syn-lost',
      },
      {
        id: 'timeout',
        title: '客户端超时,重传 SYN',
        description: '等不到确认 → 指数退避重传。',
        explanation:
          '客户端等待 ACK 超时(通常 1 秒起),触发**重传**。重传间隔按**指数退避**增长:1s、2s、4s…… 重传次数受 `tcp_syn_retries` 限制(常见 6 次,约 2 分钟)后放弃。这正是「连接超时」比「连接被拒」慢得多的原因:被拒是立即 RST,超时是反复重传。',
        duration: 1600,
        action: 'timeout',
      },
      {
        id: 'syn-ack',
        title: '重传的 SYN 到达,服务端回复 SYN+ACK',
        description: '连接建立流程继续。',
        explanation: '重传的 SYN 成功送达,后续流程与正常握手一致:服务端进入 SYN_RCVD 并回复 SYN+ACK。注意服务端**不区分首次 SYN 与重传 SYN** —— 对它来说这只是又一个连接请求。',
        duration: 1500,
        action: 'syn-ack',
      },
      {
        id: 'established',
        title: '完成握手',
        description: '客户端 ACK 后,双方 ESTABLISHED。',
        explanation: '后续两步(客户端 ACK → 服务端 ESTABLISHED)照常完成。整个过程中,可靠性来自**发送方的重传** —— TCP 的可靠不是「保证不丢」,而是「丢了会重传,直到确认成功」。',
        duration: 1400,
        action: 'established',
      },
    ]

    const transitions: StepTransition<HandshakeState>[] = [
      () => createHandshakeState(isnC, isnS),
      s => sendSyn(s, false),
      s => retransmitSyn(s, true),
      s => receiveSynSendSynAck(s),
      s => receiveSynAckSendAck(s),
    ]
    return { steps, transitions }
  }

  protected buildInitialState(): HandshakeState {
    return createHandshakeState(this.config.isnClient, this.config.isnServer)
  }

  /* ---------- 渲染 ---------- */

  private msgPosition(msg: HandshakeMsg, index: number, settled: boolean): { x: number; y: number; visible: boolean } {
    const y = LANE_TOP + index * LANE_STEP + 14
    const fromClient = msg.kind === 'SYN' || msg.kind === 'RETRY-SYN' || msg.kind === 'ACK'
    const startX = fromClient ? CLIENT_X : SERVER_X
    const endX = fromClient ? SERVER_X : CLIENT_X
    if (msg.lost) {
      return { x: (startX + endX) / 2, y, visible: true }
    }
    if (settled || msg.delivered === false) {
      return { x: msg.lost ? (startX + endX) / 2 : endX, y, visible: true }
    }
    return { x: startX, y, visible: true }
  }

  protected render(state: HandshakeState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const tl = opts.timeline
    const stateColor = { CLOSED: 'muted', LISTEN: 'muted', SYN_SENT: 'active', SYN_RCVD: 'active', ESTABLISHED: 'ok' } as const

    this.clientNode.setStatus(
      state.client === 'ESTABLISHED' ? 'success' : state.client === 'SYN_SENT' ? 'active' : 'dim',
    )
    this.serverNode.setStatus(
      state.server === 'ESTABLISHED' ? 'success' : state.server === 'SYN_RCVD' ? 'processing' : state.server === 'LISTEN' ? 'idle' : 'dim',
    )

    this.clientStateChip.textContent = state.client
    this.serverStateChip.textContent = state.server
    this.clientStateChip.setAttribute('class', `tf-tcp-state tf-tcp-state--${stateColor[state.client]}`)
    this.serverStateChip.setAttribute('class', `tf-tcp-state tf-tcp-state--${stateColor[state.server]}`)

    if (this.isnLabel) {
      this.isnLabel.setText(`ISN 客户端 = ${state.isnClient}   ·   ISN 服务端 = ${state.isnServer}`)
    }

    if (this.halfOpenBadge && this.halfOpenText) {
      this.halfOpenText.textContent = `服务端半开连接:${state.halfOpen}`
      this.halfOpenBadge.style.opacity = state.halfOpen > 0 ? '1' : '0'
    }

    // 报文槽位
    for (let i = 0; i < this.msgSlots.length; i++) {
      const slot = this.msgSlots[i]
      const msg = state.msgs[i]
      const seqNote = this.seqLabels[i]
      if (!slot) continue
      if (!msg) {
        slot.packet.show(false)
        slot.label.setText('')
        if (seqNote) seqNote.textContent = ''
        continue
      }
      const settled = !opts.animate || i < state.msgs.length - 1 || tl === null
      const pos = this.msgPosition(msg, i, settled)
      const fromClient = msg.kind === 'SYN' || msg.kind === 'RETRY-SYN' || msg.kind === 'ACK'
      const startX = fromClient ? CLIENT_X : SERVER_X

      slot.packet.options.color = msg.lost ? 'danger' : msg.kind === 'SYN-ACK' ? 'purple' : msg.kind === 'RETRY-SYN' ? 'warning' : 'accent'
      const body = slot.packet.group.querySelector('.tf-packet-body-rect') as SVGRectElement | null
      if (body) {
        body.setAttribute('class', `tf-packet-body-rect tf-packet-body--${slot.packet.options.color}`)
      }
      slot.label.setText(msg.lost ? `${msg.kind} ✗丢失` : msg.kind)

      if (tl && !settled) {
        // 动画:从发送方移动到目标(丢失则停在中间并变红)
        slot.packet.placeAt(startX, pos.y)
        slot.packet.show(true)
        if (msg.lost) {
          tl.to(slot.packet.group, { x: (CLIENT_X + SERVER_X) / 2, duration: 0.7, ease: 'power1.out' }, 0)
          tl.to(slot.packet.group, { opacity: 0.75, duration: 0.3 }, 0.5)
        } else {
          tl.to(slot.packet.group, { x: pos.x, duration: 0.8, ease: 'power1.inOut' }, 0)
        }
        slot.label.setPosition(startX, pos.y - 26)
        tl.add(() => slot.label.setPosition(pos.x, pos.y - 26))
      } else {
        slot.packet.placeAt(pos.x, pos.y)
        slot.packet.show(true)
        slot.label.setPosition(pos.x, pos.y - 26)
      }

      if (seqNote) {
        const parts: string[] = []
        if (msg.seq !== null) parts.push(`seq=${msg.seq}`)
        if (msg.ack !== null) parts.push(`ack=${msg.ack}`)
        seqNote.textContent = parts.join('  ')
      }
    }
  }

  protected snapshotData(state: HandshakeState, completedSteps: number): Record<string, unknown> {
    const last = state.msgs[state.msgs.length - 1]
    return {
      rows: [
        { label: '客户端状态', value: state.client, tone: state.client === 'ESTABLISHED' ? 'success' : 'accent' },
        { label: '服务端状态', value: state.server, tone: state.server === 'ESTABLISHED' ? 'success' : state.server === 'SYN_RCVD' ? 'warning' : 'default' },
        { label: 'ISN(C / S)', value: `${state.isnClient} / ${state.isnServer}` },
        {
          label: '最近报文',
          value: last
            ? `${last.kind}${last.seq !== null ? ` seq=${last.seq}` : ''}${last.ack !== null ? ` ack=${last.ack}` : ''}${last.lost ? '(丢失)' : ''}`
            : '(无)',
          tone: last?.lost ? 'danger' : 'accent',
        },
        { label: '半开连接数', value: String(state.halfOpen), tone: state.halfOpen > 0 ? 'warning' : 'default' },
        { label: '客户端重传', value: `${state.retries} 次` },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-isn',
        label: '修改初始序列号',
        description: '观察 Seq/Ack 数值如何随 ISN 变化。',
        params: [
          { name: 'isnClient', label: '客户端 ISN', type: 'number', min: 0, max: 9999, placeholder: '100' },
          { name: 'isnServer', label: '服务端 ISN', type: 'number', min: 0, max: 9999, placeholder: '500' },
        ],
      },
      {
        name: 'normal-scenario',
        label: '恢复正常握手',
        description: '回到标准三次握手流程。',
      },
      {
        name: 'drop-syn',
        label: '模拟 SYN 丢失',
        description: '挑战:第一个 SYN 在途中被丢弃,观察超时重传。',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    switch (name) {
      case 'set-isn': {
        const c = Number(params?.isnClient)
        const s = Number(params?.isnServer)
        if (Number.isFinite(c) && c >= 0) this.config.isnClient = Math.floor(c)
        if (Number.isFinite(s) && s >= 0) this.config.isnServer = Math.floor(s)
        this.rebuild()
        break
      }
      case 'drop-syn':
        this.config.scenario = 'syn-lost'
        this.rebuild()
        break
      case 'normal-scenario':
        this.config.scenario = 'normal'
        this.rebuild()
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new TcpHandshakeScene(),
}

export default sceneModule
