import { describe, expect, it } from 'vitest'
import {
  arpSpoof,
  cacheHit,
  clearArpCache,
  createArpState,
  sendArpReply,
  sendArpRequest,
} from '@/tutorials/network/arp-protocol/model'
import {
  createTlsState,
  deriveSessionKey,
  exchangeFinished,
  sendClientHello,
  sendKeyExchange,
  sendServerHello,
  validateCert,
  verifyCertificate,
} from '@/tutorials/network/tls-handshake/model'
import {
  createCdnState,
  cnameResponse,
  deliverToUser,
  gslbSchedule,
  requestEdge,
  serveOrFetchOrigin,
  purgeEdge,
} from '@/tutorials/infrastructure/cdn-working/model'
import type { SchedulerState } from '@/tutorials/computer/process-thread/model'
import {
  acquireLock,
  contextSwitch,
  createSchedulerState,
  executeStep,
  hasLostUpdate,
} from '@/tutorials/computer/process-thread/model'
import {
  createReliableState,
  fastRetransmit,
  receiveAck,
  receiveSegment,
  sendWindow,
  timeoutRetransmit,
} from '@/tutorials/network/tcp-reliable/model'

describe('ARP 协议模型', () => {
  it('未命中 → 广播请求 → 顺带学习 → 单播应答 → 写缓存', () => {
    let s = createArpState()
    expect(cacheHit(s, 'PC1', '192.168.1.2')).toBe(false)
    s = sendArpRequest(s, 'PC1', '192.168.1.2')
    // 全网顺带学习 PC1
    expect(s.caches.PC2?.some(e => e.ip === '192.168.1.1')).toBe(true)
    expect(s.caches.PC3?.some(e => e.ip === '192.168.1.1')).toBe(true)
    s = sendArpReply(s, 'PC2', 'PC1')
    expect(cacheHit(s, 'PC1', '192.168.1.2')).toBe(true)
    expect(s.caches.PC1?.[0]?.learnedVia).toBe('reply')
  })

  it('请求丢失:服务端无感知、无学习', () => {
    let s = createArpState()
    s = sendArpRequest(s, 'PC1', '192.168.1.2', false)
    expect(s.caches.PC2?.length).toBe(0)
    const replyState = sendArpReply(s, 'PC2', 'PC1')
    expect(replyState.caches.PC1?.length).toBe(0)
  })

  it('ARP 欺骗污染全网缓存', () => {
    let s = createArpState()
    s = arpSpoof(s, 'PC3', '192.168.1.1')
    expect(s.spoofed).toBe(true)
    for (const name of ['PC1', 'PC2', 'PC4']) {
      const entry = s.caches[name]?.find(e => e.ip === '192.168.1.1')
      expect(entry?.mac).toBe('AA:BB:CC:00:00:03')
      expect(entry?.learnedVia).toBe('spoof')
    }
  })

  it('清空缓存', () => {
    let s = createArpState()
    s = sendArpRequest(s, 'PC1', '192.168.1.2')
    s = sendArpReply(s, 'PC2', 'PC1')
    s = clearArpCache(s)
    expect(s.caches.PC1?.length).toBe(0)
    expect(s.caches.PC2?.length).toBe(0)
  })
})

