import { describe, expect, it } from 'vitest'
import {
  broadcastAddress,
  ipToBits,
  ipToString,
  isPrivate,
  maskToPrefix,
  networkAddress,
  parseIPv4,
  prefixToMask,
  sameSubnet,
  usableRange,
} from '@/tutorials/network/ip-address/model'
import {
  createHandshakeState,
  isEstablished,
  receiveAckEstablished,
  receiveSynAckSendAck,
  receiveSynSendSynAck,
  retransmitSyn,
  sendSyn,
} from '@/tutorials/network/tcp-handshake/model'
import {
  buildFrame,
  forwardTargets,
  learnOnReceive,
} from '@/tutorials/network/switch-working/scene'
import type { SwitchSceneState } from '@/tutorials/network/switch-working/scene'
import { callMethod, createJvmState, dropRef, minorGc, newObject, returnFromMethod } from '@/tutorials/runtime/jvm-memory-model/model'


describe('IP 地址计算', () => {
  it('解析与合法性校验', () => {
    expect(parseIPv4('192.168.1.100')).toMatchObject({ ok: true })
    expect(parseIPv4('256.1.1.1').ok).toBe(false)
    expect(parseIPv4('1.2.3').ok).toBe(false)
    expect(parseIPv4('a.b.c.d').ok).toBe(false)
    expect(parseIPv4('-1.2.3.4').ok).toBe(false)
  })

  it('二进制与掩码换算', () => {
    const ip = parseIPv4('192.168.1.100')
    expect(ip.ok && ipToBits(ip.value)).toBe('11000000101010000000000101100100')
    expect(ipToString(prefixToMask(24))).toBe('255.255.255.0')
    expect(maskToPrefix(parseIPv4('255.255.255.0').ok ? (parseIPv4('255.255.255.0') as { ok: true; value: never }).value : { octets: [255, 255, 255, 0] })).toBe(24)
  })

  it('网络地址与广播地址', () => {
    const ip = parseIPv4('192.168.1.100')
    if (!ip.ok) throw new Error('unreachable')
    expect(ipToString(networkAddress(ip.value, 24))).toBe('192.168.1.0')
    expect(ipToString(broadcastAddress(ip.value, 24))).toBe('192.168.1.255')
  })

  it('可用范围:/24 有 254 个', () => {
    const ip = parseIPv4('192.168.1.100')
    if (!ip.ok) throw new Error('unreachable')
    const r = usableRange(ip.value, 24)
    expect(r.first).toBe('192.168.1.1')
    expect(r.last).toBe('192.168.1.254')
    expect(r.count).toBe(254)
  })

  it('/31 特殊规则(RFC 3021):不减 2', () => {
    const ip = parseIPv4('10.0.0.0')
    if (!ip.ok) throw new Error('unreachable')
    const r = usableRange(ip.value, 31)
    expect(r.count).toBe(2)
    expect(r.note).toContain('RFC 3021')
  })

  it('/32 单主机', () => {
    const ip = parseIPv4('10.0.0.5')
    if (!ip.ok) throw new Error('unreachable')
    expect(usableRange(ip.value, 32).count).toBe(1)
  })

  it('同网段判断', () => {
    const a = parseIPv4('192.168.1.20')
    const b = parseIPv4('192.168.1.200')
    const c = parseIPv4('192.168.2.20')
    if (!a.ok || !b.ok || !c.ok) throw new Error('unreachable')
    expect(sameSubnet(a.value, b.value, 24)).toBe(true)
    expect(sameSubnet(a.value, c.value, 24)).toBe(false)
    // /25 掩码下 .20 与 .200 分属不同子网
    expect(sameSubnet(a.value, b.value, 25)).toBe(false)
  })

  it('私有地址判定', () => {
    const a = parseIPv4('10.1.2.3')
    const b = parseIPv4('172.32.0.1')
    const c = parseIPv4('192.168.1.1')
    if (!a.ok || !b.ok || !c.ok) throw new Error('unreachable')
    expect(isPrivate(a.value)).toBe(true)
    expect(isPrivate(b.value)).toBe(false)
    expect(isPrivate(c.value)).toBe(true)
  })
})

describe('TCP 三次握手状态机', () => {
  it('完整握手:双方 ESTABLISHED', () => {
    let s = createHandshakeState(100, 500)
    expect(s.client).toBe('CLOSED')
    expect(s.server).toBe('LISTEN')
    s = sendSyn(s)
    expect(s.client).toBe('SYN_SENT')
    s = receiveSynSendSynAck(s)
    expect(s.server).toBe('SYN_RCVD')
    expect(s.halfOpen).toBe(1)
    s = receiveSynAckSendAck(s)
    expect(s.client).toBe('ESTABLISHED')
    s = receiveAckEstablished(s)
    expect(s.server).toBe('ESTABLISHED')
    expect(s.halfOpen).toBe(0)
    expect(isEstablished(s)).toBe(true)
  })

  it('SYN+ACK 的确认号 = 客户端 ISN + 1', () => {
    let s = createHandshakeState(100, 500)
    s = sendSyn(s)
    s = receiveSynSendSynAck(s)
    const synAck = s.msgs.find(m => m.kind === 'SYN-ACK')
    expect(synAck?.ack).toBe(101)
    s = receiveSynAckSendAck(s)
    const ack = s.msgs.find(m => m.kind === 'ACK')
    expect(ack?.ack).toBe(501)
  })

  it('SYN 丢失:服务端无感知,重传后恢复', () => {
    let s = createHandshakeState(100, 500)
    s = sendSyn(s, false)
    s = receiveSynSendSynAck(s)
    expect(s.server).toBe('LISTEN')
    expect(s.halfOpen).toBe(0)
    s = retransmitSyn(s)
    s = receiveSynSendSynAck(s)
    expect(s.server).toBe('SYN_RCVD')
    expect(s.retries).toBe(1)
  })
})

