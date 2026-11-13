/**
 * 链表操作模型(纯函数,可测试)。
 * nodes 数组表示链表顺序;nextMap 显式表达指针(可视化用)。
 * 操作:头插 O(1)、尾插、按下标遍历访问(O(n),带游标)、按下标删除。
 */

export interface ListNode {
  id: string
  value: number
}

export interface LinkedListState {
  nodes: ListNode[]
  /** id → 下一节点 id(尾节点为 null) */
  nextMap: Record<string, string | null>
  /** 遍历游标(当前访问到的下标) */
  cursor: number | null
  /** 最近操作的节点下标(高亮) */
  highlight: number | null
  headValue: number | null
  tailValue: number | null
  log: string[]
}

let llSeq = 0
function makeNode(value: number): ListNode {
  llSeq += 1
  return { id: `node-${llSeq}`, value }
}

/** 由顺序数组构建显式指针表 */
export function buildPointers(nodes: ListNode[]): Record<string, string | null> {
  const map: Record<string, string | null> = {}
  nodes.forEach((n, i) => {
    map[n.id] = nodes[i + 1] ? nodes[i + 1]!.id : null
  })
  return map
}

export function createLinkedListState(initial: number[]): LinkedListState {
  const nodes = initial.map(v => makeNode(v))
  return {
    nodes,
    nextMap: buildPointers(nodes),
    cursor: null,
    highlight: null,
    headValue: nodes[0]?.value ?? null,
    tailValue: nodes[nodes.length - 1]?.value ?? null,
    log: [`初始链表:${initial.join(' → ')} → null(共 ${nodes.length} 个节点)`],
  }
}

/** 头插 O(1):新节点指向旧头,head 更新 —— 无需移动任何已有节点 */
export function insertHead(s: LinkedListState, value: number): LinkedListState {
  const node = makeNode(value)
  const nodes = [node, ...s.nodes]
  return {
    ...s,
    nodes,
    nextMap: buildPointers(nodes),
    highlight: 0,
    cursor: null,
    headValue: value,
    log: [...s.log, `头插 ${value}:新节点指向旧头 —— 仅改 1 个指针,O(1)(数组头插需整体移位 O(n))`],
  }
}

/** 尾插 O(1)(持有尾指针时):原尾节点指向新节点 */
export function insertTail(s: LinkedListState, value: number): LinkedListState {
  const node = makeNode(value)
  const nodes = [...s.nodes, node]
  return {
    ...s,
    nodes,
    nextMap: buildPointers(nodes),
    highlight: nodes.length - 1,
    cursor: null,
    tailValue: value,
    log: [...s.log, `尾插 ${value}:原尾节点指向新节点 —— 持有尾指针时 O(1)`],
  }
}

/** 遍历游标前进一步(O(n) 访问的可视化) */
export function traverseStep(s: LinkedListState): LinkedListState {
  const next = s.cursor === null ? 0 : s.cursor + 1
  if (next >= s.nodes.length) {
    return {
      ...s,
      cursor: null,
      log: [...s.log, '遍历到 null —— 访问失败(目标下标越界)或查找结束'],
    }
  }
  const node = s.nodes[next]!
  return {
    ...s,
    cursor: next,
    log: [...s.log, `顺指针走到第 ${next + 1} 个节点(值 ${node.value})—— 每一步都是一次指针跳转`],
  }
}

/** 按下标删除:遍历到位置后,重排前驱指针(O(n) 定位 + O(1) 摘除) */
export function removeAt(s: LinkedListState, index: number): LinkedListState {
  if (index < 0 || index >= s.nodes.length) {
    return { ...s, log: [...s.log, `下标 ${index} 越界,删除失败`] }
  }
  const removed = s.nodes[index]!
  const nodes = s.nodes.filter((_, i) => i !== index)
  return {
    ...s,
    nodes,
    nextMap: buildPointers(nodes),
    highlight: null,
    cursor: null,
    headValue: nodes[0]?.value ?? null,
    tailValue: nodes[nodes.length - 1]?.value ?? null,
    log: [...s.log, `删除 ${removed.value}:前驱指针绕过它直接指向后继 —— 定位 O(n) + 摘除 O(1)`],
  }
}

/** 按下标访问(一次性,教学对照数组 O(1)) */
export function accessAt(s: LinkedListState, index: number): LinkedListState {
  const node = s.nodes[index]
  return {
    ...s,
    cursor: index,
    highlight: index,
    log: [...s.log, node ? `访问下标 ${index} 必须从头走 ${index + 1} 步(数组只要 1 步)—— 值 = ${node.value}` : `下标 ${index} 越界`],
  }
}
