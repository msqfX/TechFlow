import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  createReliableState,
  fastRetransmit,
  receiveAck,
  receiveSegment,
  sendWindow,
  timeoutRetransmit,
} from './model'
import type { ReliableState } from './model'

/** TCP 可靠传输场景:滑动窗口 + 报文/ACK 通道 + 重复 ACK 计数 */

const VIEW = { width: 840, height: 640 }
const SEG_X0 = 66
const SEG_W = 88
const SEG_STEP = 94
const SENDER_Y = 130

class TcpReliableScene extends BaseScene<ReliableState> {
  private senderNode!: NetworkNode
  private receiverNode!: NetworkNode
  private segRects: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; retried: SVGTextElement }> = []
  private winBracket: SVGPathElement | null = null
  private winLabel: SVGTextElement | null = null
  private slots: Packet[] = []
  private dupChip: SVGGElement | null = null
  private dupText: SVGTextElement | null = null
  private recvBufferChip: SVGTextElement | null = null
  private ackNote: SVGTextElement | null = null

  constructor() {
    super({ id: 'tcp-reliable', viewBox: VIEW, label: 'TCP 滑动窗口与重传' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.senderNode = new NetworkNode(renderer, {
      id: 'sender', x: 420, y: 60, width: 190, height: 54, label: '发送方', glyph: 'SENDER',
    })
    this.receiverNode = new NetworkNode(renderer, {
      id: 'receiver', x: 420, y: 580, width: 190, height: 54, label: '接收方', glyph: 'RECEIVER',
    })

    new Label(renderer, { x: 60, y: 128, text: '发送窗口(左缘 = 已确认边界)', kind: 'accent', anchor: 'start' })

    // 窗口括弧
    this.winBracket = renderer.el('path', { class: 'tf-window-bracket', fill: 'none' }, renderer.layerNodes)
    this.winLabel = renderer.el('text', { class: 'tf-label--mono' }, renderer.layerLabels)

    // 报文格子(8 个)
    this.segRects = []
    for (let i = 0; i < 8; i++) {
      const g = renderer.el('g', {}, renderer.layerNodes)
      const x = SEG_X0 + i * SEG_STEP
      const rect = renderer.el('rect', { x, y: SENDER_Y, width: SEG_W, height: 44, rx: 8, class: 'tf-seg' }, g)
      const text = renderer.el('text', { x: x + SEG_W / 2, y: SENDER_Y + 28, 'text-anchor': 'middle', class: 'tf-seg-text' }, g)
      const retried = renderer.el('text', { x: x + SEG_W / 2, y: SENDER_Y + 58, 'text-anchor': 'middle', class: 'tf-label--mono' }, g)
      renderer.el('text', { x, y: SENDER_Y - 12, class: 'tf-label--muted' }, g).textContent = `#${i + 1}`
      this.segRects.push({ g, rect, text, retried })
    }

    // 中部通道(ACK 回程标签)
    this.ackNote = renderer.el('text', { x: VIEW.width / 2, y: 300, 'text-anchor': 'middle', class: 'tf-label--mono' }, renderer.layerLabels)
    new Label(renderer, { x: 60, y: 268, text: '↑ 报文发出 / ↓ ACK 返回(中间区域是网络)', kind: 'mono', anchor: 'start' })

    // 重复 ACK 芯片
    this.dupChip = renderer.el('g', {}, renderer.layerLabels)
    renderer.el('rect', { x: 60, y: 316, width: 320, height: 34, rx: 8, class: 'tf-label-pill-bg' }, this.dupChip)
    this.dupText = renderer.el('text', { x: 220, y: 338, 'text-anchor': 'middle', class: 'tf-label-pill' }, this.dupChip)
    this.dupChip.style.opacity = '0'

    // 接收端缓冲
    new Label(renderer, { x: 60, y: 396, text: '接收端(乱序缓存)', kind: 'accent', anchor: 'start' })
    this.recvBufferChip = renderer.el('text', { x: 60, y: 418, class: 'tf-subnet-mono' }, renderer.layerLabels)

    this.slots = []
    for (let i = 0; i < 10; i++) {
      this.slots.push(new Packet(renderer, { id: `rel-slot-${i}`, color: 'accent', shape: 'rect', width: 70, height: 22 }))
    }
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: '窗口 = 4:批量发送 1~4',
        description: '不再停等 —— 窗口内一口气全发。',
        explanation: `三次握手后,发送窗口为 4:报文 **1、2、3、4 一次性发出**(状态:in-flight),不需要每发一个就停下等 ACK。**发送窗口左缘(sendBase)= 1**,只有左缘滑动,才能继续发新报文。`,
        duration: 1400,
        action: 'init',
      },
      {
        id: 'ack12',
        title: 'ACK 1、ACK 2 陆续返回',
        description: '窗口左缘滑到 3,新报文 5 获准发送。',
        explanation: `ACK 的语义是**累计确认**:「ACK 2 = 2 之前的都收到了,期望下一个是 3」。每收到一个 ACK,左缘右滑一格,窗口右侧空出的位置允许发送新报文(报文 5 进入网络)。`,
        duration: 1400,
        action: 'ack12',
      },
      {
        id: 'loss',
        title: '报文 3 在网络中丢失!',
        description: '接收端等不到 3,但 4、5 都到了。',
        explanation: `报文 3 在去程被丢弃(拥塞丢包是常态)。接收端此时收到报文 4 —— **乱序**,它会先把 4 缓存起来,并立刻回一个 **重复 ACK 3**:「我还缺 3」。之后每收到一个新报文,就再重复一次。`,
        duration: 1500,
        action: 'loss',
      },
      {
        id: 'dups',
        title: '重复 ACK 3 连续到达',
        description: '1 个、2 个、3 个 —— 阈值触发!',
        explanation: `发送方连续收到**重复 ACK**(「我还是缺 3」)。收到 **3 个重复 ACK** 就能高度确信「3 真的丢了」(而不是乱序)—— 这就是 **3 个重复 ACK 触发快速重传** 的由来。`,
        duration: 1400,
        action: 'dups',
      },
      {
        id: 'fast-retransmit',
        title: '快速重传:不等超时,立即重发 3',
        description: '反应比超时快得多,窗口只减半不归零。',
        explanation: `收到 3 个重复 ACK,**立即重传报文 3**(快速重传),不用等 RTO 超时。配合快速恢复,拥塞窗口只**减半** —— 因为重复 ACK 说明网络还在通,只是这一段丢了;相比之下超时更严重,窗口会归 1 重来。接收端把缓存的 4、5 与重传的 3 拼上,ACK 一路推到 6。`,
        duration: 1600,
        action: 'fast-retransmit',
      },
      {
        id: 'recover',
        title: '窗口继续滑动,发完全部报文',
        description: 'ACK 5、6 到达,7、8 获准发送并被确认。',
        explanation: `重传的 3 到达后,接收端把 3、4、5 连续上交,ACK 一次推到 6;窗口继续滑动,7、8 发出并确认 —— 全部 8 个报文可靠送达。注意缓存乱序报文 + SACK 选择性确认能避免把 4、5 重发一遍(教学模型按 Go-Back-N 简化,未模拟 SACK)`,
        duration: 1400,
        action: 'recover',
      },
      {
        id: 'timeout',
        title: '另一条路:超时重传(RTO)',
        description: '如果丢失的是最后一个报文,没有后续报文触发重复 ACK。',
        explanation: `快速重传需要「后续报文的重复 ACK」当信号。如果丢失的恰好是**最后一个报文**(没有后续),发送方只能靠 **RTO 超时**(基于 RTT 动态估计,通常 1s 起并指数退避)重传。超时意味着网络严重拥塞:重传后拥塞窗口**归 1**、重新慢启动 —— 这就是「超时比快速重传更痛」的原因。`,
        duration: 1500,
        action: 'timeout',
      },
    ]

    const transitions: StepTransition<ReliableState>[] = [
      s => sendWindow(createReliableState(s.totalSegments)),
      s => receiveAck(receiveAck(s, 1), 2),
      s => {
        // 窗口滑动后发送 5;然后 3 丢失
        let st = sendWindow(s)
        st = receiveSegment(st, 3, false)
        st = receiveSegment(st, 4)
        return st
      },
      s => receiveSegment(s, 5),
      s => receiveSegment(s, 6),
      s => {
        let st = fastRetransmit(s, 3)
        st = receiveAck(st, 6)
        st = sendWindow(st)
        st = receiveAck(st, 8)
        return st
      },
      s => timeoutRetransmit(s),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): ReliableState {
    return createReliableState()
  }

  protected render(state: ReliableState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const tl = opts.timeline

    this.senderNode.setStatus(state.sendBase > state.totalSegments ? 'success' : 'active')
    this.receiverNode.setStatus(state.sendBase > state.totalSegments ? 'success' : 'processing')

    // 报文格子
    for (let i = 0; i < this.segRects.length; i++) {
      const row = this.segRects[i]
      if (!row) continue
      const seg = state.segments[i]
      if (!seg) continue
      const clsMap: Record<string, string> = {
        queued: 'tf-seg',
        inflight: 'tf-seg is-inflight',
        acked: 'tf-seg is-acked',
        lost: 'tf-seg is-lost',
        buffered: 'tf-seg is-buffered',
      }
      row.rect.setAttribute('class', clsMap[seg.status] ?? 'tf-seg')
      row.text.textContent = seg.status === 'acked' ? `✓` : seg.status === 'lost' ? '✗' : `#${seg.seq}`
      row.retried.textContent = seg.retried > 0 ? `重传×${seg.retried}` : ''
    }

    // 窗口括弧
    if (this.winBracket && this.winLabel) {
      const left = SEG_X0 + (state.sendBase - 1) * SEG_STEP - 6
      const rightEnd = Math.min(state.sendBase + state.windowSize - 1, state.totalSegments)
      const right = SEG_X0 + (rightEnd - 1) * SEG_STEP + SEG_W + 6
      const width = right - left
      this.winBracket.setAttribute('d', `M ${left} ${SENDER_Y - 26} h ${width} M ${left} ${SENDER_Y - 26} v 8 M ${left + width} ${SENDER_Y - 26} v 8`)
      this.winLabel.textContent = `窗口 [${state.sendBase}, ${rightEnd}] · 左缘 sendBase = ${state.sendBase}`
      this.winLabel.setAttribute('x', String(left + width / 2))
      this.winLabel.setAttribute('y', String(SENDER_Y - 36))
      this.winLabel.setAttribute('text-anchor', 'middle')
    }

    // 重复 ACK 芯片
    if (this.dupChip && this.dupText) {
      this.dupText.textContent = `重复 ACK ${state.sendBase} × ${state.duplicateAcks}(阈值 3)`
      this.dupChip.style.opacity = state.duplicateAcks > 0 ? '1' : '0'
    }

    // 接收端缓冲
    if (this.recvBufferChip) {
      this.recvBufferChip.textContent = state.receiverBuffered.length
        ? `已缓存乱序报文:${state.receiverBuffered.join(', ')}(等待缺失段)`
        : '乱序缓存:(空)'
    }

    if (this.ackNote) {
      const lastAck = state.acks[state.acks.length - 1]
      this.ackNote.textContent = lastAck
        ? `最近 ACK:${lastAck.kind === 'duplicate-ack' ? '重复' : ''} ACK ${lastAck.ack}${lastAck.lost ? '(回程丢失)' : ''}`
        : ''
    }

    // ACK 报文槽位:展示最近 3 个 ACK 在中部通道
    const recent = state.acks.slice(-3)
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (!slot) continue
      const ack = recent[i]
      if (!ack) {
        slot.show(false)
        continue
      }
      const color = ack.lost ? 'danger' : ack.kind === 'duplicate-ack' ? 'warning' : 'success'
      slot.options.color = color
      const body = slot.group.querySelector('.tf-packet-body-rect')
      if (body) body.setAttribute('class', `tf-packet-body-rect tf-packet-body--${color}`)
      const x = 320 + i * 130
      const y = 220 + (i % 2) * 24
      slot.placeAt(x, y)
      slot.show(true)
      void tl
    }
  }

  protected snapshotData(state: ReliableState, completedSteps: number): Record<string, unknown> {
    const inflight = state.segments.filter(s => s.status === 'inflight').map(s => s.seq)
    const lost = state.segments.filter(s => s.status === 'lost').map(s => s.seq)
    const acked = state.segments.filter(s => s.status === 'acked').map(s => s.seq)
    const queued = state.segments.filter(s => s.status === 'queued').map(s => s.seq)
    return {
      rows: [
        { label: '发送窗口', value: `[${state.sendBase}, ${Math.min(state.sendBase + state.windowSize - 1, state.totalSegments)}] · 大小 ${state.windowSize}`, tone: 'accent' },
        { label: 'sendBase', value: String(state.sendBase) },
        { label: '已确认', value: acked.join(', ') || '(无)', tone: 'success' },
        { label: '在途', value: inflight.join(', ') || '(无)' },
        { label: '丢失', value: lost.join(', ') || '(无)', tone: lost.length ? 'danger' : 'default' },
        { label: '未发送', value: queued.join(', ') || '(无)' },
        { label: '重复 ACK', value: `${state.sendBase} × ${state.duplicateAcks}`, tone: state.duplicateAcks > 0 ? 'warning' : 'default' },
        { label: '快速重传', value: `${state.fastRetransmits} 次` },
        { label: '超时重传', value: `${state.timeouts} 次` },
        { label: '接收端乱序缓存', value: state.receiverBuffered.join(', ') || '(空)' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  private effectiveState(stepState: ReliableState): ReliableState {
    return this.live ?? stepState
  }

  private live: ReliableState | null = null

  getActions(): SceneAction[] {
    return [
      { name: 'send-window', label: '发送窗口内的新报文' },
      {
        name: 'ack',
        label: '接收一个 ACK',
        description: '模拟 ACK 返回(可选丢失)。',
        params: [
          { name: 'ack', label: 'ACK 序号', type: 'number', min: 1, max: 9, placeholder: '3' },
        ],
      },
      {
        name: 'lose',
        label: '让某个在途报文丢失',
        description: '挑战:制造丢包,观察重复 ACK 与重传。',
        params: [
          { name: 'seq', label: '报文序号', type: 'number', min: 1, max: 8, placeholder: '3' },
        ],
      },
      { name: 'fast-retransmit', label: '触发快速重传(丢失段)' },
      { name: 'timeout', label: '触发超时重传(RTO)' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: ReliableState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'send-window':
        apply(sendWindow(base()))
        break
      case 'ack': {
        const ack = Number(params?.ack ?? base().sendBase)
        if (Number.isFinite(ack) && ack >= 1 && ack <= base().totalSegments + 1) {
          apply(receiveAck(base(), Math.floor(ack)))
        }
        break
      }
      case 'lose': {
        const seq = Number(params?.seq ?? 3)
        const st = base()
        const seg = st.segments.find((x: { seq: number }) => x.seq === seq)
        if (seg && seg.status === 'inflight') {
          apply({
            ...st,
            segments: st.segments.map(x =>
              x.seq === seq ? { ...x, status: 'lost' as const } : x,
            ),
            log: [...st.log, `报文 ${seq} 在网络中丢失(发送方尚未察觉)`],
          })
        }
        break
      }
      case 'fast-retransmit': {
        const st = base()
        const lost = st.segments.find(x => x.status === 'lost')
        const target = lost?.seq ?? st.sendBase
        apply(fastRetransmit(st, target))
        break
      }
      case 'timeout':
        apply(timeoutRetransmit(base()))
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new TcpReliableScene(),
}

export default sceneModule