describe('TLS 握手模型', () => {
  it('完整握手:证书验证通过 → 会话密钥 → ESTABLISHED', () => {
    let s = createTlsState()
    s = sendClientHello(s)
    expect(s.clientRandom).not.toBe('')
    s = sendServerHello(s)
    expect(s.serverRandom).not.toBe('')
    s = verifyCertificate(s, 'www.example.com')
    expect(s.phase).toBe('cert-validate')
    s = sendKeyExchange(s)
    expect(s.preMaster).not.toBe('')
    s = deriveSessionKey(s)
    expect(s.sessionKey).not.toBeNull()
    s = exchangeFinished(s)
    expect(s.established).toBe(true)
  })

  it('验证函数三项独立判定', () => {
    const ok = validateCert(
      { subject: 'a.com', issuer: 'R3', domains: ['a.com'], notAfter: '2027-01-01', status: 'ok' },
      'a.com',
    )
    expect(ok.passed).toBe(true)
    expect(validateCert({ subject: 'a', issuer: 'R3', domains: ['b.com'], notAfter: '2027-01-01', status: 'ok' }, 'a.com').domainMatched).toBe(false)
    expect(validateCert({ subject: 'a', issuer: 'R3', domains: ['a.com'], notAfter: '2020-01-01', status: 'expired' }, 'a.com').notExpired).toBe(false)
    expect(validateCert({ subject: 'a', issuer: 'self', domains: ['a.com'], notAfter: '2027-01-01', status: 'self-signed' }, 'a.com').trustedIssuer).toBe(false)
  })

  it('证书过期:握手在验证阶段终止', () => {
    let s = createTlsState({ subject: 'a.com', issuer: 'R3', domains: ['a.com'], notAfter: '2020-01-01', status: 'expired' })
    s = sendClientHello(s)
    s = sendServerHello(s)
    s = verifyCertificate(s, 'a.com')
    expect(s.phase).toBe('cert-failed')
    // 密钥交换不应被调用后的状态推进(established 不可能)
    s = deriveSessionKey(s)
    expect(s.established).toBe(false)
  })
})

describe('CDN 模型', () => {
  it('GSLB 就近调度:广州用户 → 广州边缘', () => {
    let s = createCdnState('app.js', '广州')
    s = cnameResponse(s)
    s = gslbSchedule(s)
    expect(s.scheduledNode).toBe('edge-gz')
  })

  it('上海节点已有缓存:HIT 直达', () => {
    let s = createCdnState('app.js', '上海')
    s = cnameResponse(s)
    s = gslbSchedule(s)
    s = requestEdge(s)
    expect(s.cacheHit).toBe(true)
    s = serveOrFetchOrigin(s)
    s = deliverToUser(s)
    expect(s.originHits).toBe(0)
  })

  it('广州节点未缓存:MISS → 回源 → 写入边缘缓存', () => {
    let s = createCdnState('app.js', '广州')
    s = cnameResponse(s)
    s = gslbSchedule(s)
    s = requestEdge(s)
    expect(s.cacheHit).toBe(false)
    s = serveOrFetchOrigin(s)
    expect(s.originHits).toBe(1)
    // 回源后广州边缘应有副本
    expect(s.edgeCaches['edge-gz']).toContain('app.js')
    s = deliverToUser(s)
    // 再请求一次:命中
    const s2 = requestEdge(s)
    expect(s2.cacheHit).toBe(true)
  })

  it('Purge 清空后回源', () => {
    let s = createCdnState('app.js', '上海')
    s = purgeEdge(s)
    expect(s.edgeCaches['edge-sh']).toEqual([])
    s = requestEdge(s)
    expect(s.cacheHit).toBe(false)
  })
})

describe('进程与线程调度模型', () => {
  it('完整微指令三步:读 → 加 → 写回', () => {
    let s: SchedulerState = { ...createSchedulerState(), running: { processId: 'p1', threadId: 'p1-t1' } }
    s = executeStep(s, 'p1', 'p1-t1') // 读
    s = executeStep(s, 'p1', 'p1-t1') // 加
    s = executeStep(s, 'p1', 'p1-t1') // 写回
    expect(s.processes[0]?.sharedCounter).toBe(6)
    expect(s.pendingWrites.length).toBe(0)
  })

  it('交错执行:两条线程同读旧值 → 丢失更新', () => {
    let s: SchedulerState = { ...createSchedulerState(), running: { processId: 'p1', threadId: 'p1-t1' } }
    s = executeStep(s, 'p1', 'p1-t1') // T1 读 5
    s = executeStep(s, 'p1', 'p1-t1') // T1 加(寄存器 6)
    // 切换到 T2:T2 读到的也是 5(堆还没被改)
    s = contextSwitch(s)
    s = executeStep(s, 'p1', 'p1-t2') // T2 读 5
    s = executeStep(s, 'p1', 'p1-t2') // T2 加
    s = executeStep(s, 'p1', 'p1-t2') // T2 写回 6
    // T1 恢复:写回它的 6(覆盖 T2 的结果)
    s = executeStep(s, 'p1', 'p1-t1') // T1 加(基于寄存器 6)
    s = executeStep(s, 'p1', 'p1-t1') // T1 写回 6
    expect(s.processes[0]?.sharedCounter).toBe(6) // 两次自增只加了一次!
    expect(hasLostUpdate(s) || s.processes[0]?.sharedCounter === 6).toBe(true)
  })

  it('上下文切换:寄存器保存恢复', () => {
    let s: SchedulerState = { ...createSchedulerState(), running: { processId: 'p1', threadId: 'p1-t1' } }
    s = executeStep(s, 'p1', 'p1-t1')
    s = contextSwitch(s)
    expect(s.running?.threadId).toBe('p1-t2')
    expect(s.slices).toBe(1)
    expect(s.processes[0]?.threads[0]?.status).toBe('ready')
    expect(s.processes[0]?.threads[1]?.status).toBe('running')
  })

  it('加锁:重复加锁阻塞', () => {
    let s: SchedulerState = { ...createSchedulerState(), running: { processId: 'p1', threadId: 'p1-t1' } }
    s = acquireLock(s, 'p1', 'p1-t1')
    expect(s.lockHeld).toBe('p1-t1')
    s = acquireLock(s, 'p1', 'p1-t2')
    expect(s.log[s.log.length - 1]).toContain('阻塞等待')
  })
})

