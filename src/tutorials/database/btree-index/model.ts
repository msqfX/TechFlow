/**
 * B 树(教学简化,B+Tree 核心机制)模型:插入/分裂/搜索(纯函数,可测试)。
 * 每节点最多 3 键(MAX_KEYS);下降途中自顶向下分裂(无需回溯)。
 * 根分裂 → 新根,树高 +1(树长高的唯一方式)。
 */

export interface BTreeNode {
  id: string
  keys: number[]
  children: string[]
  leaf: boolean
}

export interface BTreeState {
  rootId: string
  nodes: Record<string, BTreeNode>
  /** 最近一次查询路径(节点 id 序列) */
  searchPath: string[]
  searchedKey: number | null
  found: boolean | null
  /** 最近插入/分裂的节点 id(高亮) */
  highlight: string | null
  splits: number
  height: number
  keyCount: number
  log: string[]
}

export const MAX_KEYS = 3

let btSeq = 0
function makeNode(leaf: boolean, keys: number[] = [], children: string[] = []): BTreeNode {
  btSeq += 1
  return { id: `bt-${btSeq}`, keys: [...keys], children: [...children], leaf }
}

function cloneNodes(s: BTreeState): Record<string, BTreeNode> {
  const nodes: Record<string, BTreeNode> = {}
  for (const [id, n] of Object.entries(s.nodes)) {
    nodes[id] = { ...n, keys: [...n.keys], children: [...n.children] }
  }
  return nodes
}

export function createBTreeState(): BTreeState {
  const root = makeNode(true)
  return {
    rootId: root.id,
    nodes: { [root.id]: root },
    searchPath: [],
    searchedKey: null,
    found: null,
    highlight: root.id,
    splits: 0,
    height: 1,
    keyCount: 0,
    log: ['空树:根节点(叶子)就绪;每节点最多 3 键,满则分裂、键上提'],
  }
}

/** 节点内定位 key 应走的子树下标 */
function childIndex(keys: number[], key: number): number {
  let i = 0
  while (i < keys.length && key > keys[i]!) i++
  return i
}

/** 分裂 parent.children[ci](子节点已满:上提 keys[1],左 [k0],右 [k2,k3]) */
function splitChild(s: BTreeState, parentId: string, ci: number): BTreeState {
  const parent = { ...s.nodes[parentId]!, keys: [...s.nodes[parentId]!.keys], children: [...s.nodes[parentId]!.children] }
  const childId = parent.children[ci]!
  const childNode = s.nodes[childId]!
  const child = { ...childNode, keys: [...childNode.keys], children: [...childNode.children] }
  const promoted = child.keys[1]!
  const left = { ...child, keys: [child.keys[0]!] }
  const right = makeNode(child.leaf, child.keys.slice(2), child.leaf ? [] : child.children.slice(2))
  s.nodes[childId] = left
  s.nodes[right.id] = right
  parent.keys.splice(ci, 0, promoted)
  parent.children.splice(ci + 1, 0, right.id)
  s.nodes[parentId] = parent
  s.splits += 1
  return s
}

/**
 * 插入一个键(含下降途中的自顶向下分裂;纯函数)。
 * 设计取舍:分裂发生在下降途中(提前分裂满节点),因此到达叶子时必有空间,无需回溯。
 */
export function btreeInsert(state: BTreeState, key: number): BTreeState {
  let s: BTreeState = { ...state, nodes: cloneNodes(state) }
  if (s.nodes[s.rootId]?.keys.includes(key)) {
    return { ...s, log: [...s.log, `键 ${key} 已存在,跳过(教学模型不允许重复键)`] }
  }
  let log = [...s.log, `插入 ${key}:从根下降寻找目标叶子`]

  // 根满 → 先分裂根(新根,树高 +1)
  if (s.nodes[s.rootId]!.keys.length >= MAX_KEYS) {
    const newRoot = makeNode(false, [], [s.rootId])
    s.nodes[newRoot.id] = newRoot
    s.rootId = newRoot.id
    s.height += 1
    s = splitChild(s, s.rootId, 0)
    log = [...log, `根已满 → 分裂:中位键上提为新根,树高 +1(树长高的唯一方式)`]
  }

  let nodeId: string = s.rootId
  while (!s.nodes[nodeId]!.leaf) {
    const node: BTreeNode = s.nodes[nodeId]!
    let ci = childIndex(node.keys, key)
    const childId = node.children[ci]!
    if (s.nodes[childId]!.keys.length >= MAX_KEYS) {
      s = splitChild(s, nodeId, ci)
      // 分裂后父节点多了一个键 → 重新确定下降方向
      ci = childIndex(s.nodes[nodeId]!.keys, key)
      log = [...log, `子节点已满 → 分裂:上提中位键,按 key=${key} 重新选择下降分支`]
    }
    nodeId = s.nodes[nodeId]!.children[ci]!
  }

  // 到达叶子(必未满):按序插入
  const leaf = s.nodes[nodeId]!
  const keys = [...leaf.keys, key].sort((a, b) => a - b)
  s.nodes[nodeId] = { ...leaf, keys }
  s.keyCount += 1
  s.highlight = nodeId
  log = [...log, `叶子插入 ${key}(该叶现有 ${keys.length} 键${keys.length >= MAX_KEYS ? ',已满 — 下次经过将分裂' : ''})`]

  return { ...s, searchPath: [], searchedKey: null, found: null, log }
}

/** 搜索:记录下降路径(教学高亮) */
export function btreeSearch(state: BTreeState, key: number): BTreeState {
  const s: BTreeState = { ...state, nodes: cloneNodes(state) }
  const path: string[] = []
  let nodeId: string | null = s.rootId
  let found = false
  while (nodeId !== null) {
    const node: BTreeNode = s.nodes[nodeId]!
    path.push(nodeId)
    if (node.keys.includes(key)) {
      found = true
      break
    }
    if (node.leaf) break
    nodeId = node.children[childIndex(node.keys, key)] ?? null
  }
  return {
    ...s,
    searchPath: path,
    searchedKey: key,
    found,
    highlight: path[path.length - 1] ?? null,
    log: [
      ...s.log,
      found
        ? `查询 ${key}:沿路径下降 ${path.length} 层命中(路径长 = 树高,IO 次数恒定)`
        : `查询 ${key}:下降 ${path.length} 层到达叶子,未命中`,
    ],
  }
}

/** 全部叶子深度是否一致(平衡性校验) */
export function allLeavesSameDepth(s: BTreeState): boolean {
  const depths = new Set<number>()
  const walk = (id: string, d: number) => {
    const node = s.nodes[id]
    if (!node) return
    if (node.leaf) {
      depths.add(d)
      return
    }
    node.children.forEach(c => walk(c, d + 1))
  }
  walk(s.rootId, 0)
  return depths.size <= 1
}

/** 中序遍历全部键(有序性校验) */
export function inOrderKeys(s: BTreeState): number[] {
  const out: number[] = []
  const walk = (id: string) => {
    const node = s.nodes[id]
    if (!node) return
    node.keys.forEach((k, i) => {
      if (!node.leaf) walk(node.children[i]!)
      out.push(k)
    })
    if (!node.leaf) walk(node.children[node.keys.length]!)
  }
  walk(s.rootId)
  return out
}