describe('交换机 MAC 学习与转发', () => {
  function initial(): SwitchSceneState {
    return {
      devices: [
        { name: 'PC1', mac: 'AA:BB:CC:00:00:01' },
        { name: 'PC2', mac: 'AA:BB:CC:00:00:02' },
        { name: 'PC3', mac: 'AA:BB:CC:00:00:03' },
        { name: 'PC4', mac: 'AA:BB:CC:00:00:04' },
      ],
      macTable: [] as Array<{ mac: string; device: string }>,
      frames: [],
      active: null,
      log: [],
    }
  }

  it('学习源 MAC;未知单播泛洪到除入口外全部端口', () => {
    let s = initial()
    const f1 = buildFrame(s, 'PC1', 'AA:BB:CC:00:00:02')
    expect(f1.type).toBe('unknown-unicast')
    s = { ...s, frames: [f1], macTable: learnOnReceive(s, f1) }
    expect(s.macTable).toEqual([{ mac: 'AA:BB:CC:00:00:01', device: 'PC1' }])
    // 表里没有目的 MAC → 泛洪
    expect(forwardTargets(s, f1)).toEqual(['PC2', 'PC3', 'PC4'])
  })

  it('学全之后:精准单播转发', () => {
    let s = initial()
    const f1 = buildFrame(s, 'PC1', 'AA:BB:CC:00:00:02')
    s = { ...s, macTable: learnOnReceive(s, f1) }
    const f2 = buildFrame(s, 'PC2', 'AA:BB:CC:00:00:01')
    s = { ...s, macTable: learnOnReceive(s, f2) }
    expect(s.macTable.length).toBe(2)
    const f3 = buildFrame(s, 'PC1', 'AA:BB:CC:00:00:02')
    expect(f3.type).toBe('known-unicast')
    expect(forwardTargets(s, f3)).toEqual(['PC2'])
  })

  it('广播帧永远泛洪(区别于未知单播)', () => {
    let s = initial()
    const f = buildFrame(s, 'PC3', 'FF:FF:FF:FF:FF:FF')
    expect(f.type).toBe('broadcast')
    expect(forwardTargets(s, f)).toEqual(['PC1', 'PC2', 'PC4'])
    // 即便表已学全,广播仍然泛洪
    s = { ...s, macTable: s.devices.map(d => ({ mac: d.mac, device: d.name })) }
    expect(forwardTargets(s, f)).toEqual(['PC1', 'PC2', 'PC4'])
  })
})

describe('JVM 内存教学模型(GC)', () => {
  it('对象分配与引用链', () => {
    let s = createJvmState(32)
    s = callMethod(s, 'main()')
    s = newObject(s, 'User', 2, 's')
    s = callMethod(s, 'createOrder()')
    s = newObject(s, 'Order', 4, 'o')
    expect(s.heap.length).toBe(2)
    expect(s.frames.length).toBe(2)
    s = returnFromMethod(s)
    expect(s.frames.length).toBe(1)
    // Order 不再被任何 Root 引用
    const roots = s.frames.flatMap(f => f.locals.map(l => l.objId)).filter(Boolean)
    expect(roots).toEqual(['User#1'])
  })

  it('Minor GC:清理不可达,幸存者进 Survivor 并晋升', () => {
    let s = createJvmState(32)
    s = callMethod(s, 'main()')
    s = newObject(s, 'User', 2, 's')
    s = newObject(s, 'byte[]', 8, null) // 无引用
    s = minorGc(s)
    expect(s.gcCount).toBe(1)
    expect(s.collectedKB).toBe(8)
    const user = s.heap.find(o => o.kind === 'User')
    expect(user?.gen).toBe('survivor')
    expect(user?.age).toBe(1)
    expect(s.heap.find(o => o.kind === 'byte[]')).toBeUndefined()
  })

  it('年龄 ≥3 晋升老年代', () => {
    let s = createJvmState(64)
    s = callMethod(s, 'main()')
    s = newObject(s, 'Cache', 2, 's')
    s = minorGc(s) // age 1
    s = minorGc(s) // age 2
    s = minorGc(s) // age 3 → old
    const cache = s.heap.find(o => o.kind === 'Cache')
    expect(cache?.gen).toBe('old')
    expect(s.promoted).toBe(1)
  })

  it('dropRef 后对象可被回收', () => {
    let s = createJvmState(32)
    s = callMethod(s, 'main()')
    s = newObject(s, 'User', 2, 's')
    s = dropRef(s, 's')
    s = minorGc(s)
    expect(s.heap.length).toBe(0)
    expect(s.collectedKB).toBe(2)
  })
})
