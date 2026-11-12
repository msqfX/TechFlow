/**
 * CDN 工作原理模拟模型(纯函数,可测试)。
 * 解析链:CNAME 委托 → GSLB 调度 → 边缘节点;缓存命中/回源。
 * 边缘节点的缓存表保存在状态内(edgeCaches),保证函数纯度。
 */

export type UserRegion = '广州' | '上海' | '北京'

export interface EdgeNode {
  id: string
  region: UserRegion
  ip: string
  /** 与源站的单程参考延迟(ms) */
  rttToOrigin: number
}

export interface CdnPacket {
  id: string
  from: string
  to: string
  label: string
  kind: 'query' | 'response' | 'request' | 'deliver' | 'origin-fetch' | 'origin-return'
}

export interface CdnState {
  file: string
  userRegion: UserRegion
  packets: CdnPacket[]
  /** GSLB 调度结果 */
  scheduledNode: string | null
  /** 边缘缓存命中?null = 未发生 */
  cacheHit: boolean | null
  originFetched: boolean
  originHits: number
  /** 边缘缓存表:节点 id → 已缓存文件 */
  edgeCaches: Record<string, string[]>
  log: string[]
}

export const EDGE_NODES: EdgeNode[] = [
  { id: 'edge-gz', region: '广州', ip: '113.108.11.7', rttToOrigin: 38 },
  { id: 'edge-sh', region: '上海', ip: '101.87.34.20', rttToOrigin: 25 },
  { id: 'edge-bj', region: '北京', ip: '123.196.22.9', rttToOrigin: 8 },
]

export function createCdnState(file = 'app.js', userRegion: UserRegion = '广州'): CdnState {
  return {
    file,
    userRegion,
    packets: [],
    scheduledNode: null,
    cacheHit: null,
    originFetched: false,
    originHits: 0,
    // 初始缓存:上海节点已有 app.js,其余只有 logo.svg(制造命中/未命中对比)
    edgeCaches: {
      'edge-gz': ['logo.svg'],
      'edge-sh': ['logo.svg', 'app.js'],
      'edge-bj': ['logo.svg'],
    },
    log: [`用户(${userRegion})请求 ${file},开始 DNS 解析`],
  }
}

let cdnSeq = 0
function makePkt(from: string, to: string, label: string, kind: CdnPacket['kind']): CdnPacket {
  cdnSeq += 1
  return { id: `cdn-pkt-${cdnSeq}`, from, to, label, kind }
}

/** GSLB 就近调度:返回与用户同区域的边缘节点 */
export function scheduleEdge(region: UserRegion): EdgeNode {
  return EDGE_NODES.find(n => n.region === region) ?? EDGE_NODES[0]!
}

export function cnameResponse(s: CdnState): CdnState {
  return {
    ...s,
    packets: [
      ...s.packets,
      makePkt('localDns', 'authDns', '? static.example.com', 'query'),
      makePkt('authDns', 'localDns', 'CNAME → cdn.example.com.cn', 'response'),
    ],
    log: [...s.log, '源站权威 DNS 返回 CNAME:cdn.example.com.cn(把后续解析委托给 CDN)'],
  }
}

export function gslbSchedule(s: CdnState): CdnState {
  const edge = scheduleEdge(s.userRegion)
  return {
    ...s,
    scheduledNode: edge.id,
    packets: [
      ...s.packets,
      makePkt('localDns', 'gslb', '? cdn.example.com.cn', 'query'),
      makePkt('gslb', 'localDns', `${edge.region} 边缘 ${edge.ip}`, 'response'),
    ],
    log: [...s.log, `GSLB 按「用户位置=${s.userRegion}」调度 → ${edge.region} 边缘节点 ${edge.ip}`],
  }
}

/** 请求边缘节点:判定命中/未命中 */
export function requestEdge(s: CdnState): CdnState {
  const edge = s.scheduledNode ? EDGE_NODES.find(n => n.id === s.scheduledNode)! : scheduleEdge(s.userRegion)
  const hit = (s.edgeCaches[edge.id] ?? []).includes(s.file)
  return {
    ...s,
    cacheHit: hit,
    packets: [...s.packets, makePkt('user', edge.id, `GET /${s.file}`, 'request')],
    log: [...s.log, `用户请求 ${edge.region} 边缘节点 → ${hit ? '缓存命中(X-Cache: HIT)' : '缓存未命中(X-Cache: MISS),需要回源'}`],
  }
}

/** 命中则边缘直接返回;未命中则回源并在边缘缓存 */
export function serveOrFetchOrigin(s: CdnState): CdnState {
  const edge = s.scheduledNode ? EDGE_NODES.find(n => n.id === s.scheduledNode)! : scheduleEdge(s.userRegion)
  if (s.cacheHit) {
    return {
      ...s,
      packets: [...s.packets, makePkt(edge.id, 'user', `200 ${s.file}(HIT)`, 'deliver')],
      log: [...s.log, '边缘直接返回副本 —— 就近命中,延迟最低'],
    }
  }
  return {
    ...s,
    originFetched: true,
    originHits: s.originHits + 1,
    edgeCaches: { ...s.edgeCaches, [edge.id]: [...(s.edgeCaches[edge.id] ?? []), s.file] },
    packets: [
      ...s.packets,
      makePkt(edge.id, 'origin', `GET /${s.file}(回源)`, 'origin-fetch'),
      makePkt('origin', edge.id, `200 ${s.file}`, 'origin-return'),
    ],
    log: [...s.log, `边缘 → 源站回源(链路约 ${edge.rttToOrigin}ms),取回后在边缘缓存 —— 下一位用户即命中`],
  }
}

/** 内容送达用户 */
export function deliverToUser(s: CdnState): CdnState {
  const edge = s.scheduledNode ? EDGE_NODES.find(n => n.id === s.scheduledNode)! : scheduleEdge(s.userRegion)
  return {
    ...s,
    packets: [...s.packets, makePkt(edge.id, 'user', `200 ${s.file}`, 'deliver')],
    log: [...s.log, s.cacheHit === false ? '资源已写入边缘缓存(TTL),后续用户直接命中' : '内容送达'],
  }
}

/** 模拟 CDN 刷新(Purge):清空指定节点的缓存 */
export function purgeEdge(s: CdnState, nodeId?: string): CdnState {
  const edgeCaches = nodeId
    ? { ...s.edgeCaches, [nodeId]: [] }
    : Object.fromEntries(EDGE_NODES.map(n => [n.id, []]))
  return {
    ...s,
    edgeCaches,
    log: [...s.log, nodeId ? '指定边缘节点缓存已刷新(Purge)' : '全部边缘节点缓存已刷新(Purge),下一次请求将回源'],
  }
}

/** 模拟用户切换地区(重新解析) */
export function switchRegion(s: CdnState, region: UserRegion): CdnState {
  return {
    ...s,
    userRegion: region,
    scheduledNode: null,
    cacheHit: null,
    log: [...s.log, `用户位置切换到 ${region} —— 重新解析,GSLB 将调度到就近节点`],
  }
}
