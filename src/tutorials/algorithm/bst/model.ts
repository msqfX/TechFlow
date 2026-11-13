/**
 * 二叉搜索树模型(无平衡机制,含退化演示;纯函数,可测试)。
 * 不变式:任意节点 左子树 < 本键 < 右子树。
 */

export interface BstNode {
  id: string
  key: number
  left: string | null
  right: string | null
}

export interface BstState {
  rootId: string | null
  nodes: Record<string, BstNode>
  searchPath: string[]
  searchedKey: number | null
  found: boolean | null
  highlight: string | null
  /** 最近删除方式描述 */
  lastDelete: string | null
  log: string[]
}

let bstSeq = 0
function makeNode(key: number): BstNode {
  bstSeq += 1
  return { id: `bst-${bstSeq}`, key, left: null, right: null }
}

function cloneNodes(s: BstState): Record<string, BstNode> {
  const nodes: Record<string, BstNode> = {}
  for (const [id, n] of Object.entries(s.nodes)) {
    nodes[id] = { ...n }
  }
  return nodes
}

export function createBstState(): BstState {
  return {
    rootId: null,
    nodes: {},
    searchPath: [],
    searchedKey: null,
    found: null,
    highlight: null,
    lastDelete: null,
    log: ['空树就绪;不变式:左 < 根 < 右(每个节点)'],
  }
}

export function bstHeight(s: BstState): number {
  const h = (id: string | null): number => (id === null ? 0 : 1 + Math.max(h(s.nodes[id]!.left), h(s.nodes[id]!.right)))
  return h(s.rootId)
}

export function inOrder(s: BstState): number[] {
  const out: number[] = []
  const walk = (id: string | null) => {
    if (id === null) return
    const n = s.nodes[id]!
    walk(n.left)
    out.push(n.key)
    walk(n.right)
  }
  walk(s.rootId)
  return out
}

/** 插入:沿比较路径下降,挂到空位(与查询同路径) */
export function bstInsert(state: BstState, key: number): BstState {
  const s: BstState = { ...state, nodes: cloneNodes(state) }
  if (s.rootId === null) {
    const n = makeNode(key)
    s.nodes[n.id] = n
    s.rootId = n.id
    s.highlight = n.id
    return { ...s, searchPath: [n.id], log: [...s.log, `插入 ${key}:成为根节点`] }
  }
  const path: string[] = []
  let cur = s.rootId
  for (;;) {
    const node = s.nodes[cur]!
    path.push(cur)
    if (key === node.key) {
      return { ...s, searchPath: path, log: [...s.log, `键 ${key} 已存在,跳过(教学模型不重复)`] }
    }
    const goLeft = key < node.key
    const nextId = goLeft ? node.left : node.right
    if (nextId === null) {
      const n = makeNode(key)
      s.nodes[n.id] = n
      if (goLeft) s.nodes[cur]!.left = n.id
      else s.nodes[cur]!.right = n.id
      path.push(n.id)
      s.highlight = n.id
      const height = bstHeight(s)
      return {
        ...s,
        searchPath: path,
        log: [...s.log, `插入 ${key}:比较 ${path.length - 1} 次后挂到空位 → 树高 ${height}${height > Math.ceil(Math.log2(Object.keys(s.nodes).length + 1)) + 1 ? '(开始偏斜!)' : ''}`],
      }
    }
    cur = nextId
  }
}

/** 查询:记录完整比较路径 */
export function bstSearch(state: BstState, key: number): BstState {
  const s: BstState = { ...state, nodes: cloneNodes(state) }
  const path: string[] = []
  let cur: string | null = s.rootId
  let found = false
  while (cur !== null) {
    path.push(cur)
    const node = s.nodes[cur]!
    if (key === node.key) {
      found = true
      break
    }
    cur = key < node.key ? node.left : node.right
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
        ? `查询 ${key}:比较 ${path.length} 次 → 命中(路径长 = 树高)`
        : `查询 ${key}:比较 ${path.length} 次 → 未命中`,
    ],
  }
}

/** 删除:三分支(叶子/单孩子/双子树 — 用右子树最小继任) */
export function bstDelete(state: BstState, key: number): BstState {
  const s: BstState = { ...state, nodes: cloneNodes(state) }
  // 找节点与父
  let cur: string | null = s.rootId
  let parent: string | null = null
  while (cur !== null) {
    const node = s.nodes[cur]!
    if (key === node.key) break
    parent = cur
    cur = key < node.key ? node.left : node.right
  }
  if (cur === null) {
    return { ...s, log: [...s.log, `删除 ${key}:未找到`] }
  }
  const node = s.nodes[cur]!
  const attach = (parentId: string | null, side: 'left' | 'right', childId: string | null) => {
    if (parentId === null) s.rootId = childId
    else s.nodes[parentId]![side] = childId
  }
  const side: 'left' | 'right' = parent !== null && s.nodes[parent]!.left === cur ? 'left' : 'right'

  if (node.left === null && node.right === null) {
    attach(parent, side, null)
    delete s.nodes[cur]
    return { ...s, lastDelete: `${key} 是叶子,直接摘除`, log: [...s.log, `删除 ${key}:叶子节点,直接摘除`] }
  }
  if (node.left === null || node.right === null) {
    const child = node.left ?? node.right
    attach(parent, side, child)
    delete s.nodes[cur]
    return { ...s, lastDelete: `${key} 单孩子,孩子顶位`, log: [...s.log, `删除 ${key}:单孩子 —— 孩子顶替其位置(单次指针改接)`] }
  }
  // 双子树:找右子树最小(继任者),换值后删继任者
  let succParentId: string | null = cur
  let succId: string = node.right!
  while (s.nodes[succId]!.left !== null) {
    succParentId = succId
    succId = s.nodes[succId]!.left!
  }
  const succKey = s.nodes[succId]!.key
  const succNode = s.nodes[succId]!
  attach(succParentId, succParentId === cur ? 'right' : 'left', succNode.right)
  delete s.nodes[succId]
  s.nodes[cur] = { ...node, key: succKey }
  return {
    ...s,
    lastDelete: `${key} 双子树,右子树最小值 ${succKey} 继任`,
    log: [...s.log, `删除 ${key}:双子树 —— 取右子树最小值 ${succKey} 替换本键,再摘除继任节点(不变式保持)`],
  }
}
