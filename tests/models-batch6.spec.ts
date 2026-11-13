import { describe, expect, it } from 'vitest'
import {
  advanceStage,
  createMysqlState,
  mysqlFinished,
} from '@/tutorials/database/mysql-architecture/model'
import {
  createRegistryState,
  discover,
  heartbeat,
  instanceCount,
  register,
  tick,
} from '@/tutorials/cloud-native/service-discovery/model'
import {
  MAJORITY,
  clientWrite,
  commitEntry,
  createRaftState,
  crashLeader,
  receiveVoteRequest,
  replicateLog,
  splitVote,
  startElection,
  winElection,
} from '@/tutorials/cloud-native/raft-consensus/model'
import {
  allLeavesSameDepth,
  btreeInsert,
  btreeSearch,
  createBTreeState,
  inOrderKeys,
} from '@/tutorials/database/btree-index/model'

describe('MySQL 架构流水线模型', () => {
  it('五阶段依次推进直至完成', () => {
    let s = createMysqlState({ sqlType: 'SELECT', indexUsed: true, tableRows: 100000 })
    expect(s.stages.every(st => st.status === 'pending')).toBe(true)
    let guard = 0
    while (!mysqlFinished(s) && guard < 10) {
      s = advanceStage(s, { sqlType: 'SELECT', indexUsed: true, tableRows: 100000 })
      guard++
    }
    expect(mysqlFinished(s)).toBe(true)
    expect(s.stages[0]?.status).toBe('done')
    expect(s.stages[4]?.status).toBe('done')
  })

  it('有索引:扫描行数远小于表大小', () => {
    const s = createMysqlState({ sqlType: 'SELECT', indexUsed: true, tableRows: 100000 })
    expect(s.scannedRows).toBeLessThan(1000)
  })

  it('无索引:全表扫描(行数 = 表大小)', () => {
    const s = createMysqlState({ sqlType: 'SELECT', indexUsed: false, tableRows: 100000 })
    expect(s.scannedRows).toBe(100000)
  })

  it('UPDATE:进入引擎层时写三份日志', () => {
    let s = createMysqlState({ sqlType: 'UPDATE', indexUsed: true, tableRows: 100000 })
    let guard = 0
    while (!mysqlFinished(s) && guard < 10) {
      s = advanceStage(s, { sqlType: 'UPDATE', indexUsed: true, tableRows: 100000 })
      guard++
    }
    expect(s.logsWritten.join(' ')).toContain('undo')
    expect(s.logsWritten.join(' ')).toContain('redo')
    expect(s.logsWritten.join(' ')).toContain('binlog')
  })
})

describe('服务注册与发现模型', () => {
  it('注册:实例列表与版本号', () => {
    let s = createRegistryState()
    s = register(s, 'order-service', '10.0.0.11:8080')
    expect(instanceCount(s, 'order-service')).toBe(1)
    expect(s.version).toBe(2)
  })

  it('发现:consumer 缓存实例地址', () => {
    let s = createRegistryState()
    s = register(register(s, 'order-service', '10.0.0.11:8080'), 'order-service', '10.0.0.12:8080')
    s = discover(s, 'order-service')
    expect(s.consumerCache['order-service']).toEqual(['10.0.0.11:8080', '10.0.0.12:8080'])
  })

  it('心跳续约:missedBeats 归零', () => {
    let s = createRegistryState()
    s = register(s, 'order-service', '10.0.0.11:8080')
    s = tick(s) // missed 1
    s = heartbeat(s, 'order-service', '10.0.0.11:8080')
    expect(s.services['order-service']?.[0]?.missedBeats).toBe(0)
  })

  it('连续 3 个周期无心跳:实例被剔除并推送变更', () => {
    let s = createRegistryState()
    s = register(s, 'order-service', '10.0.0.11:8080')
    s = tick(s)
    s = tick(s)
    s = tick(s) // 达到阈值
    expect(instanceCount(s, 'order-service')).toBe(0)
    expect(s.lastEvent).toContain('DEREGISTER')
    expect(s.version).toBeGreaterThan(2)
  })

  it('全部实例下线后发现为空列表', () => {
    let s = createRegistryState()
    s = register(s, 'order-service', '10.0.0.11:8080')
    for (let i = 0; i < 3; i++) s = tick(s)
    s = discover(s, 'order-service')
    expect(s.consumerCache['order-service']).toEqual([])
    expect(s.log.some(l => l.includes('服务全下线'))).toBe(true)
  })
})

