import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Connection } from '@/engine/components/Connection'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'

/** TCP 四次挥手场景:双向独立关闭 + 状态机 + TIME_WAIT 倒计时 */

export type TeardownState =
  | 'ESTABLISHED'
  | 'FIN_WAIT_1'
  | 'FIN_WAIT_2'
  | 'CLOSE_WAIT'
  | 'LAST_ACK'
  | 'TIME_WAIT'
  | 'CLOSED'

export interface TeardownMsg {
  id: string
  kind: 'FIN' | 'ACK' | 'FIN-ACK' | 'RETRY-FIN'
  seq: number
  ack: number
  delivered: boolean
}

export interface TeardownModelState {
  client: TeardownState
  server: TeardownState
  msgs: TeardownMsg[]
  /** TIME_WAIT 剩余(0~2MSL) */
  timeWaitProgress: number
  serverRetransmits: number
  log: string[]
}

interface TdSceneConfig {
  scenario: 'normal' | 'ack-lost'
  seq: number
}

const VIEW = { width: 800, height: 620 }
const CLIENT_X = 130
const SERVER_X = 670
const LANE_TOP = 190
const LANE_STEP = 64
const MSL_SECONDS = 60

let tdSeq = 0
function makeMsg(kind: TeardownMsg['kind'], seq: number, ack: number, delivered = true): TeardownMsg {
  tdSeq += 1
  return { id: `td-${tdSeq}`, kind, seq, ack, delivered }
}

export function createTeardownState(seq: number): TeardownModelState {
  return {
    client: 'ESTABLISHED',
    server: 'ESTABLISHED',
    msgs: [],
    timeWaitProgress: 0,
    serverRetransmits: 0,
    log: [`连接处于 ESTABLISHED,数据传输完毕;客户端 ISN=${seq}`],
  }
}

class TcpTeardownScene extends BaseScene<TeardownModelState> {
  private config: TdSceneConfig = { scenario: 'normal', seq: 1200 }

  private clientNode!: NetworkNode
  private serverNode!: NetworkNode
  private clientStateChip!: SVGTextElement
  private serverStateChip!: SVGTextElement
  private timeWaitBar: SVGRectElement | null = null
  private timeWaitFill: SVGRectElement | null = null
  private timeWaitText: SVGTextElement | null = null
  private msgSlots: Array<{ packet: Packet; label: Label }> = []
  private seqLabels: SVGTextElement[] = []

