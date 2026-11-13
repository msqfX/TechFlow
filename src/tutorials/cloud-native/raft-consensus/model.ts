/**
 * Raft 共识模型(5 节点,脚本化选主与日志复制;纯函数,可测试)。
 * 阶段由步骤驱动:超时 → 拉票 → 计票 → 当选 → 心跳;宕机后重新选举(任期 +1)。
 * 多数派 = 3/5。
 */

export type RaftRole = 'follower' | 'candidate' | 'leader' | 'crashed'

export interface RaftNode {
  id: string
  name: string
  role: RaftRole
  term: number
  /** 本任期是否已投票 */
  votedFor: string | null
  /** 已复制的日志条数 */
  logLen: number
  /** 已提交(apply)的日志条数 */
  committed: number
}

export type RaftPacketKind = 'request-vote' | 'vote' | 'heartbeat' | 'replicate' | 'ack' | 'client-write'

export interface RaftPacket {
  id: string
  from: string
  to: string
  kind: RaftPacketKind
  term: number
  lost: boolean
}

export interface RaftState {
  nodes: RaftNode[]
  term: number
  leaderId: string | null
  packets: RaftPacket[]
  votesReceived: number
  /** 未提交的日志条目 */
  pendingEntry: string | null
  splitVote: boolean
  log: string[]
}

export const RAFT_NODE_NAMES = ['N1', 'N2', 'N3', 'N4', 'N5']
export const MAJORITY = 3

let raftSeq = 0
function makePacket(from: string, to: string, kind: RaftPacketKind, term: number, lost = false): RaftPacket {
  raftSeq += 1
  return { id: `raft-pkt-${raftSeq}`, from, to, kind, term, lost }
}

export function createRaftState(): RaftState {
  const nodes: RaftNode[] = RAFT_NODE_NAMES.map(name => ({
    id: name,
    name,
    role: 'follower',
    term: 0,
    votedFor: null,
    logLen: 0,
    committed: 0,
  }))
  return {
    nodes,
    term: 0,
    leaderId: null,
    packets: [],
    votesReceived: 0,
    pendingEntry: null,
    splitVote: false,
    log: ['集群初始:5 个 Follower,term=0;等待随机超时触发选举'],
  }
}

/** Follower 超时 → 成为 Candidate,term+1,自投一票并拉票 */
export function startElection(s: RaftState, nodeId: string): RaftState {
  const term = s.term + 1
  const nodes = s.nodes.map(n => {
    if (n.id === nodeId) {
      return { ...n, role: 'candidate' as const, term, votedFor: nodeId }
    }
    // 其他节点 term 落后:重置投票资格(教学简化)
    return n.term < term ? { ...n, term, votedFor: null } : n
  })
  const others = RAFT_NODE_NAMES.filter(n => n !== nodeId)
  const packets = others.map(to => makePacket(nodeId, to, 'request-vote', term))
  return {
    ...s,
    nodes,
    term,
    leaderId: null,
    votesReceived: 1,
    packets: [...s.packets, ...packets],
    splitVote: false,
    log: [...s.log, `${nodeId} 心跳超时 → 成为 Candidate,term=${term},自投一票,向 ${others.join(', ')} 拉票(RequestVote)`],
  }
}

/** 节点收到拉票:term 更大且未投票 → 投票 */
export function receiveVoteRequest(s: RaftState, candidateId: string, voterId: string, granted: boolean): RaftState {
  const term = s.term
  const voters = s.nodes.map(n => {
    if (n.id !== voterId) return n
    return granted && n.votedFor === null ? { ...n, term, votedFor: candidateId } : { ...n, term }
  })
  const packets = [...s.packets, makePacket(voterId, candidateId, 'vote', term)]
  const votesReceived = granted ? s.votesReceived + 1 : s.votesReceived
  return {
    ...s,
    nodes: voters,
    packets,
    votesReceived,
    log: [...s.log, granted ? `${voterId} 投票给 ${candidateId}(term=${term},本轮未投过票)` : `${voterId} 拒绝投票(已投给 ${s.nodes.find(n => n.id === voterId)?.votedFor ?? '他人'})`],
  }
}

