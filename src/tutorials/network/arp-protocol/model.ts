/**
 * ARP 协议模拟模型(纯函数,可测试)。
 * 网段内 4 台设备 + 交换机;演示广播请求、单播应答、双向缓存学习与 ARP 欺骗。
 */

export interface ArpDevice {
  name: string
  ip: string
  mac: string
}

export interface ArpEntry {
  ip: string
  mac: string
  /** 学习来源:reply(应答写入)/ request(收到请求顺带学习)/ spoof(欺骗污染) */
  learnedVia: 'reply' | 'request' | 'spoof'
}

export type ArpPacketKind = 'request' | 'reply' | 'spoof'

export interface ArpPacket {
  id: string
  kind: ArpPacketKind
  sender: string
  /** 应答/欺骗报文的目标设备(泛洪请求无单一目标) */
  target?: string
  /** 询问的 IP */
  queryIp: string
  claimedMac: string
  broadcast: boolean
  lost?: boolean
}

export interface ArpState {
  devices: ArpDevice[]
  /** 每台设备的 ARP 缓存:设备名 → 表项 */
  caches: Record<string, ArpEntry[]>
  packets: ArpPacket[]
  active: string | null
  spoofed: boolean
  log: string[]
}

export const ARP_DEVICES: ArpDevice[] = [
  { name: 'PC1', ip: '192.168.1.1', mac: 'AA:BB:CC:00:00:01' },
  { name: 'PC2', ip: '192.168.1.2', mac: 'AA:BB:CC:00:00:02' },
  { name: 'PC3', ip: '192.168.1.3', mac: 'AA:BB:CC:00:00:03' },
  { name: 'PC4', ip: '192.168.1.4', mac: 'AA:BB:CC:00:00:04' },
]

let arpSeq = 0
function makePacket(p: Omit<ArpPacket, 'id'>): ArpPacket {
  arpSeq += 1
  return { id: `arp-pkt-${arpSeq}`, ...p }
}

export function createArpState(): ArpState {
  return {
    devices: ARP_DEVICES,
    caches: Object.fromEntries(ARP_DEVICES.map(d => [d.name, []])),
    packets: [],
    active: null,
    spoofed: false,
    log: ['所有设备的 ARP 缓存均为空'],
  }
}

function upsertEntry(table: ArpEntry[], entry: ArpEntry): ArpEntry[] {
  const filtered = table.filter(e => e.ip !== entry.ip)
  return [...filtered, entry]
}

/** 设备广播 ARP 请求: Who has queryIp? */
export function sendArpRequest(s: ArpState, sender: string, queryIp: string, delivered = true): ArpState {
  const dev = s.devices.find(d => d.name === sender)!
  const pkt = makePacket({
    kind: 'request',
    sender,
    queryIp,
    claimedMac: dev.mac,
    broadcast: true,
    lost: !delivered,
  })
  const others = s.devices.filter(d => d.name !== sender).map(d => d.name)
  return {
    ...s,
    packets: [...s.packets, pkt],
    active: sender,
    // 收到请求的所有设备顺带学习发送方(除发送方自己)
    caches: Object.fromEntries(
      s.devices.map(d => [
        d.name,
        d.name === sender || !delivered
          ? s.caches[d.name]!
          : upsertEntry(s.caches[d.name]!, { ip: dev.ip, mac: dev.mac, learnedVia: 'request' }),
      ]),
    ),
    log: [...s.log, delivered ? `${sender} 广播 ARP 请求:Who has ${queryIp}?(泛洪到 ${others.join(', ')})` : `${sender} 的 ARP 请求在链路上丢失`],
  }
}

/** 目标设备单播 ARP 应答: queryIp is-at mac;请求方写入缓存 */
export function sendArpReply(s: ArpState, target: string, requester: string): ArpState {
  const last = s.packets[s.packets.length - 1]
  if (!last || last.kind !== 'request' || last.lost) return s
  const dev = s.devices.find(d => d.name === target)!
  const pkt = makePacket({
    kind: 'reply',
    sender: target,
    target: requester,
    queryIp: dev.ip,
    claimedMac: dev.mac,
    broadcast: false,
  })
  const requesterEntry: ArpEntry = { ip: dev.ip, mac: dev.mac, learnedVia: 'reply' }
  const targetEntry: ArpEntry = { ip: s.devices.find(d => d.name === requester)!.ip, mac: s.devices.find(d => d.name === requester)!.mac, learnedVia: 'request' }
  return {
    ...s,
    packets: [...s.packets, pkt],
    active: target,
    caches: {
      ...s.caches,
      [requester]: upsertEntry(s.caches[requester]!, requesterEntry),
      [target]: upsertEntry(s.caches[target]!, targetEntry),
    },
    log: [...s.log, `${target} 单播应答:${dev.ip} is-at ${dev.mac};${requester} 写入缓存`],
  }
}

/** 缓存命中判断:请求方已知目标 MAC,直接发送(仍发一个普通帧,不发 ARP) */
export function cacheHit(s: ArpState, requester: string, queryIp: string): boolean {
  return s.caches[requester]!.some(e => e.ip === queryIp)
}

/** ARP 欺骗:spoofDevice 持续宣称 victimIp 的 MAC 是自己的 */
export function arpSpoof(s: ArpState, spoofDevice: string, victimIp: string): ArpState {
  const spoofer = s.devices.find(d => d.name === spoofDevice)!
  const pkt = makePacket({
    kind: 'spoof',
    sender: spoofDevice,
    queryIp: victimIp,
    claimedMac: spoofer.mac,
    broadcast: false,
  })
  const victims = s.devices.filter(d => d.name !== spoofDevice).map(d => d.name)
  const caches = Object.fromEntries(
    victims.map(name => [
      name,
      upsertEntry(s.caches[name]!, { ip: victimIp, mac: spoofer.mac, learnedVia: 'spoof' }),
    ]),
  )
  return {
    ...s,
    spoofed: true,
    packets: [...s.packets, pkt],
    caches: { ...s.caches, ...caches },
    log: [...s.log, `${spoofDevice} 伪造应答:「${victimIp} is-at ${spoofer.mac}」—— 全网缓存被污染,流量将经过它`],
  }
}

/** 清空某台设备(或全部)的 ARP 缓存 */
export function clearArpCache(s: ArpState, device?: string): ArpState {
  const caches = device
    ? { ...s.caches, [device]: [] }
    : Object.fromEntries(s.devices.map(d => [d.name, []]))
  return {
    ...s,
    caches,
    log: [...s.log, device ? `${device} 的 ARP 缓存已清空` : '所有设备的 ARP 缓存已清空(模拟老化/重启)'],
  }
}
