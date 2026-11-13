import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  bstDelete,
  bstHeight,
  bstInsert,
  bstSearch,
  createBstState,
  inOrder,
} from './model'
import type { BstState } from './model'

/** BST 场景:复用 B+Tree 的树形重绘模式;挑战 = 递增插入退化成链表 */

const VIEW = { width: 840, height: 560 }
const TOP = 150
const LEVEL_H = 110
const NODE_W = 54
const NODE_H = 44

class BstScene extends BaseScene<BstState> {
  private heightChip: SVGTextElement | null = null
  private inorderChip: SVGTextElement | null = null
  private warningChip: SVGTextElement | null = null
  private live: BstState | null = null

  constructor() {
    super({ id: 'bst', viewBox: VIEW, label: '二叉搜索树插入与查询' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    new Label(renderer, { x: 60, y: 46, text: '不变式:左子树 < 根 < 右子树(每个节点)', kind: 'accent', anchor: 'start' })
    this.heightChip = renderer.el('text', { x: 60, y: 76, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.inorderChip = renderer.el('text', { x: 60, y: 98, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.warningChip = renderer.el('text', { x: VIEW.width - 60, y: 76, 'text-anchor': 'end', class: 'tf-ip-error-text' }, renderer.layerLabels)
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '查询/插入沿比较路径下降;中序遍历 = 升序序列;退化成链表 = O(n)', kind: 'muted' })
  }

  protected buildSteps() {
    const arr = [50, 30, 70, 20, 40, 60, 80]
    const steps: SceneStep[] = [
      {
        id: 'intro',
        title: '空树就绪',
        description: `将依次插入 [${arr.join(', ')}] —— 观察比较路径。`,
        explanation: `BST 只有一条不变式:**左子树 < 根 < 右子树**。插入 = 一次未命中的查询:与节点比较,小往左、大往右,走到空位挂上。平均 O(log n) —— 但这个「平均」有前提,后面会用挑战模式打破它。`,
        duration: 1100,
        action: 'intro',
      },
    ]
    const transitions: StepTransition<BstState>[] = [s => (s.rootId === null ? s : s)]

    let st = createBstState()
    for (const key of arr) {
      const before = st
      st = bstInsert(st, key)
      const h = bstHeight(st)
      steps.push({
        id: `insert-${key}`,
        title: `插入 ${key}:比较 ${before.log.length - 1} 次后落位`,
        description: st.log[st.log.length - 1] ?? '',
        explanation: `与节点逐个比较,小往左、大往右,走到空位挂上 —— 插入路径 = 查询路径。当前树高 ${h};若树保持平衡,查询代价 ≈ log₂(节点数)。`,
        duration: 950,
        action: 'insert',
      })
      transitions.push(s => bstInsert(s, key))
    }

    steps.push({
      id: 'inorder',
      title: '中序遍历 = 升序序列!',
      description: '左 → 根 → 右,输出恰好有序。',
      explanation: `对 BST 做中序遍历(左 → 根 → 右),输出**恰好是升序序列** —— 这是「左 < 根 < 右」不变式的直接数学结果。因此 BST 天然支持「按序输出 / 取前驱后继 / 范围查询」,这是哈希表给不了的能力。`,
      duration: 1200,
      action: 'inorder',
    })
    transitions.push(s => ({ ...s, log: [...s.log, `中序遍历:[${inOrder(s).join(', ')}] 有序 ✓`] }))

    // 挑战:递增插入退化
    steps.push({
      id: 'degenerate',
      title: '挑战:递增插入 60 → 树变成链表!',
      description: '每个新节点都落在最右侧 —— 树高 = 节点数。',
      explanation: `递增插入时,每个新节点都是上一个的**右孩子** —— BST 退化成链表,高度 = 节点数,查询/插入从 O(log n) 退化到 **O(n)**。普通 BST 没有平衡机制 —— 这就是 AVL/红黑树(旋转)与 B/B+Tree(多叉矮胖)存在的理由,对照《B+Tree 索引》的同一实验:那边递增插入依然平衡。`,
      duration: 1500,
      action: 'degenerate',
    })
    transitions.push(s => {
      let st2 = bstInsert(s, 60)
      return st2
    })

    return { steps, transitions }
  }

  protected buildInitialState(): BstState {
    return createBstState()
  }

  private effectiveState(stepState: BstState): BstState {
    return this.live ?? stepState
  }

  private layout(): Map<string, { x: number; y: number }> {
    const state = this.effectiveState(this.states.current)
    const pos = new Map<string, { x: number; y: number }>()
    let slot = 0
    const spacing = 108
    const walk = (id: string | null, level: number): number => {
      if (id === null) {
        slot += 1
        return 60 + (slot - 1) * spacing + spacing / 2
      }
      const node = state.nodes[id]!
      const leftX = walk(node.left, level + 1)
      const rightX = walk(node.right, level + 1)
      const x = node.left !== null && node.right !== null ? (leftX + rightX) / 2 : node.left !== null ? leftX : node.right !== null ? rightX : 60 + (slot - 1) * spacing + spacing / 2
      pos.set(id, { x, y: TOP + level * LEVEL_H })
      return x
    }
    walk(state.rootId, 0)
    return pos
  }

  protected render(stepState: BstState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const renderer = this.renderer
    if (!renderer) return
    void opts
    void tl_unused(opts)

    renderer.clear('nodes')
    renderer.clear('links')
    renderer.clear('labels')
    renderer.clear('overlay')

    const pos = this.layout()

    // 边
    for (const node of Object.values(state.nodes)) {
      const from = pos.get(node.id)
      if (!from) continue
      for (const childId of [node.left, node.right]) {
        if (childId === null) continue
        const to = pos.get(childId)
        if (!to) continue
        renderer.el('path', { d: `M ${from.x} ${from.y + NODE_H / 2} L ${to.x} ${to.y - NODE_H / 2}`, class: 'tf-link' }, renderer.layerLinks)
      }
    }

    // 节点
    for (const node of Object.values(state.nodes)) {
      const p = pos.get(node.id)
      if (!p) continue
      const onPath = state.searchPath.includes(node.id)
      const g = renderer.el('g', { transform: `translate(${p.x - NODE_W / 2} ${p.y - NODE_H / 2})` }, renderer.layerNodes)
      renderer.el('rect', {
        width: NODE_W, height: NODE_H, rx: 9,
        class: `tf-jvm-frame ${onPath ? 'is-top' : ''} ${state.highlight === node.id ? 'is-front' : ''}`,
      }, g)
      renderer.el('text', { x: NODE_W / 2, y: NODE_H / 2 + 6, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g).textContent = String(node.key)
    }

    // 信息芯片
    const h = bstHeight(state)
    const ordered = inOrder(state)
    const orderedOk = ordered.every((k, i) => i === 0 || ordered[i - 1]! < k)
    if (this.heightChip) this.heightChip.textContent = `节点数:${Object.keys(state.nodes).length} · 树高:${h} · 查询代价 ≈ O(${h})`
    if (this.inorderChip) {
      this.inorderChip.textContent = `中序遍历:[${ordered.join(', ')}]${orderedOk ? ' 有序 ✓' : ''}`
      this.inorderChip.setAttribute('class', `tf-subnet-mono ${orderedOk ? 'ok' : ''}`)
    }
    if (this.warningChip) {
      const degenerate = h > Math.ceil(Math.log2(Object.keys(state.nodes).length + 1)) + 1
      this.warningChip.textContent = degenerate ? `⚠ 已退化:树高 ${h} ≈ 节点数,查询 O(n) —— 需要平衡树!` : ''
    }
  }

  protected snapshotData(stepState: BstState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const h = bstHeight(state)
    const ordered = inOrder(state)
    const nodeCount = Object.keys(state.nodes).length
    const degenerate = h >= nodeCount && nodeCount > 0
    return {
      rows: [
        { label: '节点数', value: String(nodeCount), tone: 'accent' },
        { label: '树高', value: `${h}`, tone: degenerate ? 'danger' : 'success' },
        { label: '查询代价', value: `O(${h})`, tone: degenerate ? 'danger' : 'success' },
        { label: '理想树高', value: `⌈log₂(${nodeCount + 1})⌉ ≈ ${nodeCount ? Math.ceil(Math.log2(nodeCount + 1)) : 0}` },
        { label: '中序遍历', value: `[${ordered.join(', ')}]`, tone: orderedOk(ordered) ? 'success' : 'danger' },
        { label: '退化状态', value: degenerate ? '已退化成链表!' : '树形结构保持', tone: degenerate ? 'danger' : 'success' },
        { label: '最近删除', value: state.lastDelete ?? '—' },
        { label: '最近查询', value: state.searchedKey !== null ? `${state.searchedKey}:${state.found ? '命中' : '未命中'}(比较 ${state.searchPath.length} 次)` : '—' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }

    function orderedOk(arr: number[]): boolean {
      return arr.every((k, i) => i === 0 || arr[i - 1]! < k)
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'insert', label: '插入一个键', description: '沿比较路径下降,挂到空位。', params: [{ name: 'key', label: '键值', type: 'number', min: 1, max: 99, placeholder: '45' }] },
      { name: 'search', label: '查询一个键', description: '高亮完整比较路径。', params: [{ name: 'key', label: '键值', type: 'number', min: 1, max: 99, placeholder: '40' }] },
      { name: 'delete', label: '删除一个键', description: '叶子/单孩子/双子树三种情况。', params: [{ name: 'key', label: '键值', type: 'number', min: 1, max: 99, placeholder: '30' }] },
      { name: 'load-increasing', label: '递增插入 1~7(挑战)', description: '把 BST 插成链表,观察 O(n) 退化。', danger: true },
      { name: 'reset', label: '复位' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: BstState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'insert': {
        const key = Math.round(Number(params?.key ?? 0))
        if (Number.isFinite(key) && key >= 1 && key <= 99) apply(bstInsert(base(), key))
        break
      }
      case 'search': {
        const key = Math.round(Number(params?.key ?? 0))
        if (Number.isFinite(key) && key >= 1 && key <= 99) apply(bstSearch(base(), key))
        break
      }
      case 'delete': {
        const key = Math.round(Number(params?.key ?? 0))
        if (Number.isFinite(key) && key >= 1 && key <= 99) apply(bstDelete(base(), key))
        break
      }
      case 'load-increasing': {
        let st = createBstState()
        for (let k = 1; k <= 7; k++) st = bstInsert(st, k * 10)
        apply(st)
        break
      }
      case 'reset':
        this.live = null
        this.render(this.states.current, { animate: false, timeline: null, fromIndex: 0 })
        this.events.emit('data', this.getState())
        break
      default:
        break
    }

  }
}

function tl_unused(_o: unknown): void {}

const sceneModule: SceneModule = {
  create: () => new BstScene(),
}

export default sceneModule