  constructor() {
    super({ id: 'tcp-teardown', viewBox: VIEW, label: 'TCP 四次挥手时序图' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.clientNode = new NetworkNode(renderer, {
      id: 'client', x: CLIENT_X, y: 100, width: 110, height: 52, label: '主动方', glyph: 'Client',
    })
    this.serverNode = new NetworkNode(renderer, {
      id: 'server', x: SERVER_X, y: 100, width: 110, height: 52, label: '被动方', glyph: 'Server',
    })

    new Connection(renderer, {
      id: 'client-lane', from: { x: CLIENT_X, y: LANE_TOP - 30 }, to: { x: CLIENT_X, y: LANE_TOP + 5 * LANE_STEP - 20 }, arrow: false, dashed: true,
    })
    new Connection(renderer, {
      id: 'server-lane', from: { x: SERVER_X, y: LANE_TOP - 30 }, to: { x: SERVER_X, y: LANE_TOP + 5 * LANE_STEP - 20 }, arrow: false, dashed: true,
    })

    this.clientStateChip = renderer.el('text', { x: CLIENT_X, y: 158, 'text-anchor': 'middle', class: 'tf-tcp-state' }, renderer.layerLabels)
    this.serverStateChip = renderer.el('text', { x: SERVER_X, y: 158, 'text-anchor': 'middle', class: 'tf-tcp-state' }, renderer.layerLabels)

    // TIME_WAIT 进度条
    const barY = LANE_TOP + 5 * LANE_STEP + 6
    renderer.el('text', { x: VIEW.width / 2, y: barY - 10, 'text-anchor': 'middle', class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      'TIME_WAIT 倒计时(2MSL)'
    this.timeWaitBar = renderer.el('rect', { x: 200, y: barY, width: 400, height: 14, rx: 7, class: 'tf-tw-bar' }, renderer.layerLabels)
    this.timeWaitFill = renderer.el('rect', { x: 200, y: barY, width: 0, height: 14, rx: 7, class: 'tf-tw-fill' }, renderer.layerLabels)
    this.timeWaitText = renderer.el('text', { x: VIEW.width / 2, y: barY + 34, 'text-anchor': 'middle', class: 'tf-label--mono' }, renderer.layerLabels)

    this.msgSlots = []
    this.seqLabels = []
    for (let i = 0; i < 5; i++) {
      const packet = new Packet(renderer, { id: `td-msg-${i}`, color: 'accent', shape: 'rect', width: 72, height: 24 })
      const label = new Label(renderer, { x: 0, y: 0, text: '', kind: 'pill' })
      this.msgSlots.push({ packet, label })
      const note = renderer.el('text', { x: VIEW.width / 2, y: LANE_TOP + i * LANE_STEP + 30, 'text-anchor': 'middle', class: 'tf-label--mono' }, renderer.layerLabels)
      this.seqLabels.push(note)
    }
  }

  protected buildSteps() {
    if (this.config.scenario === 'ack-lost') return this.buildAckLostSteps()
    return this.buildNormalSteps()
  }

  private buildNormalSteps() {
    const seq = this.config.seq
    const ack = seq + 1
    const steps: SceneStep[] = [
      {
        id: 'established',
        title: '数据传完,准备关闭',
        description: '双方 ESTABLISHED;TCP 是全双工,两个方向要各自关闭。',
        explanation: `TCP 连接是**全双工**的:客户端→服务端和服务端→客户端是两条独立的数据流。任何一方都可以先关闭自己的发送方向,而另一个方向还能继续传数据(**半关闭**)。所以完整拆除需要四次交互。客户端(主动方)ISN=${seq}。`,
        duration: 1300,
        action: 'established',
      },
      {
        id: 'fin',
        title: '第一次挥手:主动方发 FIN',
        description: `seq=${seq}。主动方 → FIN_WAIT_1。`,
        explanation: `FIN 的含义是「**我这一侧不再发数据了**,但还能收」。发出后主动方进入 **FIN_WAIT_1**,等待对方确认。FIN 同 SYN 一样,虽然不带数据也占用一个序号。`,
        duration: 1400,
        action: 'fin',
      },
      {
        id: 'ack1',
        title: '第二次挥手:被动方回 ACK',
        description: `ack=${ack}。被动方 → CLOSE_WAIT,主动方 → FIN_WAIT_2。`,
        explanation: `被动方收到 FIN,回 **ack=${ack}**,进入 **CLOSE_WAIT** —— 这个状态的意思是「对方关了,但我这边还有收尾工作(把剩余数据发完)」。此时连接处于**半关闭**:被动方仍可继续发数据。如果被动方没有数据要发,ACK 可以延迟与 FIN 合并,看起来就像三次挥手。`,
        duration: 1500,
        action: 'ack1',
      },
      {
        id: 'fin2',
        title: '第三次挥手:被动方发 FIN',
        description: '被动方 → LAST_ACK。',
        explanation: '被动方把剩余数据发完后,发出自己的 FIN,进入 **LAST_ACK** —— 最后一次确认前的等待状态。',
        duration: 1400,
        action: 'fin2',
      },
      {
        id: 'ack2',
        title: '第四次挥手:主动方回 ACK',
        description: '主动方 → TIME_WAIT;被动方收到后 CLOSED。',
        explanation:
          '主动方发出最后一个 ACK 后**不立即关闭**,而是进入 **TIME_WAIT**,被动方收到 ACK 则直接进入 **CLOSED**(它已经确认自己发的一切都被收到)。TIME_WAIT 是挥手流程里最容易被面试问到、也最常在生产环境被观察到的状态。',
        duration: 1500,
        action: 'ack2',
      },
      {
        id: 'timewait',
        title: 'TIME_WAIT:等待 2MSL',
        description: `主动方保持 ${2 * MSL_SECONDS} 秒后才真正关闭。`,
        explanation: `TIME_WAIT 持续 **2MSL**(MSL 是报文最大生存时间,典型 30s):① 若最后的 ACK 丢失,被动方会重传 FIN,主动方必须保持状态才能再次确认;② 等满 2MSL 后,本连接的所有旧报文都已消亡,不会污染将来**复用同一四元组**的新连接。这也解释了为什么高并发短连接机器常见海量 TIME_WAIT —— 治理手段是复用长连接,而不是粗暴消除 TIME_WAIT。`,
        duration: 1600,
        action: 'timewait',
      },
      {
        id: 'closed',
        title: '双方 CLOSED',
        description: '连接资源全部释放。',
        explanation: 'TIME_WAIT 结束后主动方也进入 CLOSED。四次挥手完成:每个方向的关闭都被独立确认。生产排查口诀:**大量 TIME_WAIT 在主动关闭方**(常见于短连接客户端),**大量 CLOSE_WAIT 在被动关闭方** —— 后者几乎总是代码忘记调用 close()。',
        duration: 1300,
        action: 'closed',
      },
    ]

    const transitions: StepTransition<TeardownModelState>[] = [
      () => createTeardownState(seq),
      s => ({ ...s, client: 'FIN_WAIT_1', msgs: [...s.msgs, makeMsg('FIN', seq, 0)], log: [...s.log, `主动方发送 FIN(seq=${seq}),进入 FIN_WAIT_1`] }),
      s => ({ ...s, client: 'FIN_WAIT_2', server: 'CLOSE_WAIT', msgs: [...s.msgs, makeMsg('ACK', seq + 1, ack)], log: [...s.log, `被动方确认 FIN(ack=${ack}),进入 CLOSE_WAIT;主动方进入 FIN_WAIT_2(半关闭)`] }),
      s => ({ ...s, server: 'LAST_ACK', msgs: [...s.msgs, makeMsg('FIN-ACK', seq + 1, ack)], log: [...s.log, '被动方数据发完,发送 FIN,进入 LAST_ACK'] }),
      s => ({ ...s, client: 'TIME_WAIT', msgs: [...s.msgs, makeMsg('ACK', ack + 1, ack + 1)], log: [...s.log, '主动方回复最后一个 ACK,进入 TIME_WAIT'] }),
      s => ({ ...s, timeWaitProgress: 1, log: [...s.log, `TIME_WAIT 等待 2MSL(${2 * MSL_SECONDS}s),期间可响应被动方重传的 FIN`] }),
      s => ({ ...s, client: 'CLOSED', server: 'CLOSED', timeWaitProgress: 1, log: [...s.log, 'TIME_WAIT 结束,主动方 CLOSED;双方资源释放'] }),
    ]
    return { steps, transitions }
  }

  /** 挑战场景:最后一个 ACK 丢失,被动方重传 FIN */
  private buildAckLostSteps() {
    const seq = this.config.seq
    const ack = seq + 1
    const steps: SceneStep[] = [
      {
        id: 'established',
        title: '故障注入:最后一个 ACK 将丢失',
        description: '观察 TIME_WAIT 为什么必须存在。',
        explanation: `本实验模拟**第四次挥手的 ACK 在途中丢失**。没有 TIME_WAIT 的话会发生什么?看完便知。ISN=${seq}。`,
        duration: 1300,
        action: 'established',
      },
      {
        id: 'fin',
        title: '主动方发 FIN → FIN_WAIT_1',
        description: `seq=${seq}。`,
        explanation: '与正常流程一致:主动方关闭自己的发送方向。',
        duration: 1200,
        action: 'fin',
      },
      {
        id: 'ack1',
        title: '被动方回 ACK → CLOSE_WAIT / FIN_WAIT_2',
        description: `ack=${ack}。`,
        explanation: '被动方确认收到 FIN;它处理完剩余数据后也要发 FIN。',
        duration: 1200,
        action: 'ack1',
      },
      {
        id: 'fin2',
        title: '被动方发 FIN → LAST_ACK',
        description: '等最后一个确认。',
        explanation: '被动方进入 LAST_ACK:它的资源在收到 ACK 之前无法释放。',
        duration: 1200,
        action: 'fin2',
      },
      {
        id: 'ack-lost',
        title: '主动方回 ACK,但 ACK 丢失',
        description: '主动方 → TIME_WAIT;被动方没收到!',
        explanation: '**故障发生**:最后一个 ACK 在网络中丢失。主动方进入 TIME_WAIT;被动方收不到确认,只能**重传 FIN**(FIN_WAIT/超时重传逻辑)。如果没有 TIME_WAIT 而是直接 CLOSED,被动方的重传会得到 RST,对方无法优雅关闭;更糟的是,如果新连接复用了同一四元组,迟到的旧报文会污染新连接。',
        duration: 1500,
        action: 'ack-lost',
      },
      {
        id: 'retrans',
        title: '被动方重传 FIN',
        description: `重传 #${1},主动方在 TIME_WAIT 中收到。`,
        explanation: '被动方超时重传 FIN。**主动方仍处于 TIME_WAIT,能够再次回复 ACK** —— 这正是 TIME_WAIT 的第一个存在理由:保证最后的确认有第二次机会送达。',
        duration: 1500,
        action: 'retrans',
      },
      {
        id: 'closed',
        title: '再次 ACK,双方关闭',
        description: '这次 ACK 顺利到达,双方 CLOSED。',
        explanation: '重传的 FIN 得到确认,被动方释放资源。TIME_WAIT 继续等满 2MSL 后主动方也关闭。整个过程的代价是**几分钟的端口占用**,收益是**协议在丢包下依然可靠** —— 这是一笔划算的交易。',
        duration: 1400,
        action: 'closed',
      },
    ]

    const transitions: StepTransition<TeardownModelState>[] = [
      () => createTeardownState(seq),
      s => ({ ...s, client: 'FIN_WAIT_1', msgs: [...s.msgs, makeMsg('FIN', seq, 0)], log: [...s.log, `主动方发送 FIN(seq=${seq})`] }),
      s => ({ ...s, client: 'FIN_WAIT_2', server: 'CLOSE_WAIT', msgs: [...s.msgs, makeMsg('ACK', seq + 1, ack)], log: [...s.log, '被动方 ACK,进入 CLOSE_WAIT(半关闭)'] }),
      s => ({ ...s, server: 'LAST_ACK', msgs: [...s.msgs, makeMsg('FIN-ACK', seq + 1, ack)], log: [...s.log, '被动方发 FIN,进入 LAST_ACK'] }),
      s => ({ ...s, client: 'TIME_WAIT', msgs: [...s.msgs, makeMsg('ACK', ack + 1, ack + 1, false)], log: [...s.log, '主动方回复 ACK(丢失!),进入 TIME_WAIT'] }),
      s => ({ ...s, serverRetransmits: 1, msgs: [...s.msgs, makeMsg('RETRY-FIN', seq + 1, ack)], log: [...s.log, '被动方超时,重传 FIN(LAST_ACK)'] }),
      s => ({ ...s, client: 'CLOSED' as TeardownState, server: 'CLOSED' as TeardownState, timeWaitProgress: 1, log: [...s.log, '主动方再次 ACK;TIME_WAIT 继续计时,被动方 CLOSED'] }),
    ]
    return { steps, transitions }
  }

  protected buildInitialState(): TeardownModelState {
    return createTeardownState(this.config.seq)
  }

  protected render(state: TeardownModelState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const tl = opts.timeline
    this.clientNode.setStatus(
      state.client === 'TIME_WAIT' ? 'processing' : state.client === 'CLOSED' ? 'dim' : state.client === 'ESTABLISHED' ? 'success' : 'active',
    )
    this.serverNode.setStatus(
      state.server === 'CLOSED' ? 'dim' : state.server === 'ESTABLISHED' ? 'success' : state.server === 'CLOSE_WAIT' ? 'processing' : 'active',
    )
    this.clientStateChip.textContent = state.client
    this.serverStateChip.textContent = state.server
    this.clientStateChip.setAttribute('class', `tf-tcp-state ${state.client === 'TIME_WAIT' ? 'tf-tcp-state--warning' : state.client === 'CLOSED' ? 'tf-tcp-state--muted' : state.client === 'ESTABLISHED' ? 'tf-tcp-state--ok' : 'tf-tcp-state--active'}`)
    this.serverStateChip.setAttribute('class', `tf-tcp-state ${state.server === 'CLOSED' ? 'tf-tcp-state--muted' : state.server === 'ESTABLISHED' ? 'tf-tcp-state--ok' : 'tf-tcp-state--active'}`)

    // TIME_WAIT 进度条
    const progress = state.timeWaitProgress
    if (this.timeWaitFill && this.timeWaitText && this.timeWaitBar) {
      const w = 400 * progress
      this.timeWaitBar.style.opacity = state.client === 'TIME_WAIT' || state.client === 'CLOSED' ? '1' : '0.35'
      if (tl && progress > 0) {
        tl.fromTo(this.timeWaitFill, { attr: { width: 0 } }, { attr: { width: w }, duration: 1.1, ease: 'power2.out' }, 0)
      } else {
        this.timeWaitFill.setAttribute('width', String(w))
      }
      this.timeWaitText.textContent =
        state.client === 'TIME_WAIT'
          ? '等待中…(实际约 60s,动画加速演示)'
          : state.client === 'CLOSED'
            ? '2MSL 已结束'
            : ''
    }

    for (let i = 0; i < this.msgSlots.length; i++) {
      const slot = this.msgSlots[i]
      const msg = state.msgs[i]
      const note = this.seqLabels[i]
      if (!slot) continue
      if (!msg) {
        slot.packet.show(false)
        slot.label.setText('')
        if (note) note.textContent = ''
        continue
      }
      const settled = !opts.animate || i < state.msgs.length - 1 || tl === null
      const fromClient = msg.kind === 'FIN' || msg.kind === 'ACK'
      const y = LANE_TOP + i * LANE_STEP + 14
      const startX = fromClient ? CLIENT_X : SERVER_X
      const endX = fromClient ? SERVER_X : CLIENT_X
      const isLost = !msg.delivered
      const color = isLost ? 'danger' : msg.kind === 'RETRY-FIN' ? 'warning' : msg.kind === 'FIN-ACK' ? 'purple' : 'accent'
      slot.packet.options.color = color
      const body = slot.packet.group.querySelector('.tf-packet-body-rect') as SVGRectElement | null
      if (body) body.setAttribute('class', `tf-packet-body-rect tf-packet-body--${color}`)
      slot.label.setText(isLost ? `${msg.kind} ✗丢失` : msg.kind)

      if (tl && !settled) {
        slot.packet.placeAt(startX, y)
        slot.packet.show(true)
        if (isLost) {
          tl.to(slot.packet.group, { x: (CLIENT_X + SERVER_X) / 2, duration: 0.7 }, 0)
          tl.to(slot.packet.group, { opacity: 0.7, duration: 0.3 }, 0.5)
        } else {
          tl.to(slot.packet.group, { x: endX, duration: 0.8, ease: 'power1.inOut' }, 0)
        }
        slot.label.setPosition(startX, y - 26)
        tl.add(() => slot.label.setPosition(isLost ? (CLIENT_X + SERVER_X) / 2 : endX, y - 26))
      } else {
        const pos = isLost ? (CLIENT_X + SERVER_X) / 2 : endX
        slot.packet.placeAt(pos, y)
        slot.packet.show(true)
        slot.label.setPosition(pos, y - 26)
      }

      if (note) {
        note.textContent = msg.kind === 'RETRY-FIN' ? `重传 FIN seq=${msg.seq}` : `seq=${msg.seq}  ack=${msg.ack || '—'}`
      }
    }
  }

  protected snapshotData(state: TeardownModelState, completedSteps: number): Record<string, unknown> {
    const last = state.msgs[state.msgs.length - 1]
    return {
      rows: [
        { label: '主动方状态', value: state.client, tone: state.client === 'TIME_WAIT' ? 'warning' : state.client === 'CLOSED' ? 'default' : 'accent' },
        { label: '被动方状态', value: state.server, tone: state.server === 'CLOSE_WAIT' ? 'warning' : state.server === 'CLOSED' ? 'default' : 'accent' },
        { label: '最近报文', value: last ? `${last.kind}${last.delivered ? '' : '(丢失!)'}` : '(无)', tone: last && !last.delivered ? 'danger' : 'accent' },
        { label: 'TIME_WAIT', value: state.client === 'TIME_WAIT' ? `进行中(2MSL = ${2 * MSL_SECONDS}s)` : state.client === 'CLOSED' ? '已结束' : '未进入' },
        { label: '被动方重传', value: `${state.serverRetransmits} 次` },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-seq',
        label: '修改起始序号',
        params: [{ name: 'seq', label: '客户端 ISN', type: 'number', min: 0, max: 999999, placeholder: '1200' }],
      },
      { name: 'normal-scenario', label: '恢复正常挥手' },
      {
        name: 'drop-last-ack',
        label: '模拟最后一个 ACK 丢失',
        description: '挑战:观察被动方重传 FIN 与 TIME_WAIT 的价值。',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    switch (name) {
      case 'set-seq': {
        const n = Number(params?.seq)
        if (Number.isFinite(n) && n >= 0) this.config.seq = Math.floor(n)
        this.rebuild()
        break
      }
      case 'drop-last-ack':
        this.config.scenario = 'ack-lost'
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
  create: () => new TcpTeardownScene(),
}

export default sceneModule
