/**
 * TCP 三次握手状态机模型(纯函数,可测试)。
 * 状态与迁移遵循 RFC 793,Seq/Ack 语义:ack = 期望的下一个字节序号。
 */

export type TcpEndpointState = 'CLOSED' | 'LISTEN' | 'SYN_SENT' | 'SYN_RCVD' | 'ESTABLISHED'

export type HandshakeMsgKind = 'SYN' | 'SYN-ACK' | 'ACK' | 'RST' | 'RETRY-SYN'

export interface HandshakeMsg {
  id: string
  kind: HandshakeMsgKind
  /** 发送方视角的序号 */
  seq: number | null
  /** 确认号(期望收到的下一字节) */
  ack: number | null
  /** 报文是否送达 */
  delivered: boolean
  /** 是否因模拟丢失 */
  lost: boolean
}

export interface HandshakeState {
  client: TcpEndpointState
  server: TcpEndpointState
  isnClient: number
  isnServer: number
  msgs: HandshakeMsg[]
  /** 服务端半开连接数(SYN Flood 模拟) */
  halfOpen: number
  /** 客户端已重传次数 */
  retries: number
  log: string[]
}

let msgSeq = 0
function makeMsg(kind: HandshakeMsgKind, seq: number | null, ack: number | null, delivered: boolean): HandshakeMsg {
  msgSeq += 1
  return { id: `msg-${msgSeq}`, kind, seq, ack, delivered, lost: !delivered }
}

export function createHandshakeState(isnClient: number, isnServer: number): HandshakeState {
  return {
    client: 'CLOSED',
    server: 'LISTEN',
    isnClient,
    isnServer,
    msgs: [],
    halfOpen: 0,
    retries: 0,
    log: [`客户端与服务端初始序列号 ISN: C=${isnClient}, S=${isnServer}`],
  }
}

/** 第一步:客户端发送 SYN(CLOSED → SYN_SENT) */
export function sendSyn(s: HandshakeState, delivered = true): HandshakeState {
  return {
    ...s,
    client: 'SYN_SENT',
    msgs: [...s.msgs, makeMsg('SYN', s.isnClient, null, delivered)],
    log: [...s.log, `客户端发送 SYN(seq=${s.isnClient}),进入 SYN_SENT`],
  }
}

/** 第二步:服务端收到 SYN(含重传),回复 SYN+ACK(LISTEN → SYN_RCVD,半开连接 +1) */
export function receiveSynSendSynAck(s: HandshakeState): HandshakeState {
  const last = s.msgs[s.msgs.length - 1]
  const isSyn = last && (last.kind === 'SYN' || last.kind === 'RETRY-SYN') && last.delivered
  if (!isSyn) {
    // SYN 未送达:服务端无感知,维持原状
    return { ...s, log: [...s.log, 'SYN 在途中丢失,服务端没有收到,状态不变'] }
  }
  return {
    ...s,
    server: 'SYN_RCVD',
    halfOpen: s.halfOpen + 1,
    msgs: [...s.msgs, makeMsg('SYN-ACK', s.isnServer, s.isnClient + 1, true)],
    log: [...s.log, `服务端收到 SYN,回复 SYN+ACK(seq=${s.isnServer}, ack=${s.isnClient + 1}),进入 SYN_RCVD(半开连接 +1)`],
  }
}

/** 第三步:客户端收到 SYN+ACK,回复 ACK(SYN_SENT → ESTABLISHED) */
export function receiveSynAckSendAck(s: HandshakeState): HandshakeState {
  const last = s.msgs[s.msgs.length - 1]
  if (!last || last.kind !== 'SYN-ACK') return s
  return {
    ...s,
    client: 'ESTABLISHED',
    msgs: [...s.msgs, makeMsg('ACK', s.isnClient + 1, s.isnServer + 1, true)],
    log: [...s.log, `客户端收到 SYN+ACK(ack=${s.isnClient + 1} 确认了它的 SYN),回复 ACK(ack=${s.isnServer + 1}),进入 ESTABLISHED`],
  }
}

/** 第四步:服务端收到 ACK,连接建立(SYN_RCVD → ESTABLISHED,半开连接 −1) */
export function receiveAckEstablished(s: HandshakeState): HandshakeState {
  const last = s.msgs[s.msgs.length - 1]
  if (!last || last.kind !== 'ACK' || !last.delivered) return s
  return {
    ...s,
    server: 'ESTABLISHED',
    halfOpen: Math.max(0, s.halfOpen - 1),
    log: [...s.log, '服务端收到 ACK,进入 ESTABLISHED —— 连接建立完成,可以传数据'],
  }
}

/** SYN 丢失后的客户端超时重传 */
export function retransmitSyn(s: HandshakeState, delivered = true): HandshakeState {
  return {
    ...s,
    retries: s.retries + 1,
    msgs: [...s.msgs, makeMsg('RETRY-SYN', s.isnClient, null, delivered)],
    log: [...s.log, `客户端超时未收到确认,重传 SYN(第 ${s.retries} 次,指数退避)`],
  }
}

/** 判断握手是否完成 */
export function isEstablished(s: HandshakeState): boolean {
  return s.client === 'ESTABLISHED' && s.server === 'ESTABLISHED'
}
