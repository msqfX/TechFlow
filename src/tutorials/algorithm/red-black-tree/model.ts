/**
 * 红黑树模型(CLRS 插入 + 步进式修复;纯函数,可测试)。
 * rbInsert:BST 插入红节点并设置修复目标;rbFixupStep:每次执行一个原子操作
 * (变色 / 左旋 / 右旋 / 终止)—— 旋转动画可逐步呈现。
 */

export type RbColor = 'red' | 'black'

export interface RbNode {
  id: string
  key: number
  color: RbColor
  left: string | null
  right: string | null
  parent: string | null
}

export interface RbState {
  rootId: string | null
  nodes: Record<string, RbNode>
  /** 修复目标节点(新插入的 z 或上移后的当前节点) */
  fixupId: string | null
  /** 最近一次修复动作(场景展示) */
  lastAction: string | null
  rotations: number
  recolors: number
  height: number
  keyCount: number
  log: string[]
}

let rbSeq = 0
function makeNode(key: number, color: RbColor): RbNode {
  rbSeq += 1
  return { id: `rb-${rbSeq}`, key, color, left: null, right: null, parent: null }
}

function cloneNodes(s: RbState): Record<string, RbNode> {
  const nodes: Record<string, RbNode> = {}
  for (const [id, n] of Object.entries(s.nodes)) {
    nodes[id] = { ...n }
  }
  return nodes
}

export function createRbState(): RbState {
  return {
    rootId: null,
    nodes: {},
    fixupId: null,
    lastAction: null,
    rotations: 0,
    recolors: 0,
    height: 0,
    keyCount: 0,
    log: ['空树就绪;插入总是红色节点 —— 若违反「红不相连」将触发修复'],
  }
}

export function rbHeight(s: RbState): number {
  const h = (id: string | null): number => (id === null ? 0 : 1 + Math.max(h(s.nodes[id]!.left), h(s.nodes[id]!.right)))
  return h(s.rootId)
}

