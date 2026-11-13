import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LEAF,
  checkChain,
  checkHostname,
  checkRevocation,
  checkTime,
  conclude,
  createCertState,
  verifyLevel,
  wildcardMatches,
} from '@/tutorials/network/tls-cert-verification/model'
import {
  compareWithTcp,
  createUdpState,
  deliverUdp,
  sendDatagrams,
} from '@/tutorials/network/udp-protocol/model'

describe('通配符匹配(证书 SAN)', () => {
  it('精确匹配', () => {
    expect(wildcardMatches('www.example.com', 'www.example.com')).toBe(true)
    expect(wildcardMatches('www.example.com', 'api.example.com')).toBe(false)
  })

  it('通配符只匹配一级子域', () => {
    expect(wildcardMatches('*.example.com', 'api.example.com')).toBe(true)
    expect(wildcardMatches('*.example.com', 'a.b.example.com')).toBe(false)
    expect(wildcardMatches('*.example.com', 'example.com')).toBe(false)
  })

  it('通配符不在最左段时不生效', () => {
    expect(wildcardMatches('www.*.example.com', 'www.a.example.com')).toBe(false)
  })
})

describe('证书验证流程', () => {
  const valid = () => createCertState('www.example.com', { ...DEFAULT_LEAF })

  it('逐级验签必须先验上级', () => {
    let s = valid()
    s = verifyLevel(s, 'leaf')
    // 未验根/中间就验叶子:被拒并提示
    expect(s.verifiedLevels.length).toBe(0)
    s = verifyLevel(s, 'root')
    s = verifyLevel(s, 'intermediate')
    s = verifyLevel(s, 'leaf')
    expect(s.verifiedLevels).toEqual(['root', 'intermediate', 'leaf'])
  })

  it('有效证书:四项检查全过 → 绿锁', () => {
    let s = valid()
    s = verifyLevel(verifyLevel(verifyLevel(s, 'root'), 'intermediate'), 'leaf')
    s = checkChain(s)
    s = checkHostname(s)
    s = checkTime(s)
    s = checkRevocation(s)
    s = conclude(s)
    expect(s.passed).toBe(true)
    expect(s.issues.length).toBe(0)
  })

  it('域名不匹配:仅 hostname 失败', () => {
    let s = createCertState('api.example.com', { ...DEFAULT_LEAF }) // SAN 无 api
    s = verifyLevel(verifyLevel(verifyLevel(s, 'root'), 'intermediate'), 'leaf')
    s = checkChain(s)
    s = checkHostname(s)
    s = checkTime(s)
    s = checkRevocation(s)
    s = conclude(s)
    expect(s.passed).toBe(false)
    expect(s.checks.hostname).toBe(false)
    expect(s.checks.chain).toBe(true)
    expect(s.issues.some(i => i.includes('域名不匹配'))).toBe(true)
  })

  it('证书过期:仅 time 失败', () => {
    let s = createCertState('www.example.com', { ...DEFAULT_LEAF, notAfter: '2020-01-01' })
    s = verifyLevel(verifyLevel(verifyLevel(s, 'root'), 'intermediate'), 'leaf')
    s = checkChain(s)
    s = checkHostname(s)
    s = checkTime(s)
    s = conclude(s)
    expect(s.checks.time).toBe(false)
    expect(s.issues.some(i => i.includes('有效期异常'))).toBe(true)
  })

  it('吊销:OCSP revoked → revocation 失败', () => {
    let s = createCertState('www.example.com', { ...DEFAULT_LEAF, revoked: true })
    s = verifyLevel(verifyLevel(verifyLevel(s, 'root'), 'intermediate'), 'leaf')
    s = checkChain(s)
    s = checkHostname(s)
    s = checkTime(s)
    s = checkRevocation(s, 'revoked')
    s = conclude(s)
    expect(s.checks.revocation).toBe(false)
    expect(s.issues.some(i => i.includes('吊销'))).toBe(true)
  })

  it('自签名:链检查失败', () => {
    let s = createCertState('internal.corp', {
      ...DEFAULT_LEAF,
      subject: 'internal.corp',
      signatureValid: false,
    })
    s = verifyLevel(verifyLevel(verifyLevel(s, 'root'), 'intermediate'), 'leaf')
    s = checkChain(s)
    s = conclude(s)
    expect(s.checks.chain).toBe(false)
    expect(s.issues.some(i => i.includes('证书链不可信'))).toBe(true)
  })

  it('检查未完成时不能给结论', () => {
    let s = valid()
    s = verifyLevel(verifyLevel(verifyLevel(s, 'root'), 'intermediate'), 'leaf')
    s = checkChain(s)
    s = conclude(s)
    expect(s.concluded).toBe(false)
  })
})

describe('UDP 数据报模型', () => {
  it('发送与交付:丢失段原样统计', () => {
    let s = createUdpState(10, 30)
    s = sendDatagrams(s, [2, 5, 8])
    expect(s.datagrams.length).toBe(10)
    s = deliverUdp(s)
    expect(s.receivedSeqs).toEqual([1, 3, 4, 6, 7, 9, 10])
    expect(s.lostSeqs).toEqual([2, 5, 8])
    expect(s.appHandled).toBe(7)
  })

  it('零丢包:全部到达', () => {
    let s = createUdpState(5, 0)
    s = sendDatagrams(s, [])
    s = deliverUdp(s)
    expect(s.receivedSeqs.length).toBe(5)
    expect(s.lostSeqs.length).toBe(0)
  })

  it('TCP 对比估算:握手 1 RTT + 每丢段 1 RTT', () => {
    let s = createUdpState(10, 30)
    s = sendDatagrams(s, [2, 5, 8])
    s = deliverUdp(s)
    const cmp = compareWithTcp(s, 40)
    expect(cmp.tcpHandshakeRtts).toBe(1)
    expect(cmp.tcpSegmentsRetransmitted).toBe(3)
    expect(cmp.tcpTotalMs).toBe(160) // (1+3)*40
    expect(cmp.udpTotalMs).toBe(0)
    expect(cmp.udpOverheadBytes).toBe(8 * 10)
    expect(cmp.tcpOverheadBytes).toBe(20 * 10)
  })
})
