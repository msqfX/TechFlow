/**
 * UDP 数据报模拟模型(纯函数,可测试)。
 * 丢包由调用方显式给出(lostSeqs),模型保持纯度;TCP 对比为教学估算。
 */

export interface Datagram {
  seq: number
  lost: boolean
}

export interface UdpState {
  total: number
  /** 丢包率 %(教学展示用) */
  lossRate: number
  datagrams: Datagram[]
  /** 是否已交付(接收端收到) */
  delivered: boolean
  receivedSeqs: number[]
  lostSeqs: number[]
  /** 应用层已处理 = 收到的报文数(丢失的应用自行跳过) */
  appHandled: number
  log: string[]
}

export const UDP_HEADER_BYTES = 8
export const TCP_HEADER_BYTES = 20

export function createUdpState(total = 10, lossRate = 20): UdpState {
  return {
    total,
    lossRate,
    datagrams: [],
    delivered: false,
    receivedSeqs: [],
    lostSeqs: [],
    appHandled: 0,
    log: [`准备发送 ${total} 个数据报(教学丢包率 ${lossRate}%)`],
  }
}

/**
 * 无连接发送:不需要握手,直接把数据报丢进网络。
 * lostSeqs 由场景决定(随机或指定),模型保持纯函数。
 */
export function sendDatagrams(s: UdpState, lostSeqs: number[]): UdpState {
  const datagrams: Datagram[] = Array.from({ length: s.total }, (_, i) => ({
    seq: i + 1,
    lost: lostSeqs.includes(i + 1),
  }))
  return {
    ...s,
    datagrams,
    log: [
      ...s.log,
      `无连接发送:直接向目标 IP:端口 发出 ${s.total} 个数据报(丢包 ${lostSeqs.length} 个,发送方不知道也不重传)`,
    ],
  }
}

/** 接收端:收到的原样上交(不重排不确认),丢失的留给应用处理 */
export function deliverUdp(s: UdpState): UdpState {
  const receivedSeqs = s.datagrams.filter(d => !d.lost).map(d => d.seq)
  const lostSeqs = s.datagrams.filter(d => d.lost).map(d => d.seq)
  return {
    ...s,
    delivered: true,
    receivedSeqs,
    lostSeqs,
    appHandled: receivedSeqs.length,
    log: [
      ...s.log,
      `接收端收到 ${receivedSeqs.length}/${s.total} 个数据报(边界保留,不重排不确认)`,
      `应用层处理:收到的 ${receivedSeqs.length} 个直接用;丢失的 ${lostSeqs.length} 个由应用自救(视频跳帧 / DNS 超时重发)`,
    ],
  }
}

/** 抖动示意:接收顺序可能与发送顺序不同(教学模型,传入打乱后的到达序) */
export function arrivalOrder(s: UdpState, order: number[]): number[] {
  const valid = order.filter(seq => s.receivedSeqs.includes(seq))
  return valid
}

export interface TcpCompare {
  udpHeaderBytes: number
  tcpHeaderBytes: number
  /** TCP:握手 1 RTT + 每个丢失段重传 1 RTT(教学估算) */
  tcpHandshakeRtts: number
  tcpRetransmitRtts: number
  udpRtts: number
  /** 数据字节的头部开销差(教学估算) */
  udpOverheadBytes: number
  tcpOverheadBytes: number
  tcpSegmentsRetransmitted: number
  /** 教学估算耗时(ms) */
  udpTotalMs: number
  tcpTotalMs: number
}

/** 教学估算:同样丢包场景下 TCP 需要的额外代价(1 RTT 握手 + 每丢 1 段 1 RTT 重传) */
export function compareWithTcp(s: UdpState, rttMs = 40): TcpCompare {
  const lostCount = s.lostSeqs.length
  return {
    udpHeaderBytes: UDP_HEADER_BYTES * s.total,
    tcpHeaderBytes: TCP_HEADER_BYTES * s.total,
    tcpHandshakeRtts: 1,
    tcpRetransmitRtts: lostCount,
    udpRtts: 0,
    udpOverheadBytes: UDP_HEADER_BYTES * s.total,
    tcpOverheadBytes: TCP_HEADER_BYTES * s.total,
    tcpSegmentsRetransmitted: lostCount,
    udpTotalMs: 0,
    tcpTotalMs: (1 + lostCount) * rttMs,
  }
}
