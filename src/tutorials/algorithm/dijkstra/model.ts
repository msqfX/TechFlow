/**
 * Dijkstra 模型(优先队列取最小 + 松弛;纯函数,可测试)。
 * dijkstraStep 推进一个微操作:取最近未定节点 → 松弛其全部邻居。
 */

export interface DijkstraNode {
  id: string
  label: string
  x: number
  y: number
}

export interface DijkstraEdge {
  from: string
  to: string
  weight: number
}

export interface DijkstraState {
  nodes: DijkstraNode[]
  edges: DijkstraEdge[]
  start: string
  /** dist 表(节点 id → 当前距离;Infinity 用 -1 表示?)用大数表示 */
  dist: Record<string, number>
  prev: Record<string, string | null>
  /** 已确定(settled)的节点 */
  settled: string[]
  /** 最近松弛的边 */
  currentEdge: [string, string] | null
  /** 当前取出的节点 */
  currentNode: string | null
  done: boolean
  log: string[]
}

export const TEACHING_NODES: DijkstraNode[] = [
  { id: 'A', label: 'A', x: 90, y: 300 },
  { id: 'B', label: 'B', x: 280, y: 150 },
  { id: 'C', label: 'C', x: 280, y: 450 },
  { id: 'D', label: 'D', x: 470, y: 300 },
  { id: 'E', label: 'E', x: 640, y: 150 },
  { id: 'F', label: 'F', x: 640, y: 450 },
]

export const TEACHING_EDGES: DijkstraEdge[] = [
  { from: 'A', to: 'B', weight: 4 },
  { from: 'A', to: 'C', weight: 2 },
  { from: 'B', to: 'C', weight: 1 },
  { from: 'B', to: 'D', weight: 5 },
  { from: 'C', to: 'D', weight: 8 },
  { from: 'C', to: 'F', weight: 10 },
  { from: 'D', to: 'E', weight: 2 },
  { from: 'E', to: 'F', weight: 3 },
  { from: 'D', to: 'F', weight: 6 },
]

export function createDijkstraState(start = 'A'): DijkstraState {
  const dist: Record<string, number> = {}
  const prev: Record<string, string | null> = {}
  for (const n of TEACHING_NODES) {
    dist[n.id] = n.id === start ? 0 : Number.POSITIVE_INFINITY
    prev[n.id] = null
  }
  return {
    nodes: TEACHING_NODES.map(n => ({ ...n })),
    edges: TEACHING_EDGES.map(e => ({ ...e })),
    start,
    dist,
    prev,
    settled: [],
    currentEdge: null,
    currentNode: null,
    done: false,
    log: [`起点 ${start}:dist=0,其余 ∞;优先队列就绪`],
  }
}

function neighborsOf(edges: DijkstraEdge[], id: string): Array<{ to: string; weight: number }> {
  const out: Array<{ to: string; weight: number }> = []
  for (const e of edges) {
    if (e.from === id) out.push({ to: e.to, weight: e.weight })
    if (e.to === id) out.push({ to: e.from, weight: e.weight }) // 无向图
  }
  return out
}

/** 推进一轮:取 dist 最小的未定节点,松弛其邻居 */
export function dijkstraStep(s: DijkstraState): DijkstraState {
  if (s.done) return s
  // 取未定节点中 dist 最小者
  let u: string | null = null
  let best = Number.POSITIVE_INFINITY
  for (const n of s.nodes) {
    if (!s.settled.includes(n.id) && s.dist[n.id]! < best) {
      best = s.dist[n.id]!
      u = n.id
    }
  }
  if (u === null) {
    // 剩余不可达
    return { ...s, done: true, currentNode: null, currentEdge: null, log: [...s.log, '可达节点全部确定 ✓(其余节点不可达)'] }
  }

  const dist = { ...s.dist }
  const prev = { ...s.prev }
  const settled = [...s.settled, u]
  const log: string[] = [`确定节点 ${u}:dist = ${fmtDist(dist[u]!)}(贪心:当前最小不可能再改进)`]

  let currentEdge: [string, string] | null = null
  for (const { to, weight } of neighborsOf(s.edges, u)) {
    if (settled.includes(to)) continue
    const alt = (dist[u] === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : dist[u]! + weight)
    if (alt < dist[to]!) {
      log.push(`松弛 ${u} → ${to}:${fmtDist(dist[to]!)} > ${fmtDist(alt)} → 更新 dist,前驱 = ${u}`)
      dist[to] = alt
      prev[to] = u
      currentEdge = [u, to]
    }
  }

  const done = settled.length === s.nodes.length
  return {
    ...s,
    dist,
    prev,
    settled,
    currentNode: u,
    currentEdge,
    done,
    log: [...s.log, ...log],
  }
}

function fmtDist(d: number): string {
  return d === Number.POSITIVE_INFINITY ? '∞' : String(d)
}

/** 回溯路径(settled 完成后) */
export function pathTo(s: DijkstraState, target: string): string[] {
  if (s.dist[target] === Number.POSITIVE_INFINITY) return []
  const path: string[] = []
  let cur: string | null = target
  while (cur !== null) {
    path.unshift(cur)
    cur = s.prev[cur] ?? null
    if (path.length > 20) break
  }
  return path
}
