/**
 * IPv4 地址模拟模型(纯函数,可测试)。
 * 支持 /31(RFC 3021 点对点)与 /32(主机路由)的特殊规则。
 */

export interface IPv4 {
  octets: [number, number, number, number]
}

export type ParseResult =
  | { ok: true; value: IPv4 }
  | { ok: false; error: string }

export function parseIPv4(input: string): ParseResult {
  const parts = input.trim().split('.')
  if (parts.length !== 4) {
    return { ok: false, error: '需要 4 段,用点分隔(如 192.168.1.100)' }
  }
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return { ok: false, error: `「${part}」不是合法的十进制数字` }
    }
    const n = Number(part)
    if (n > 255) {
      return { ok: false, error: `「${part}」超出 0~255 范围` }
    }
    octets.push(n)
  }
  return { ok: true, value: { octets: octets as IPv4['octets'] } }
}

export function ipToString(ip: IPv4): string {
  return ip.octets.join('.')
}

/** 展开为 32 位二进制字符串(不带分隔) */
export function ipToBits(ip: IPv4): string {
  return ip.octets.map(o => o.toString(2).padStart(8, '0')).join('')
}

/** CIDR 前缀 → 点分十进制掩码 */
export function prefixToMask(prefix: number): IPv4 {
  const bits = '1'.repeat(prefix).padEnd(32, '0')
  return bitsToIp(bits)
}

/** 点分十进制掩码 → CIDR 前缀(要求连续 1) */
export function maskToPrefix(mask: IPv4): number {
  const bits = ipToBits(mask)
  const firstZero = bits.indexOf('0')
  const prefix = firstZero === -1 ? 32 : firstZero
  if (bits.slice(prefix).includes('1')) {
    throw new Error('子网掩码必须是连续的 1 和 0')
  }
  return prefix
}

function bitsToIp(bits: string): IPv4 {
  const octets: number[] = []
  for (let i = 0; i < 4; i++) {
    octets.push(parseInt(bits.slice(i * 8, i * 8 + 8), 2))
  }
  return { octets: octets as IPv4['octets'] }
}

/** 网络地址:主机位全部置 0 */
export function networkAddress(ip: IPv4, prefix: number): IPv4 {
  const bits = ipToBits(ip)
  return bitsToIp(bits.slice(0, prefix).padEnd(32, '0'))
}

/** 广播地址:主机位全部置 1 */
export function broadcastAddress(ip: IPv4, prefix: number): IPv4 {
  const bits = ipToBits(ip)
  return bitsToIp(bits.slice(0, prefix) + '1'.repeat(32 - prefix))
}

export interface UsableRange {
  first: string
  last: string
  /** 可用主机数量 */
  count: number
  /** /31、/32 的特殊说明 */
  note?: string
}

/** 可用主机范围;正确处理 /31(RFC 3021)与 /32 */
export function usableRange(ip: IPv4, prefix: number): UsableRange {
  if (prefix >= 31) {
    if (prefix === 31) {
      const net = networkAddress(ip, prefix)
      const first = ipToString(net)
      const last = ipToString(broadcastAddress(ip, prefix))
      return {
        first,
        last,
        count: 2,
        note: '/31 点对点链路(RFC 3021):两个地址都可用,不减 2',
      }
    }
    return {
      first: ipToString(ip),
      last: ipToString(ip),
      count: 1,
      note: '/32 单个主机地址,用于回环或精确主机路由',
    }
  }
  const net = networkAddress(ip, prefix)
  const bc = broadcastAddress(ip, prefix)
  const first = net.octets.slice(0, 3).concat(net.octets[3]! + 1)
  const last = bc.octets.slice(0, 3).concat(bc.octets[3]! - 1)
  return {
    first: ipToString({ octets: first as IPv4['octets'] }),
    last: ipToString({ octets: last as IPv4['octets'] }),
    count: 2 ** (32 - prefix) - 2,
  }
}

export function hostBits(prefix: number): number {
  return 32 - prefix
}

/** 判断是否 RFC 1918 私有地址 */
export function isPrivate(ip: IPv4): boolean {
  const [a, b] = ip.octets
  if (a === 10) return true
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/** 判断两个 IP(同掩码)是否同网段 */
export function sameSubnet(a: IPv4, b: IPv4, prefix: number): boolean {
  const na = ipToBits(networkAddress(a, prefix))
  const nb = ipToBits(networkAddress(b, prefix))
  return na === nb
}