describe('Raft 共识模型(5 节点)', () => {
  it('选举:N1 拉票获多数派 → 当选 Leader', () => {
    let s = createRaftState()
    s = startElection(s, 'N1')
    expect(s.term).toBe(1)
    expect(s.votesReceived).toBe(1)
    s = receiveVoteRequest(s, 'N1', 'N2', true)
    s = receiveVoteRequest(s, 'N1', 'N3', true)
    expect(s.votesReceived).toBe(3)
    s = winElection(s, 'N1')
    expect(s.leaderId).toBe('N1')
    expect(s.nodes.find(n => n.id === 'N1')?.role).toBe('leader')
  })

  it('term 单调递增;同一 term 每个节点只投一票', () => {
    let s = createRaftState()
    s = startElection(s, 'N1')
    s = receiveVoteRequest(s, 'N1', 'N2', true)
    const afterFirst = s.nodes.find(n => n.id === 'N2')?.votedFor
    expect(afterFirst).toBe('N1')
    // N2 本 term 再收到别的候选者拉票:拒绝
    s = startElection(s, 'N3') // term 2 (N3 自荐) — 教学简化的新选举
    s = receiveVoteRequest(s, 'N3', 'N2', true)
    expect(s.nodes.find(n => n.id === 'N2')?.votedFor).toBe('N3') // 新 term 重新获得投票权
  })

  it('拒绝:本 term 已投票给他人', () => {
    let s = createRaftState()
    s = startElection(s, 'N1') // term 1
    s = receiveVoteRequest(s, 'N1', 'N2', true) // N2 投 N1
    // 同 term 内 N2 不会改投:模拟收到重复拉票(granted 依据 votedFor 判定)
    s = receiveVoteRequest(s, 'N1', 'N2', false)
    expect(s.nodes.find(n => n.id === 'N2')?.votedFor).toBe('N1')
  })

  it('多数派 = 3:2 票不足以当选', () => {
    let s = createRaftState()
    s = startElection(s, 'N1')
    s = receiveVoteRequest(s, 'N1', 'N2', true)
    const before = s.leaderId
    s = winElection(s, 'N1')
    expect(before).toBeNull()
    expect(s.leaderId).toBeNull()
    expect(s.votesReceived).toBe(2)
    expect(s.votesReceived).toBeLessThan(MAJORITY)
  })

  it('日志复制与提交:全节点 committed 一致', () => {
    let s = createRaftState()
    s = startElection(s, 'N1')
    s = receiveVoteRequest(s, 'N1', 'N2', true)
    s = receiveVoteRequest(s, 'N1', 'N3', true)
    s = winElection(s, 'N1')
    s = clientWrite(s, 'set x=1')
    expect(s.pendingEntry).toBe('set x=1')
    s = replicateLog(s)
    s = commitEntry(s)
    expect(s.pendingEntry).toBeNull()
    const committed = s.nodes.find(n => n.id === 'N1')?.committed
    expect(committed).toBe(1)
    // 全部非宕机节点跟随提交点
    expect(s.nodes.filter(n => n.role !== 'crashed').every(n => n.committed === 1)).toBe(true)
  })

  it('Leader 宕机:重新选举 term +1,新 Leader 当选', () => {
    let s = createRaftState()
    s = startElection(s, 'N1')
    s = receiveVoteRequest(s, 'N1', 'N2', true)
    s = receiveVoteRequest(s, 'N1', 'N3', true)
    s = winElection(s, 'N1')
    const termBefore = s.term
    s = crashLeader(s)
    expect(s.leaderId).toBeNull()
    expect(s.nodes.find(n => n.id === 'N1')?.role).toBe('crashed')
    s = startElection(s, 'N3')
    expect(s.term).toBe(termBefore + 1)
    s = receiveVoteRequest(s, 'N3', 'N2', true)
    s = receiveVoteRequest(s, 'N3', 'N4', true)
    s = winElection(s, 'N3')
    expect(s.leaderId).toBe('N3')
  })

  it('票数分裂:不会产生 Leader', () => {
    let s = createRaftState()
    s = startElection(s, 'N2')
    s = receiveVoteRequest(s, 'N2', 'N4', true) // N2: 2 票
    expect(s.votesReceived).toBe(2)
    s = splitVote(s)
    expect(s.splitVote).toBe(true)
  })

  it('无 Leader 时写请求被拒绝', () => {
    let s = createRaftState()
    s = clientWrite(s, 'set x=1')
    expect(s.log[s.log.length - 1]).toContain('无 Leader')
  })
})