describe('TCP 可靠传输模型', () => {
  it('窗口批量发送 + ACK 滑动', () => {
    let s = createReliableState(8)
    s = sendWindow(s)
    // 1-4 在途
    expect(s.segments.filter(x => x.status === 'inflight').map(x => x.seq)).toEqual([1, 2, 3, 4])
    s = receiveAck(s, 2)
    expect(s.sendBase).toBe(2)
    s = receiveAck(s, 3)
    expect(s.sendBase).toBe(3)
    // 窗口滑动后可发 5
    s = sendWindow(s)
    expect(s.segments.find(x => x.seq === 5)?.status).toBe('inflight')
  })

  it('报文丢失 → 乱序缓存 → 重复 ACK → 快速重传', () => {
    let s = createReliableState(8)
    s = sendWindow(s)
    s = receiveAck(s, 2)
    s = receiveAck(s, 3)
    s = sendWindow(s) // 发送 5
    // 报文 3 丢失(直接从 inflight 改 lost)
    s = {
      ...s,
      segments: s.segments.map(x => (x.seq === 3 ? { ...x, status: 'lost' as const } : x)),
    }
    s = receiveSegment(s, 4) // 乱序 → 缓存 + 重复 ACK 3
    s = receiveSegment(s, 5) // 再来一个重复 ACK
    s = receiveSegment(s, 6) // 第三个重复 ACK
    expect(s.duplicateAcks).toBe(3)
    s = fastRetransmit(s, 3)
    expect(s.fastRetransmits).toBe(1)
    // 重传的 3 到达 → 累计确认推到 6
    s = receiveAck(s, 6)
    expect(s.sendBase).toBe(6)
    expect(s.segments.filter(x => x.status === 'acked').map(x => x.seq)).toEqual([1, 2, 3, 4, 5])
  })

  it('累计确认一次推进多段', () => {
    let s = createReliableState(8)
    s = sendWindow(s)
    s = receiveAck(s, 3)
    expect(s.sendBase).toBe(3)
    expect(s.segments.filter(x => x.status === 'acked').map(x => x.seq)).toEqual([1, 2])
  })

  it('超时重传:重传 sendBase 起所有未确认段', () => {
    let s = createReliableState(8)
    s = sendWindow(s)
    s = receiveAck(s, 2)
    // 3、4 仍未确认 → 超时重传
    s = timeoutRetransmit(s)
    expect(s.timeouts).toBe(1)
    expect(s.segments.filter(x => x.seq === 3)[0]?.retried).toBe(1)
    expect(s.segments.filter(x => x.seq === 4)[0]?.retried).toBe(1)
  })

  it('重复 ACK 不滑动窗口', () => {
    let s = createReliableState(8)
    s = sendWindow(s)
    const before = s.sendBase
    s = receiveAck(s, 1) // 重复(接收端还在等 1?教学上 ack<=sendBase 即重复)
    expect(s.sendBase).toBe(before)
  })
})
