import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  compareWithTcp,
  createUdpState,
  deliverUdp,
  sendDatagrams,
} from './model'
import type { UdpState } from './model'

/** UDP 场景:无连接数据报发送、丢包消散、接收统计与 TCP 对比 */

const VIEW = { width: 840, height: 620 }
const SENDER = { x: 120, y: 110 }
const RECEIVER = { x: 120, y: 470 }
const CHANNEL_Y0 = 190
const LANE_STEP = 36

class UdpScene extends BaseScene<UdpState> {
  private senderNode!: NetworkNode
  private receiverNode!: NetworkNode
  private lanes: Array<{ g: SVGGElement; box: SVGRectElement; text: SVGTextElement; state: SVGTextElement }> = []
  private slots: Packet[] = []
  private noConnLabel: SVGTextElement | null = null
  private compareGroup: SVGGElement | null = null
  private compareLines: SVGTextElement[] = []
  private live: UdpState | null = null

  constructor() {
    super({ id: 'udp', viewBox: VIEW, label: 'UDP 数据报收发' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.senderNode = new NetworkNode(renderer, {
      id: 'sender', x: SENDER.x, y: SENDER.y, width: 150, height: 54, label: '发送应用', glyph: 'UDP',
    })
    this.receiverNode = new NetworkNode(renderer, {
      id: 'receiver', x: SENDER.x, y: RECEIVER.y, width: 150, height: 54, label: '接收应用', glyph: 'APP',
    })

    // 无连接标注
    this.noConnLabel = renderer.el('text', {
      x: SENDER.x + 190,
      y: SENDER.y + 20,
      class: 'tf-tcp-state tf-tcp-state--warning',
    }, renderer.layerLabels)
    this.noConnLabel.textContent = '无连接:没有握手,拿到端口直接发'

    // 每个数据报一条泳道
    this.lanes = []
    for (let i = 0; i < 10; i++) {
      const y = CHANNEL_Y0 + i * LANE_STEP
      const g = renderer.el('g', {}, renderer.layerLabels)
      const box = renderer.el('rect', { x: 330, y: y - 13, width: 220, height: 28, rx: 6, class: 'tf-subnet-row-bg' }, g)
      const text = renderer.el('text', { x: 348, y: y + 5, class: 'tf-subnet-mono' }, g)
      const state = renderer.el('text', { x: 532, y: y + 5, 'text-anchor': 'end', class: 'tf-subnet-result' }, g)
      g.style.opacity = '0'
      this.lanes.push({ g, box, text, state })
    }

    new Label(renderer, { x: 700, y: CHANNEL_Y0 + 12, text: '网络(可能丢包)', kind: 'muted', anchor: 'start' })

    // 统计
    this.compareGroup = renderer.el('g', {}, renderer.layerLabels)
    renderer.el('rect', { x: 620, y: 176, width: 196, height: 264, rx: 10, class: 'tf-ip-card' }, this.compareGroup)
    renderer.el('text', { x: 636, y: 200, class: 'tf-label--accent' }, this.compareGroup!).textContent = '收发统计'
    this.compareLines = []
    const stats = ['已发送', '已收到', '丢失', '应用已处理']
    stats.forEach((s, i) => {
      renderer.el('text', { x: 636, y: 234 + i * 34, class: 'tf-label--muted' }, this.compareGroup!).textContent = s
      const v = renderer.el('text', { x: 800, y: 234 + i * 34, 'text-anchor': 'end', class: 'tf-cpu-value' }, this.compareGroup!)
      this.compareLines.push(v)
    })

    // TCP 对比卡
    renderer.el('rect', { x: 620, y: 452, width: 196, height: 130, rx: 10, class: 'tf-ip-card' }, renderer.layerLabels)
    renderer.el('text', { x: 636, y: 476, class: 'tf-label--accent' }, renderer.layerLabels).textContent = '换成 TCP 的话'
    renderer.el('text', { x: 636, y: 500, class: 'tf-label--muted' }, renderer.layerLabels).textContent = '+1 RTT 握手'
    renderer.el('text', { x: 636, y: 524, class: 'tf-label--muted' }, renderer.layerLabels).textContent = '+每个丢失段 1 RTT 重传'
    renderer.el('text', { x: 636, y: 548, class: 'tf-label--muted' }, renderer.layerLabels).textContent = '+20 字节/段 头部'
    const tc = renderer.el('text', { x: 636, y: 576, class: 'tf-subnet-mono' }, renderer.layerLabels)
    tc.textContent = 'TCP 额外耗时:'
    void tc

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 6, text: '教学说明:丢包率是实验设置;真实网络通常 <1%,QUIC 在 UDP 上自建可靠性', kind: 'muted' })

    this.slots = []
    for (let i = 0; i < 10; i++) {
      this.slots.push(new Packet(renderer, { id: `udp-slot-${i}`, color: 'accent', shape: 'rect', width: 58, height: 20 }))
    }
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'send',
        title: '无连接:拿到端口直接发',
        description: '不握手 —— 数据报一个接一个丢进网络。',
        explanation: `TCP 发数据前要三次握手;UDP **没有任何准备工作**:应用把数据块交给 UDP,加上 8 字节头(源/目的端口、长度、校验和),直接发往目标 IP:端口。DNS 一问一答、视频流连续发帧 —— 都是这种「即发即走」的形状。`,
        duration: 1400,
        action: 'send',
      },
      {
        id: 'fly',
        title: '数据报独立穿越网络',
        description: '每个数据报各自路由,互不知道对方存在。',
        explanation: `每个数据报是**独立的** —— 网络拥塞时任何一个都可能被路由器丢弃(和 TCP 一样,丢包是 IP 层的常态)。区别在于:UDP **发送方不知道也不关心**谁丢了;接收端收到就是收到,没有任何确认回执。`,
        duration: 1500,
        action: 'fly',
      },
      {
        id: 'loss',
        title: '部分数据报丢失',
        description: '发送方不知情,接收端收不到也不抱怨。',
        explanation: `丢失的报文没有任何补救:**没有确认、没有重传、没有超时**。发送方永远不知道丢了;接收端只能看到「收到的那部分」。这正是「不保证可靠」的含义 —— 注意丢包率是本实验的教学设置,真实网络通常在 1% 量级以下。`,
        duration: 1500,
        action: 'loss',
      },
      {
        id: 'deliver',
        title: '收到的按到达顺序上交应用',
        description: '边界保留,不重排 —— 乱序也可能发生。',
        explanation: `接收端把收到的数据报**原样上交**:UDP 保留**消息边界**(发多大块收多大块,TCP 是无边界字节流),也**不重排**(后发的可能先到)。缺了中间的报文?应用自己决定怎么办。`,
        duration: 1300,
        action: 'deliver',
      },
      {
        id: 'app',
        title: '应用层自救',
        description: '视频跳帧 / DNS 超时重发 / 游戏插值。',
        explanation: `可靠性难题原封不动交给了应用:**视频**直接跳帧播最新画面(重传过时帧毫无意义);**DNS**应用层设超时重发;**游戏**用插值预测填补;**都要可靠** → 用 TCP,或者像 **QUIC** 那样在 UDP 上自建可靠传输(HTTP/3 的底座)。`,
        duration: 1400,
        action: 'app',
      },
      {
        id: 'compare',
        title: '对比:同样丢包换成 TCP 会怎样',
        description: '+1 RTT 握手 +每个丢失段 1 RTT 重传。',
        explanation: `看右侧对比卡:同样这批数据走 TCP,需要**先花 1 个 RTT 握手**,每个丢失的段再花 **1 个 RTT 重传确认** —— 可靠性的代价就是时间与交互次数。UDP 用零代价换「可能丢」;这个交换对实时音视频往往划算,对网页/API 则相反。`,
        duration: 1400,
        action: 'compare',
      },
    ]

    // 丢包模式:按教学节奏挑 2、5、8 丢失(30%)
    const lostPattern = [2, 5, 8]
    const transitions: StepTransition<UdpState>[] = [
      s => sendDatagrams({ ...s, lossRate: 30 }, lostPattern),
      s => ({ ...s, log: [...s.log, '数据报 1~10 各自独立路由(互不知晓)'] }),
      s => ({ ...s, log: [...s.log, `报文 ${lostPattern.join(', ')} 在网络中丢失 —— 无确认无重传`] }),
      s => deliverUdp(s),
      s => ({ ...s, log: [...s.log, `应用收到 ${s.receivedSeqs.length} 个,丢失 ${s.lostSeqs.length} 个 —— 应用自行跳过`] }),
      s => ({ ...s, log: [...s.log, '对比:TCP 同场景需 1 RTT 握手 + 3 RTT 重传(见右侧)'] }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): UdpState {
    return createUdpState(10, 30)
  }

  private effectiveState(stepState: UdpState): UdpState {
    return this.live ?? stepState
  }

  protected render(stepState: UdpState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    this.senderNode.setStatus(state.delivered ? 'success' : state.datagrams.length ? 'active' : 'idle')
    this.receiverNode.setStatus(state.delivered ? 'success' : 'idle')

    if (this.noConnLabel) {
      this.noConnLabel.style.opacity = state.datagrams.length ? '1' : '0'
    }

    // 泳道 + 报文
    for (let i = 0; i < this.lanes.length; i++) {
      const lane = this.lanes[i]
      if (!lane) continue
      const dg = state.datagrams[i]
      if (!dg) {
        lane.g.style.opacity = '0'
        const slot0 = this.slots[i]
        slot0?.show(false)
        continue
      }
      const y = CHANNEL_Y0 + i * LANE_STEP
      lane.g.style.opacity = '1'
      if (lane.text) lane.text.textContent = `数据报 #${dg.seq}`
      if (lane.state) {
        lane.state.textContent = state.delivered ? (dg.lost ? '✗ 丢失' : '✓ 收到') : dg.lost ? '(将丢失)' : '传输中'
        lane.state.setAttribute('class', `tf-subnet-result ${state.delivered ? (dg.lost ? 'bad' : 'ok') : ''}`)
      }

      const slot = this.slots[i]
      if (!slot) continue
      const x = 430
      if (state.delivered) {
        slot.placeAt(dg.lost ? 540 : 350, y)
        slot.show(!dg.lost)
        slot.options.color = 'success'
        const body = slot.group.querySelector('.tf-packet-body-rect')
        if (body) body.setAttribute('class', 'tf-packet-body-rect tf-packet-body--success')
      } else if (tl && !dg.lost) {
        slot.options.color = 'accent'
        const body = slot.group.querySelector('.tf-packet-body-rect')
        if (body) body.setAttribute('class', 'tf-packet-body-rect tf-packet-body--accent')
        slot.placeAt(230, y)
        slot.show(true)
        tl.to(slot.group, { x: x - 230, duration: 0.55, ease: 'power1.inOut' }, 0)
      } else if (tl && dg.lost) {
        slot.options.color = 'danger'
        const body = slot.group.querySelector('.tf-packet-body-rect')
        if (body) body.setAttribute('class', 'tf-packet-body-rect tf-packet-body--danger')
        slot.placeAt(230, y)
        slot.show(true)
        tl.to(slot.group, { x: 190, duration: 0.35, ease: 'power1.in' }, 0)
        tl.to(slot.group, { opacity: 0, duration: 0.25 }, 0.4)
      } else {
        slot.show(false)
      }
    }

    // 统计
    const statValues = [
      String(state.datagrams.length),
      String(state.receivedSeqs.length),
      String(state.lostSeqs.length),
      String(state.appHandled),
    ]
    this.compareLines.forEach((el, i) => {
      el.textContent = state.delivered ? (statValues[i] ?? '') : '—'
    })
  }

  protected snapshotData(stepState: UdpState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const cmp = state.delivered ? compareWithTcp(state) : null
    return {
      rows: [
        { label: '数据报数', value: `${state.total} 个 × 8 字节头` },
        { label: '教学丢包率', value: `${state.lossRate}%`, tone: 'warning' },
        { label: '已收到', value: state.delivered ? `${state.receivedSeqs.length} 个` : '(未交付)', tone: state.delivered ? 'success' : 'default' },
        { label: '丢失', value: state.delivered ? `${state.lostSeqs.length} 个(${state.lostSeqs.join(', ') || '无'})` : '—', tone: state.lostSeqs.length ? 'danger' : 'success' },
        { label: '重传', value: '0 —— UDP 不会重传', tone: 'accent' },
        { label: '消息边界', value: '保留(面向报文)' },
        ...(cmp
          ? [
              { label: 'TCP 估算耗时', value: `${cmp.tcpTotalMs}ms(握手+重传)`, tone: 'warning' as const },
              { label: 'UDP 估算耗时', value: `${cmp.udpTotalMs}ms(单程)`, tone: 'success' as const },
              { label: 'TCP 需重传段', value: `${cmp.tcpSegmentsRetransmitted} 个`, tone: 'warning' as const },
            ]
          : []),
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'send',
        label: '发送一批数据报',
        description: '按当前丢包率随机丢失。',
        params: [
          {
            name: 'count',
            label: '数量',
            type: 'select',
            options: [
              { value: '5', label: '5 个' },
              { value: '10', label: '10 个' },
              { value: '16', label: '16 个' },
            ],
          },
          {
            name: 'loss',
            label: '教学丢包率',
            type: 'select',
            options: [
              { value: '0', label: '0%(理想)' },
              { value: '20', label: '20%' },
              { value: '40', label: '40%(拥塞)' },
            ],
          },
        ],
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    if (name !== 'send') return
    const count = Math.min(10, Math.max(1, Number(params?.count ?? 10)))
    const lossRate = Math.min(90, Math.max(0, Number(params?.loss ?? 20)))
    const lostSeqs: number[] = []
    for (let seq = 1; seq <= count; seq++) {
      if (Math.random() * 100 < lossRate) lostSeqs.push(seq)
    }
    let st = createUdpState(count, lossRate)
    st = sendDatagrams(st, lostSeqs)
    st = deliverUdp(st)
    this.live = st
    this.render(st, { animate: false, timeline: null, fromIndex: 0 })
    this.events.emit('data', this.getState())
  }
}

const sceneModule: SceneModule = {
  create: () => new UdpScene(),
}

export default sceneModule
