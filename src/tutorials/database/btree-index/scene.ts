import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  MAX_KEYS,
  allLeavesSameDepth,
  btreeInsert,
  btreeSearch,
  createBTreeState,
  inOrderKeys,
} from './model'
import type { BTreeState } from './model'

/**
 * B+Tree 场景:树形布局 + 插入分裂重绘 + 查询路径高亮。
 * 树结构随状态变化(分裂/高度变化),因此每帧整层重绘(无补间),类似 Canvas 模式。
 */

const VIEW = { width: 840, height: 620 }
const TOP = 130
const LEVEL_H = 130
const KEY_W = 30
const KEY_H = 30
const NODE_PAD = 10

const TEACHING_KEYS = [10, 20, 5, 15, 30, 25, 35]

class BTreeIndexScene extends BaseScene<BTreeState> {
  private array = TEACHING_KEYS
  private heightChip: SVGTextElement | null = null
  private splitsChip: SVGTextElement | null = null
  private balanceChip: SVGTextElement | null = null
  private queryChip: SVGTextElement | null = null

  constructor() {
    super({ id: 'btree-index', viewBox: VIEW, label: 'B 树插入分裂与查询路径' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    new Label(renderer, { x: 60, y: 46, text: '教学模型:每节点最多 3 键(真实 InnoDB 一页数百键,机制相同)', kind: 'muted', anchor: 'start' })
    this.heightChip = renderer.el('text', { x: 60, y: 76, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.splitsChip = renderer.el('text', { x: 60, y: 98, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.balanceChip = renderer.el('text', { x: 60, y: 120, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.queryChip = renderer.el('text', { x: VIEW.width - 60, y: 76, 'text-anchor': 'end', class: 'tf-subnet-result' }, renderer.layerLabels)
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '节点满 → 中位键上提、左右分裂;根分裂 = 树高 +1(唯一长高方式);叶子永远同层', kind: 'muted' })
  }

  protected buildSteps() {
    const arr = this.array
    const steps: SceneStep[] = [
      {
        id: 'intro',
        title: '空树就绪',
        description: `将依次插入 [${arr.join(', ')}] —— 观察每一次分裂。`,
        explanation: `索引的使命是「矮」:树每下降一层 = 一次磁盘 IO。B 树让每个节点塞几十上百个键,千万数据只需 3 层。教学模型每节点最多 **3 键**,机制与真实实现完全一致 —— 点击下一步逐个插入,重点观察「节点满 → 分裂 → 键上提」。`,
        duration: 1100,
        action: 'intro',
      },
    ]
    const transitions: StepTransition<BTreeState>[] = [s => (s.keyCount === 0 ? s : s)]

    let st = createBTreeState()
    for (const key of arr) {
      const before = st
      st = btreeInsert(st, key)
      const splitHappened = st.splits > before.splits
      const heightGrew = st.height > before.height
      steps.push({
        id: `insert-${key}`,
        title: heightGrew ? `插入 ${key}:根分裂,树长高!` : splitHappened ? `插入 ${key}:触发分裂` : `插入 ${key}`,
        description: st.log[st.log.length - 1] ?? '',
        explanation: heightGrew
          ? `**根分裂**是树长高的唯一方式:旧根的键分裂为两个孩子,中位键上提成为新根。注意分裂后**所有叶子仍在同一层** —— B 树天然平衡,不需要 AVL/红黑树那样的旋转。`
          : splitHappened
            ? `目标叶子已满(3 键)→ **分裂**:中位键上提给父节点,左右各留其余键。分裂自中间断开,所以两侧仍然有序、叶子保持同层。`
            : `下降到叶子,按序放入即可,不触发任何结构变化。真实 B+Tree 一页放几百个键,这种「直接放入」是绝大多数插入的情况。`,
        duration: 1000,
        action: 'insert',
      })
      transitions.push(s => btreeInsert(s, key))
    }

    // 查询演示
    const queryKey = arr[3] ?? 15
    steps.push({
      id: 'search',
      title: `查询 ${queryKey}:沿树下降`,
      description: '路径长 = 树高 = 磁盘 IO 次数。',
      explanation: `**等值查询**从根开始:节点内比较确定走哪个孩子,一路到叶子 —— 路径上高亮的节点就是实际访问的页。**IO 次数 = 树高,与数据量无关地恒定**:千万数据 3 层,每层只有一次页读取(根还常驻内存)。`,
      duration: 1300,
      action: 'search',
    })
    transitions.push(s => btreeSearch(s, queryKey))

    steps.push({
      id: 'conclusion',
      title: '平衡性与有序性验证',
      description: '所有叶子同层;中序遍历严格递增。',
      explanation: `右侧信息面板显示:**所有叶子同层**(天然平衡)+ 中序遍历有序。真实 B+Tree 在此之上把**数据全部放进叶子**并用链表串联叶子 —— 等值查询不变,范围查询(WHERE id BETWEEN …)沿叶子横扫,这正是 InnoDB 选择 B+Tree 的最后一块拼图。`,
      duration: 1200,
      action: 'conclusion',
    })
    transitions.push(s => ({ ...s, log: [...s.log, `中序遍历:[${inOrderKeys(s).join(', ')}] 有序 ✓;叶子同层:${allLeavesSameDepth(s) ? '✓' : '✗'}`] }))

    return { steps, transitions }
  }

  protected buildInitialState(): BTreeState {
    return createBTreeState()
  }

  private effectiveState(stepState: BTreeState): BTreeState {
    return this.live ?? stepState
  }

  private live: BTreeState | null = null

  /** 树形布局:叶子按中序占槽,父节点 x = 子节点均值 */
  private layout(): Map<string, { x: number; y: number }> {
    const state = this.effectiveState(this.states.current)
    const pos = new Map<string, { x: number; y: number }>()
    let slot = 0
    const walk = (id: string, level: number): number => {
      const node = state.nodes[id]
      if (!node) return VIEW.width / 2
      const y = TOP + level * LEVEL_H
      if (node.leaf || node.children.length === 0) {
        const x = 80 + slot * 92 + 30
        slot += 1
        pos.set(id, { x, y })
        return x
      }
      const childXs = node.children.map(c => walk(c, level + 1))
      const x = (childXs[0]! + childXs[childXs.length - 1]!) / 2
      pos.set(id, { x, y })
      return x
    }
    walk(state.rootId, 0)
    return pos
  }

  protected render(stepState: BTreeState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const renderer = this.renderer
    void opts
    if (!renderer) return

    // 整层重绘(树结构会变化)
    renderer.clear('nodes')
    renderer.clear('links')
    renderer.clear('labels')
    renderer.clear('overlay')

    const pos = this.layout()

    // 边
    for (const node of Object.values(state.nodes)) {
      const from = pos.get(node.id)
      if (!from) continue
      node.children.forEach((cid, i) => {
        const to = pos.get(cid)
        if (!to) return
        renderer.el('path', {
          d: `M ${from.x} ${from.y + 22} L ${to.x} ${to.y - 22}`,
          class: 'tf-link',
        }, renderer.layerLinks)
        // 分支序号
        renderer.el('text', {
          x: (from.x + to.x) / 2 + 10,
          y: (from.y + to.y) / 2,
          class: 'tf-label--mono',
        }, renderer.layerLabels).textContent = `${i}`
      })
    }

    // 节点
    for (const node of Object.values(state.nodes)) {
      const p = pos.get(node.id)
      if (!p) continue
      const w = node.keys.length * KEY_W + NODE_PAD * 2
      const onPath = state.searchPath.includes(node.id)
      const isHighlight = state.highlight === node.id
      const g = renderer.el('g', { transform: `translate(${p.x - w / 2} ${p.y - 20})` }, renderer.layerNodes)
      renderer.el('rect', {
        width: w, height: 44, rx: 9,
        class: `tf-jvm-frame ${onPath ? 'is-top' : ''} ${isHighlight && onPath ? 'is-front' : ''}`,
      }, g)
      node.keys.forEach((k, i) => {
        renderer.el('rect', {
          x: NODE_PAD + i * KEY_W, y: 7, width: KEY_W - 4, height: KEY_H - 8, rx: 5,
          class: `tf-bit-cell tf-bit-cell--on ${node.leaf ? '' : 'tf-bit-cell--net'}`,
        }, g)
        renderer.el('text', {
          x: NODE_PAD + i * KEY_W + (KEY_W - 4) / 2, y: 27, 'text-anchor': 'middle', class: 'tf-bit-text',
        }, g).textContent = String(k)
      })
      if (node.leaf) {
        renderer.el('text', { x: w + 2, y: 30, class: 'tf-label--mono' }, g).textContent = '∅'
      }
    }

    // 信息芯片
    const leaves = Object.values(state.nodes).filter(n => n.leaf).length
    if (this.heightChip) this.heightChip.textContent = `树高:${state.height}(层) · 叶子:${leaves} 个`
    if (this.splitsChip) this.splitsChip.textContent = `分裂次数:${state.splits} · 键总数:${state.keyCount}`
    if (this.balanceChip) {
      const balanced = allLeavesSameDepth(state)
      const ordered = inOrderKeys(state)
      const strictlyOrdered = ordered.every((k, i) => i === 0 || ordered[i - 1]! < k)
      this.balanceChip.textContent = `平衡(叶子同层):${balanced ? '✓' : '✗'} · 中序有序:${strictlyOrdered ? '✓' : '✗'}`
      this.balanceChip.setAttribute('class', `tf-subnet-mono ${balanced && strictlyOrdered ? 'ok' : ''}`)
    }
    if (this.queryChip) {
      this.queryChip.textContent =
        state.searchedKey !== null
          ? `查询 ${state.searchedKey}:${state.found ? '命中 ✓' : '未命中 ✗'} · 路径 ${state.searchPath.length} 层`
          : ''
      this.queryChip.setAttribute('class', `tf-subnet-result ${state.found === false ? 'bad' : 'ok'}`)
    }
  }

  protected snapshotData(stepState: BTreeState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const ordered = inOrderKeys(state)
    return {
      rows: [
        { label: '键总数', value: String(state.keyCount), tone: 'accent' },
        { label: '树高(层)', value: `${state.height} 层 = ${state.height} 次磁盘 IO`, tone: 'success' },
        { label: '分裂次数', value: String(state.splits) },
        { label: '节点容量', value: `每节点 ≤ ${MAX_KEYS} 键(教学)` },
        { label: '中序遍历', value: `[${ordered.join(', ')}]`, tone: 'success' },
        { label: '平衡性', value: allLeavesSameDepth(state) ? '所有叶子同层 ✓' : '✗ 失衡!', tone: allLeavesSameDepth(state) ? 'success' : 'danger' },
        { label: '最近查询', value: state.searchedKey !== null ? `${state.searchedKey}:${state.found ? '命中' : '未命中'}(路径 ${state.searchPath.length} 层)` : '—', tone: state.found === true ? 'success' : state.found === false ? 'danger' : 'default' },
        { label: 'IO 对照', value: '二叉树 100 万数据 ≈ 20 层;B 树 3 层' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'insert',
        label: '插入一个键',
        description: '观察节点满时的分裂与键上提。',
        params: [{ name: 'key', label: '键值', type: 'number', min: 1, max: 99, placeholder: '18' }],
      },
      {
        name: 'search',
        label: '查询一个键',
        description: '高亮从根到叶的完整路径。',
        params: [{ name: 'key', label: '键值', type: 'number', min: 1, max: 99, placeholder: '15' }],
      },
      { name: 'load-seq', label: '载入递增序列(挑战)', description: '递增插入会让「最右路径」不断分裂 —— 观察树仍保持平衡。', danger: true },
      { name: 'reset', label: '复位为教学序列' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: BTreeState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'insert': {
        const key = Math.round(Number(params?.key ?? 0))
        if (Number.isFinite(key) && key >= 1 && key <= 99) apply(btreeInsert(base(), key))
        break
      }
      case 'search': {
        const key = Math.round(Number(params?.key ?? 0))
        if (Number.isFinite(key) && key >= 1 && key <= 99) apply(btreeSearch(base(), key))
        break
      }
      case 'load-seq': {
        let st = createBTreeState()
        for (let k = 1; k <= 8; k++) st = btreeInsert(st, k * 5)
        apply(st)
        break
      }
      case 'reset':
        this.live = null
        this.array = TEACHING_KEYS
        this.render(this.states.current, { animate: false, timeline: null, fromIndex: 0 })
        this.events.emit('data', this.getState())
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new BTreeIndexScene(),
}

export default sceneModule