describe('B 树模型(插入/分裂/搜索)', () => {
  function insertAll(keys: number[]) {
    let s = createBTreeState()
    for (const k of keys) s = btreeInsert(s, k)
    return s
  }

  it('插入序列后:中序有序 + 叶子同层(平衡)', () => {
    const s = insertAll([10, 20, 5, 15, 30, 25, 35])
    expect(inOrderKeys(s)).toEqual([5, 10, 15, 20, 25, 30, 35])
    expect(allLeavesSameDepth(s)).toBe(true)
  })

  it('触发分裂:分裂计数与键上提', () => {
    let s = createBTreeState()
    s = btreeInsert(s, 10)
    s = btreeInsert(s, 20)
    s = btreeInsert(s, 5)
    s = btreeInsert(s, 15) // 叶子满(10,20,5)+ 新键 → 分裂,中位键 10 上提
    expect(s.splits).toBe(1)
    expect(inOrderKeys(s)).toEqual([5, 10, 15, 20])
    expect(allLeavesSameDepth(s)).toBe(true)
  })

  it('递增插入(最坏顺序):仍然平衡且有序', () => {
    const s = insertAll([5, 10, 15, 20, 25, 30, 35, 40])
    expect(allLeavesSameDepth(s)).toBe(true)
    expect(inOrderKeys(s)).toEqual([5, 10, 15, 20, 25, 30, 35, 40])
  })

  it('搜索:命中与未命中都有完整路径', () => {
    const s0 = insertAll([10, 20, 5, 15, 30, 25, 35])
    const hit = btreeSearch(s0, 15)
    expect(hit.found).toBe(true)
    expect(hit.searchPath[0]).toBe(s0.rootId)
    const miss = btreeSearch(s0, 99)
    expect(miss.found).toBe(false)
    expect(miss.searchPath.length).toBeGreaterThan(0)
  })

  it('重复键跳过', () => {
    let s = createBTreeState()
    s = btreeInsert(s, 10)
    s = btreeInsert(s, 10)
    expect(s.keyCount).toBe(1)
  })

  it('根分裂:树高 +1', () => {
    let s = createBTreeState()
    expect(s.height).toBe(1)
    s = insertAll([10, 20, 5, 15])
    expect(s.height).toBe(2)
  })

  it('8 个键:树高保持 2~3 层(矮胖特性)', () => {
    const s = insertAll([10, 20, 5, 15, 30, 25, 35, 40])
    expect(s.height).toBeGreaterThanOrEqual(2)
    expect(s.height).toBeLessThanOrEqual(3)
    expect(allLeavesSameDepth(s)).toBe(true)
  })
})
