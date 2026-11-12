/**
 * TCP 可靠传输模拟模型(教学简化:固定窗口 4,累计确认 + 重复 ACK + 快速重传)。
 * 纯函数,可测试。
 */

export type SegmentStatus = 'queued' | 'inflight' | 'acked' | 'lost' | 'buffered'

export interface Segment {
  seq: number
  status: SegmentStatus
  /** 重传次数 */
  retried: number
}

export type AckKind = 'ack' | 'duplicate-ack'

export interface AckPacket {
  id: string
  ack: number
  kind: AckKind
  lost?: boolean
}

export interface ReliableState {
  windowSize: number
  sendBase: number
  nextSeq: number
  totalSegments: number
  segments: Segment[]
  /** 接收端乱序缓存(缺失段之后的已收序号) */
  receiverBuffered: number[]
  acks: AckPacket[]
  duplicateAcks: number
  fastRetransmits: number
  timeouts: number
  log: string[]
}

export const WINDOW_SIZE = 4
export const DUP_ACK_THRESHOLD = 3

export function createReliableState(totalSegments = 8): ReliableState {
  return {
    windowSize: WINDOW_SIZE,
    sendBase: 1,
    nextSeq: 1,
    totalSegments,
    segments: Array.from({ length: totalSegments }, (_, i) => ({
      seq: i + 1,
      status: 'queued' as const,
      retried: 0,
    })),
    receiverBuffered: [],
    acks: [],
    duplicateAcks: 0,
    fastRetransmits: 0,
    timeouts: 0,
    log: ['连接已建立(三次握手完成),发送窗口 = 4'],
  }
}

let ackSeq = 0
function makeAck(ack: number, kind: AckKind, lost = false): AckPacket {
  ackSeq += 1
  return { id: `ack-${ackSeq}`, ack, kind, lost }
}

/** 把窗口内所有未发送的报文一次性发出 */
export function sendWindow(s: ReliableState): ReliableState {
  const toSend: number[] = []
  const segments = s.segments.map(seg => {
    if (seg.seq >= s.sendBase && seg.seq < s.sendBase + s.windowSize && seg.status === 'queued') {
      toSend.push(seg.seq)
      return { ...seg, status: 'inflight' as const }
    }
    return seg
  })
  const maxSent = toSend.length ? Math.max(...toSend) : s.nextSeq - 1
  return {
    ...s,
    segments,
    nextSeq: Math.max(s.nextSeq, maxSent + 1),
    log: toSend.length
      ? [...s.log, `窗口滑动:一次性发送报文 ${toSend.join(', ')}(无需逐个等待)`]
      : [...s.log, '窗口内没有待发送的新报文'],
  }
}

/** 接收端收到一个 ACK(累计确认);duplicate 判断由调用方依据 receiveUpto 决定 */
export function receiveAck(s: ReliableState, ack: number, lost = false): ReliableState {
  const isDuplicate = ack <= s.sendBase
  const acks = [...s.acks, makeAck(ack, isDuplicate ? 'duplicate-ack' : 'ack', lost)]
  if (lost) {
    return {
      ...s,
      acks,
      log: [...s.log, `ACK ${ack} 在回程丢失(发送方将超时等待)`],
    }
  }
  if (isDuplicate) {
    return {
      ...s,
      acks,
      duplicateAcks: s.duplicateAcks + 1,
      log: [...s.log, `收到重复 ACK ${ack}(第 ${s.duplicateAcks + 1} 次):接收端仍在等待缺失段`],
    }
  }
  // 累计确认:窗口左缘滑动到 ack;所有 < ack 的 inflight 报文标记 acked
  const ackedSeqs: number[] = []
  const segments = s.segments.map(seg => {
    if (seg.seq < ack && (seg.status === 'inflight' || seg.status === 'lost')) {
      ackedSeqs.push(seg.seq)
      return { ...seg, status: 'acked' as const }
    }
    return seg
  })
  const buffered = s.receiverBuffered.filter(sq => sq >= ack)
  return {
    ...s,
    segments,
    acks,
    sendBase: Math.max(s.sendBase, ack),
    receiverBuffered: buffered,
    duplicateAcks: 0,
    log: [...s.log, `收到 ACK ${ack}:窗口左缘滑到 ${Math.max(s.sendBase, ack)},${ackedSeqs.length ? `报文 ${ackedSeqs.join(', ')} 已确认` : '窗口右移'}`],
  }
}

/** 接收端收到数据段:乱序时缓存并回重复 ACK */
export function receiveSegment(s: ReliableState, seq: number, delivered = true): ReliableState {
  const expect = s.sendBase
  if (seq === expect) {
    // 连续到达:期望值前推(把已缓冲的连续段一并上交)
    let next = seq
    const rest = s.receiverBuffered.filter(sq => sq > seq).sort((a, b) => a - b)
    for (const sq of rest) {
      if (sq === next + 1) next = sq
      else break
    }
    return {
      ...s,
      receiverBuffered: s.receiverBuffered.filter(sq => sq > next),
      log: [...s.log, `接收端收到报文 ${seq}(按序),回 ACK ${next + 1}`],
    }
  }
  if (!delivered) {
    return { ...s, log: [...s.log, `报文 ${seq} 在网络中丢失(后续报文触发重复 ACK)`] }
  }
  // 乱序:缓存,并重发对 expect 的 ACK
  if (!s.receiverBuffered.includes(seq)) {
    return {
      ...s,
      receiverBuffered: [...s.receiverBuffered, seq],
      acks: [...s.acks, makeAck(expect, 'duplicate-ack')],
      duplicateAcks: s.duplicateAcks + 1,
      log: [...s.log, `接收端乱序收到报文 ${seq}(缺失 ${expect})→ 缓存并重复 ACK ${expect}(第 ${s.duplicateAcks + 1} 次)`],
    }
  }
  return s
}

/** 快速重传:重复 ACK 达到阈值,立即重传丢失段 */
export function fastRetransmit(s: ReliableState, seq: number): ReliableState {
  const segments = s.segments.map(seg =>
    seg.seq === seq ? { ...seg, status: 'inflight' as const, retried: seg.retried + 1 } : seg,
  )
  return {
    ...s,
    segments,
    duplicateAcks: 0,
    fastRetransmits: s.fastRetransmits + 1,
    log: [...s.log, `⚠ ${DUP_ACK_THRESHOLD} 个重复 ACK → 快速重传报文 ${seq}(不等超时)`],
  }
}

/** 超时重传:RTO 到期,重传 sendBase 起的所有未确认段(GBN 教学模型) */
export function timeoutRetransmit(s: ReliableState): ReliableState {
  const unacked = s.segments.filter(
    seg => seg.seq >= s.sendBase && (seg.status === 'inflight' || seg.status === 'lost'),
  )
  const seqs = unacked.map(u => u.seq)
  const segments = s.segments.map(seg =>
    seg.seq >= s.sendBase && (seg.status === 'inflight' || seg.status === 'lost')
      ? { ...seg, status: 'inflight' as const, retried: seg.retried + 1 }
      : seg,
  )
  return {
    ...s,
    segments,
    timeouts: s.timeouts + 1,
    log: [...s.log, `⏱ 超时(RTO):重传未确认报文 ${seqs.join(', ') || '(无)'} —— 网络可能严重拥塞,窗口将收缩`],
  }
}

/** 窗口内可发送的新报文数 */
export function usableWindow(s: ReliableState): number {
  return s.sendBase + s.windowSize - s.nextSeq
}