/** 票数达到多数派 → 当选 Leader,广播心跳 */
export function winElection(s: RaftState, leaderId: string): RaftState {
  if (s.votesReceived < MAJORITY) return s
  const others = RAFT_NODE_NAMES.filter(n => n !== leaderId)
  const packets = others.map(to => makePacket(leaderId, to, 'heartbeat', s.term))
  return {
    ...s,
    leaderId: leaderId,
    nodes: s.nodes.map(n => (n.id === leaderId ? { ...n, role: 'leader' as const } : n.role === 'candidate' ? { ...n, role: 'follower' as const } : n)),
    packets: [...s.packets, ...packets],
    log: [...s.log, `${leaderId} 获 ${s.votesReceived}/${RAFT_NODE_NAMES.length} 票(多数派 ≥ ${MAJORITY})→ 当选 Leader,term=${s.term},广播心跳`],
  }
}

/** 票数分裂(平票):term+1 重新选举 */
export function splitVote(s: RaftState): RaftState {
  return {
    ...s,
    splitVote: true,
    log: [...s.log, '票数分裂:没有任何候选者拿到多数派 → 随机超时后 term+1 重新选举(教学示意)'],
  }
}

/** Leader 收客户端写请求:追加日志 */
export function clientWrite(s: RaftState, entry: string): RaftState {
  const leader = s.leaderId
  if (!leader) return { ...s, log: [...s.log, '无 Leader,写请求被拒绝(需先完成选举)'] }
  const packets = [...s.packets, makePacket('client', leader, 'client-write', s.term)]
  return {
    ...s,
    pendingEntry: entry,
    packets,
    nodes: s.nodes.map(n => (n.id === leader ? { ...n, logLen: n.logLen + 1 } : n)),
    log: [...s.log, `客户端写 "${entry}" → 只有 Leader 接收;追加日志(未提交),并行复制给 Followers`],
  }
}

/** Leader 复制日志给 Followers */
export function replicateLog(s: RaftState): RaftState {
  const leader = s.leaderId
  if (!leader || !s.pendingEntry) return s
  const others = RAFT_NODE_NAMES.filter(n => n !== leader)
  const packets = others.map(to => makePacket(leader, to, 'replicate', s.term))
  return {
    ...s,
    packets: [...s.packets, ...packets],
    // Followers 收到复制请求后追加到本地日志(未提交,等待多数派确认)
    nodes: s.nodes.map(n => (n.id === leader || n.role === 'crashed' ? n : { ...n, logLen: n.logLen + 1 })),
    log: [...s.log, `Leader ${leader} 复制日志 "${s.pendingEntry}" → ${others.join(', ')}(心跳顺路携带)`],
  }
}

/** 多数派 ACK → 提交(commit),Follower 跟随 apply */
export function commitEntry(s: RaftState): RaftState {
  const entry = s.pendingEntry
  if (!entry) return s
  const packets = RAFT_NODE_NAMES.filter(n => n !== s.leaderId).map(to => makePacket(s.leaderId ?? 'N1', to, 'ack', s.term))
  return {
    ...s,
    pendingEntry: null,
    packets: [...s.packets, ...packets],
    nodes: s.nodes.map(n => (n.role === 'crashed' ? n : { ...n, committed: n.logLen })),
    log: [...s.log, `多数派 ACK → 提交 "${entry}"(apply 到状态机),心跳告知 Followers 提交点`],
  }
}

/** Leader 宕机(挑战模拟) */
export function crashLeader(s: RaftState): RaftState {
  const leader = s.leaderId
  if (!leader) return s
  return {
    ...s,
    leaderId: null,
    nodes: s.nodes.map(n => (n.id === leader ? { ...n, role: 'crashed' as const } : { ...n, role: 'follower' as const, votedFor: null })),
    log: [...s.log, `⚠ Leader ${leader} 宕机:集群无主,Follower 随机超时后将发起新选举(term 将 +1)`],
  }
}

/** 检查日志一致性:已提交条数全节点一致(commitEntry 后) */
export function logConsistent(s: RaftState): boolean {
  const alive = s.nodes.filter(n => n.role !== 'crashed')
  return alive.length > 0 && alive.every(n => n.committed === (alive[0]?.committed ?? 0))
}