function inOrder(s: RbState): number[] {
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

function uncleOf(s: RbState, zId: string): string | null {
  const z = s.nodes[zId]!
  const parent = z.parent ? s.nodes[z.parent] : null
  if (!parent || !parent.parent) return null
  const gp = s.nodes[parent.parent]!
  const uncleId = gp.left === parent.id ? gp.right : gp.left
  return uncleId
}

/** 左旋(围绕 x):y = x.right 上位,x 成 y 左孩子 */
export function rotateLeft(s: RbState, xId: string): RbState {
  const x = s.nodes[xId]!
  const y = s.nodes[x.right!]!
  x.right = y.left
  if (y.left) s.nodes[y.left]!.parent = xId
  y.parent = x.parent
  if (!x.parent) s.rootId = y.id
  else if (s.nodes[x.parent]!.left === xId) s.nodes[x.parent]!.left = y.id
  else s.nodes[x.parent]!.right = y.id
  y.left = xId
  x.parent = y.id
  return s
}

/** 右旋(围绕 x):y = x.left 上位,x 成 y 右孩子 */
export function rotateRight(s: RbState, xId: string): RbState {
  const x = s.nodes[xId]!
  const y = s.nodes[x.left!]!
  x.left = y.right
  if (y.right) s.nodes[y.right]!.parent = xId
  y.parent = x.parent
  if (!x.parent) s.rootId = y.id
  else if (s.nodes[x.parent]!.right === xId) s.nodes[x.parent]!.right = y.id
  else s.nodes[x.parent]!.left = y.id
  y.right = xId
  x.parent = y.id
  return s
}

/** BST 插入红色节点(不修复);返回新状态与 z */
function bstInsertRed(s: RbState, key: number): string {
  const z = makeNode(key, 'red')
  s.nodes[z.id] = z
  s.keyCount += 1
  if (s.rootId === null) {
    s.rootId = z.id
    // 保持红色,交给 fixupStep 涂黑 —— 步骤可展示
    s.log = [...s.log, `插入 ${key}:成为根(先红色,修复阶段涂黑)`]
    return z.id
  }
  let cur = s.rootId
  for (;;) {
    const node = s.nodes[cur]!
    if (key === node.key) {
      delete s.nodes[z.id]
      s.keyCount -= 1
      s.log = [...s.log, `键 ${key} 已存在,跳过`]
      return ''
    }
    z.parent = cur
    const goLeft = key < node.key
    if (goLeft) {
      if (node.left === null) {
        node.left = z.id
        break
      }
      cur = node.left
    } else {
      if (node.right === null) {
        node.right = z.id
        break
      }
      cur = node.right
    }
  }
  s.log = [...s.log, `插入 ${key}(红色):沿比较路径下降挂到空位`]
  return z.id
}

/** 插入(不修复):返回需修复的 z */
export function rbInsert(state: RbState, key: number): RbState {
  const s: RbState = { ...state, nodes: cloneNodes(state) }
  const zId = bstInsertRed(s, key)
  s.fixupId = zId === '' ? null : zId
  s.lastAction = null
  return s
}

/** 修复一步:每次执行一个原子操作(变色 / 旋转 / 终止) */
export function rbFixupStep(state: RbState): RbState {
  const s: RbState = { ...state, nodes: cloneNodes(state) }
  if (!s.fixupId) {
    return { ...s, log: [...s.log, '无需修复'] }
  }
  const z = s.nodes[s.fixupId]!
  const parent = z.parent ? s.nodes[z.parent] : null
  if (!parent) {
    // z 是根:涂黑
    z.color = 'black'
    s.height = rbHeight(s)
    s.fixupId = null
    s.lastAction = 'root-black'
    return { ...s, log: [...s.log, `z 是根 → 涂黑(性质 2),修复完成`], lastAction: null }
  }
  if (parent.color === 'black') {
    s.height = rbHeight(s)
    s.fixupId = null
    return { ...s, log: [...s.log, '父节点为黑 → 无违反,修复完成 ✓'], lastAction: null }
  }
  if (!parent.parent) {
    // 父是根且为红:直接涂黑(违反性质 2,但无祖父可旋)
    parent.color = 'black'
    s.height = rbHeight(s)
    s.fixupId = null
    return { ...s, log: [...s.log, '父节点是根且为红 → 涂黑(性质 2)'], lastAction: null }
  }
  const gpId = parent.parent
  const gp = s.nodes[gpId]!
  const uncleId = uncleOf(s, s.fixupId!)
  const uncle = uncleId ? s.nodes[uncleId] : null
  const parentIsLeft = gp.left === parent.id

  if (uncle && uncle.color === 'red') {
    // 叔红:变色,向上蔓延
    parent.color = 'black'
    if (uncle) s.nodes[uncleId!]!.color = 'black'
    gp.color = 'red'
    s.recolors += 1
    s.fixupId = gp.color === 'red' && gpId === s.rootId ? null : gpId
    if (s.fixupId === gpId && gp.parent === null) {
      gp.color = 'black'
      s.fixupId = null
    }
    return {
      ...s,
      lastAction: 'recolor',
      log: [...s.log, `情况·叔红:父与叔变黑、祖父变红 → 检查上移至祖父`],
    }
  }

  // 叔黑(或 NIL):旋转家族
  const zIsLeft = parent.left === z.id
  if (parentIsLeft && !zIsLeft) {
    // LR:先左旋父 —— z 成为原父的父,fixupId 保持指向 z
    const rotated = rotateLeft(s, parent.id)
    s.rotations += 1
    return { ...rotated, fixupId: z.id, lastAction: 'rotate-left', log: [...rotated.log, '情况 LR:先左旋父节点(转为 LL,继续修复)'] }
  }
  if (!parentIsLeft && zIsLeft) {
    // RL:先右旋父
    const rotated = rotateRight(s, parent.id)
    s.rotations += 1
    return { ...rotated, fixupId: z.id, lastAction: 'rotate-right', log: [...rotated.log, '情况 RL:先右旋父节点(转为 RR,继续修复)'] }
  }
  // LL / RR:变色 + 旋祖父(z 保持为修复目标,修复完成)
  parent.color = 'black'
  gp.color = 'red'
  s.recolors += 1
  let rotated: RbState
  if (parentIsLeft) {
    rotated = rotateRight(s, gpId)
    s.rotations += 1
    rotated = { ...rotated, fixupId: z.id, lastAction: 'rotate-right', log: [...rotated.log, `情况 LL:父变黑、祖父变红 → 右旋祖父(修复完成)`] }
  } else {
    rotated = rotateLeft(s, gpId)
    s.rotations += 1
    rotated = { ...rotated, fixupId: z.id, lastAction: 'rotate-left', log: [...rotated.log, `情况 RR:父变黑、祖父变红 → 左旋祖父(修复完成)`] }
  }
  rotated.height = rbHeight(rotated)
  rotated.fixupId = null
  return rotated
}

/** 五性质校验(测试与场景展示用) */
export function checkRbProperties(s: RbState): { rootBlack: boolean; noRedRed: boolean; equalBlackHeight: boolean; ordered: boolean } {
  const rootBlack = s.rootId === null || s.nodes[s.rootId]!.color === 'black'
  let noRedRed = true
  let bhOk = true
  const blackHeights = new Set<number>()
  const ordered = inOrder(s)
  const walk = (id: string | null, blackCount: number, parentRed: boolean): number => {
    if (id === null) {
      blackHeights.add(blackCount + 1) // NIL 视为黑
      return blackCount + 1
    }
    const n = s.nodes[id]!
    if (n.color === 'red' && parentRed) noRedRed = false
    const nextBlack = blackCount + (n.color === 'black' ? 1 : 0)
    const lh = walk(n.left, nextBlack, n.color === 'red')
    const rh = walk(n.right, nextBlack, n.color === 'red')
    if (lh !== rh) bhOk = false
    return lh
  }
  walk(s.rootId, 0, false)
  void blackHeights
  const strictlyOrdered = ordered.every((k, i) => i === 0 || ordered[i - 1]! < k)
  return { rootBlack, noRedRed, equalBlackHeight: bhOk, ordered: strictlyOrdered }
}
