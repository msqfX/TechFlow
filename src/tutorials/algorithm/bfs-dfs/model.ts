/**
 * BFS/DFS 图遍历模型(纯函数,可测试)。
 * 同一张图、同一个框架,只差容器:队列(BFS)vs 栈(DFS)。
 * 逐步推进:每步 = 从容器取出一个节点访问,并把未访问邻居按序放入。
 */

export type TraversalMode = 'BFS' | 'DFS'

export interface GraphNode {
  id: string
  label: string
  x: number
  y: number
}

export interface TraversalState {
  mode: TraversalMode
  graph: Record<string, string[]>
  positions: Record<string, { x: number; y: number }>
  start: string
  /** 已访问(出容器时) */
  visited: string[]
  /** 容器:队列(FIFO)或栈(LIFO) */
  frontier: string[]
  /** 当前正在处理的边 */
  currentEdge: [string, string] | null
  /** 树边(遍历树) */
  treeEdges: Array<[string, string]>
  /** 出容器瞬间的容器快照(入容器标记,教学展示) */
  marked: string[]
  done: boolean
  log: string[]
}

export const TEACHING_GRAPH: Record<string, string[]> = {
  A: ['B', 'C'],
  B: ['A', 'D', 'E'],
  C: ['A', 'F'],
  D: ['B', 'G'],
  E: ['B', 'F', 'G'],
  F: ['C', 'E', 'H'],
  G: ['D', 'E', 'H'],
  H: ['F', 'G'],
}

export const TEACHING_POSITIONS: Record<string, { x: number; y: number }> = {
  A: { x: 100, y: 300 },
  B: { x: 260, y: 170 },
  C: { x: 260, y: 430 },
  D: { x: 430, y: 90 },
  E: { x: 440, y: 300 },
  F: { x: 430, y: 480 },
  G: { x: 610, y: 180 },
  H: { x: 640, y: 420 },
}

export function createTraversalState(mode: TraversalMode, start = 'A'): TraversalState {
  const graph = TEACHING_GRAPH
  return {
    mode,
    graph,
    positions: TEACHING_POSITIONS,
    start,
    visited: [],
    frontier: [start],
    currentEdge: null,
    treeEdges: [],
    marked: [start],
    done: false,
    log: [
      `${mode} 遍历从 ${start} 开始:容器 = ${mode === 'BFS' ? '队列(FIFO,按层扩散)' : '栈(LIFO,深入回溯)'}`,
      `${start} 先标记(防环)后入容器`,
    ],
  }
}

/** 推进一步:出容器访问一个节点,邻居按图序入容器 */
export function traversalStep(s: TraversalState): TraversalState {
  if (s.done || s.frontier.length === 0) {
    return { ...s, done: true, currentEdge: null, log: [...s.log, '容器空 —— 遍历完成 ✓'] }
  }
  const visitedSet = new Set(s.visited)
  const markedSet = new Set(s.marked)
  let nodeId: string
  let fromId: string | null = s.currentEdge ? s.currentEdge[0] : null
  let currentEdge: [string, string] | null = null

  if (s.mode === 'BFS') {
    nodeId = s.frontier.shift()!
  } else {
    nodeId = s.frontier.pop()!
  }
  // 出容器边(入容器时的来源)
  if (nodeId !== s.start) {
    // 依据容器顺序反查来源:邻居中第一个已访问且与当前节点相邻的
    for (const nb of s.graph[nodeId] ?? []) {
      if (visitedSet.has(nb) || (s.marked.includes(nb) && s.frontier.includes(nb))) {
        currentEdge = [nb, nodeId]
        break
      }
    }
    if (!currentEdge) currentEdge = [fromId ?? s.start, nodeId]
  }

  const newLog: string[] = []
  visitedSet.add(nodeId)
  const visited = [...s.visited, nodeId]
  newLog.push(`${s.mode} 访问 ${nodeId}(第 ${visited.length} 个)`)
  const frontier = [...s.frontier]
  const treeEdges = [...s.treeEdges]
  if (currentEdge) treeEdges.push(currentEdge)

  for (const nb of s.graph[nodeId] ?? []) {
    if (!markedSet.has(nb)) {
      markedSet.add(nb)
      if (s.mode === 'BFS') frontier.push(nb)
      else frontier.push(nb)
      newLog.push(`邻居 ${nb} 标记并入容器`)
    }
  }
  if (s.frontier.length === frontier.length && !s.mode) {
    // noop 保持类型
  }

  return {
    ...s,
    visited,
    frontier,
    currentEdge,
    treeEdges,
    marked: [...markedSet],
    done: frontier.length === 0 && visited.length === Object.keys(s.graph).length,
    log: [...s.log, ...newLog],
  }
}

/** BFS 最短路径(教学:跳数) */
export function bfsShortestPath(s: TraversalState, target: string): number | null {
  const idx = s.visited.indexOf(target)
  return idx === -1 ? null : idx
}

/** DFS 递归版访问顺序(与栈版等价性校验用) */
export function dfsRecursiveOrder(graph: Record<string, string[]>, start: string): string[] {
  const visited = new Set<string>()
  const order: string[] = []
  const walk = (id: string) => {
    visited.add(id)
    order.push(id)
    for (const nb of graph[id] ?? []) {
      if (!visited.has(nb)) walk(nb)
    }
  }
  walk(start)
  return order
}
