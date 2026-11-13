import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  QUERY_PRESETS,
  advanceQuery,
  createQueryState,
} from './model'
import type { QueryExecState, QueryKind } from './model'

/** MySQL 查询执行场景:聚簇树 + 二级树 + 回表箭头 + Buffer Pool 页命中 */

const VIEW = { width: 840, height: 620 }
const TREE = {
  clustered: { x: 80, label: '聚簇索引(叶子 = 整行)', y: 110 },
  secondary: { x: 480, label: '二级索引 idx_name(叶子 = name + id)', y: 110 },
}
const NODE_H = 30
const POOL_Y = 440

interface TreeNodeView {
  id: string
  x: number
  y: number
  keys: string[]
  tree: 'clustered' | 'secondary'
  isLeaf: boolean
}

/** 静态教学树(节点坐标手工布置) */
const CLUSTERED_NODES: TreeNodeView[] = [
  { id: 'R', x: 200, y: TREE.clustered.y, keys: ['10 | 30'], tree: 'clustered', isLeaf: false },
  { id: 'I1', x: 110, y: TREE.clustered.y + 80, keys: ['5 | 7'], tree: 'clustered', isLeaf: false },
  { id: 'I2', x: 290, y: TREE.clustered.y + 80, keys: ['15 | 20'], tree: 'clustered', isLeaf: false },
  { id: 'L10', x: 110, y: TREE.clustered.y + 160, keys: ['id10 · Alice'], tree: 'clustered', isLeaf: true },
  { id: 'L15', x: 200, y: TREE.clustered.y + 160, keys: ['id15 · Bob'], tree: 'clustered', isLeaf: true },
  { id: 'L30', x: 300, y: TREE.clustered.y + 160, keys: ['id30 · Carol'], tree: 'clustered', isLeaf: true },
]
const CLUSTERED_EDGES: Array<[string, string]> = [
  ['R', 'I1'], ['R', 'I2'], ['I1', 'L10'], ['I1', 'L15'], ['I2', 'L30'],
]

const SECONDARY_NODES: TreeNodeView[] = [
  { id: 'R2', x: 640, y: TREE.secondary.y, keys: ['Alice | Bob'], tree: 'secondary', isLeaf: false },
  { id: 'L2a', x: 560, y: TREE.secondary.y + 80, keys: ['Alice → id15'], tree: 'secondary', isLeaf: true },
  { id: 'L2b', x: 720, y: TREE.secondary.y + 80, keys: ['Bob → id15'], tree: 'secondary', isLeaf: true },
]
const SECONDARY_EDGES: Array<[string, string]> = [['R2', 'L2a'], ['R2', 'L2b']]

class MysqlQueryScene extends BaseScene<QueryExecState> {
  private poolCells: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }> = []
  private poolChips: SVGTextElement[] = []
  private backArrow: SVGPathElement | null = null
  private live: QueryExecState | null = null
  private poolWarm = false

  constructor() {
    super({ id: 'mysql-query', viewBox: VIEW, label: 'InnoDB 查询执行(主键/回表/覆盖)' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    for (const tree of [TREE.clustered, TREE.secondary]) {
      renderer.el('text', { x: tree.x + 40, y: tree.label === TREE.clustered.label ? tree.y - 46 : tree.y - 46, class: 'tf-label--accent' }, renderer.layerLabels)
        .textContent = tree.label
    }
    // Buffer Pool 面板
    renderer.el('rect', { x: 60, y: POOL_Y, width: 720, height: 120, rx: 12, class: 'tf-mem-block' }, renderer.layerLabels)
    renderer.el('text', { x: 76, y: POOL_Y + 26, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      'Buffer Pool(内存中的数据页缓存;16KB/页)'
    renderer.el('text', { x: 76, y: POOL_Y + 50, class: 'tf-label--muted' }, renderer.layerLabels).textContent = '已缓存页:'
    this.poolCells = []
    for (let i = 0; i < 4; i++) {
      const g = renderer.el('g', {}, renderer.layerNodes)
      const x = 76 + i * 175
      const rect = renderer.el('rect', { x, y: POOL_Y + 62, width: 160, height: 36, rx: 7, class: 'tf-jvm-frame', 'stroke-dasharray': '4 3' }, g)
      const text = renderer.el('text', { x: x + 80, y: POOL_Y + 85, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, g)
      g.style.opacity = '0'
      this.poolCells.push({ g, rect, text })
    }
    this.poolChips = []
    const stats = ['Buffer Pool 命中', '磁盘读(未命中)', '回表次数']
    stats.forEach((s, i) => {
      renderer.el('text', { x: 76 + i * 180, y: POOL_Y + 114, class: 'tf-label--muted' }, renderer.layerLabels).textContent = s
      const v = renderer.el('text', { x: 300 + i * 150, y: POOL_Y + 114, 'text-anchor': 'end', class: 'tf-subnet-mono' }, renderer.layerLabels)
      this.poolChips.push(v)
    })

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 6, text: '主键查询:一次树遍历;二级索引:两次(回表);覆盖索引:一树搞定免回表', kind: 'muted' })
  }

  protected buildSteps() {
    const kind = this.poolWarm ? this.lastKind() : 'pk'
    const preset = QUERY_PRESETS[kind]
    const steps: SceneStep[] = [
      {
        id: 'preset',
        title: preset.label,
        description: preset.sql,
        explanation: `查询形态决定 InnoDB 的工作量。**主键查询**走聚簇 B+Tree 一步直达(叶子即整行);**二级索引查询**要「回表」—— 先查二级树拿主键,再回聚簇树取整行(两次树遍历);**覆盖索引**让查询列全部落在二级索引里,**免回表**,只查一棵树。点击下一步逐步执行。`,
        duration: 1200,
        action: 'preset',
      },
    ]
    const transitions: StepTransition<QueryExecState>[] = [() => createQueryState(kind, this.poolWarm)]

    let st = createQueryState(kind, this.poolWarm)
    let guard = 0
    while (!st.done && guard < 20) {
      const before = st
      st = advanceQuery(st)
      const step = before.steps[before.activeStep] ?? before.steps[before.steps.length - 1]!
      steps.push({
        id: `step-${steps.length}`,
        title: step.label,
        description: step.detail,
        explanation: this.explainFor(step.label, step.poolHit),
        duration: 1000,
        action: step.label,
      })
      transitions.push(s0 => advanceQuery(s0))
      guard++
    }

    steps.push({
      id: 'conclusion',
      title: '代价对照:三种查询形态',
      description: '主键 1 棵树 · 二级索引 2 棵树(回表)· 覆盖索引 1 棵树',
      explanation: `**回表次数随结果集线性放大**:命中 1000 行的二级索引查询要回表 1000 次!优化套路:① 只查需要的列(可能触发覆盖索引);② 联合索引把高频列都放进去;③ EXPLAIN 看 Extra 是否出现 **Using index**(覆盖生效)。冷查询还有 Buffer Pool 未命中的磁盘 IO 代价(本实验可对照)。`,
      duration: 1300,
      action: 'conclusion',
    })
    transitions.push(s => ({ ...s, log: [...s.log, '代价总结:主键 1 树 < 覆盖 1 树(免回表)< 二级 2 树(回表)'] }))

    return { steps, transitions }
  }

  private lastKind(): QueryKind {
    return (this.live ?? this.states.current).kind
  }

  private explainFor(label: string, poolHit: boolean | null): string {
    const poolNote = poolHit === null ? '' : poolHit ? '该数据页已在 Buffer Pool(内存命中,微秒级)。' : '该数据页不在 Buffer Pool → **磁盘读取**(毫秒级,差百倍)。'
    if (label.includes('回表')) {
      return `**回表**:二级索引叶子只存「索引列 + 主键」,不含其他列 —— 要取整行,必须拿主键**回聚簇索引再查一遍**。命中 N 行就回 N 次表;这也是 \`SELECT *\` 比指定列慢的深层原因。${poolNote}`
    }
    if (label.includes('Buffer Pool')) {
      return poolNote + 'Buffer Pool 满了按 LRU 变体淘汰冷页 —— 预防全表扫描冲掉热数据是 InnoDB 的重点工程。'
    }
    if (label.includes('覆盖') || label.includes('Using index')) {
      return '**覆盖索引**:查询要的列全部在二级索引的叶子里(name + 主键 id),无需回聚簇索引 —— EXPLAIN 的 Extra 显示 **Using index**。联合索引是制造覆盖索引的主要手段。'
    }
    if (label.includes('聚簇') || label.includes('主键')) {
      return '聚簇 B+Tree 的叶子**就是整行数据** —— 主键查询一次树遍历直达,是 InnoDB 最快的查询形态。'
    }
    return '按执行计划逐步推进 —— 每步的代价都体现在右侧面板。'
  }

  protected buildInitialState(): QueryExecState {
    return createQueryState('pk', this.poolWarm)
  }

  private effectiveState(stepState: QueryExecState): QueryExecState {
    return this.live ?? stepState
  }

  protected render(stepState: QueryExecState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const renderer = this.renderer
    if (!renderer) return
    void opts
    void tl_unused(state)

    renderer.clear('nodes')
    renderer.clear('links')
    renderer.clear('overlay')

    const activeStep = state.steps[Math.min(state.activeStep, state.steps.length - 1)]
    const visibleTrees = new Set<string>()
    if (state.steps.length > 0) {
      state.steps.slice(0, state.activeStep + 1).forEach(st => {
        if (st.tree) visibleTrees.add(st.tree)
      })
      if (state.steps[0] && state.steps[0].tree === null) {
        // 初始步骤也显示两棵树框架(淡)
      }
      visibleTrees.add('clustered')
      if (state.kind !== 'pk') visibleTrees.add('secondary')
    }

    const drawTree = (nodes: TreeNodeView[], edges: Array<[string, string]>, visible: boolean) => {
      if (!visible) return
      for (const n of nodes) {
        const onPath = activeStep && state.steps[state.activeStep]?.path.includes(n.id)
        // 叶节点文字长(id15 · Bob),加宽到 128;非叶节点按键数计宽
        const w = n.isLeaf ? 124 : n.keys.length * 60 + 16
        const g = renderer.el('g', { transform: `translate(${n.x} ${n.y})` }, renderer.layerNodes)
        renderer.el('rect', {
          width: w, height: NODE_H + 8, rx: 8,
          class: `tf-jvm-frame ${onPath ? 'is-top' : ''}`,
        }, g)
        n.keys.forEach((k, i) => {
          renderer.el('text', {
            x: (n.isLeaf ? w / 2 : 8 + i * 60 + 28), y: NODE_H / 2 + 6, 'text-anchor': 'middle', class: 'tf-subnet-mono',
          }, g).textContent = k
        })
      }
      for (const [a, b] of edges) {
        const na = nodes.find(n => n.id === a)!
        const nb = nodes.find(n => n.id === b)!
        renderer.el('path', {
          d: `M ${na.x + 40} ${na.y + 38} L ${nb.x + 40} ${nb.y - 4}`,
          class: 'tf-link',
        }, renderer.layerLinks)
      }
    }

    drawTree(CLUSTERED_NODES, CLUSTERED_EDGES, visibleTrees.has('clustered'))
    drawTree(SECONDARY_NODES, SECONDARY_EDGES, visibleTrees.has('secondary'))

    // 回表箭头(二级叶子 → 聚簇叶子)
    const showBack = state.backToTable > 0 && state.steps.slice(0, state.activeStep + 1).some(st => st.label.includes('回表'))
    if (this.backArrow) {
      this.backArrow.style.opacity = showBack ? '1' : '0'
    }

    // Buffer Pool 页
    const pageKeys = ['clustered/leaf-15', 'secondary/leaf-2a', 'clustered/R', 'clustered/I1']
    this.poolCells.forEach((cell, i) => {
      if (!cell) return
      const key = pageKeys[i]!
      const cached = state.poolPages.includes(key)
      const target = cached ? '1' : '0'
      if (cell.text) cell.text.textContent = key
      if (cell.rect) cell.rect.setAttribute('class', `tf-jvm-frame ${cached ? 'is-top' : ''}`)
      cell.g.style.opacity = target
    })

    const statValues = [
      `${state.poolHits} 次`,
      `${state.diskReads} 次`,
      `${state.backToTable} 次`,
    ]
    this.poolChips.forEach((el, i) => {
      el.textContent = statValues[i] ?? ''
    })
  }

  protected snapshotData(stepState: QueryExecState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const cmp = { pk: '1 棵树', secondary: '2 棵树(回表)', covering: '1 棵树(免回表)' }
    return {
      rows: [
        { label: '查询形态', value: QUERY_PRESETS[state.kind].label, tone: 'accent' },
        { label: 'SQL', value: QUERY_PRESETS[state.kind].sql },
        { label: 'EXPLAIN type', value: QUERY_PRESETS[state.kind].explainType },
        { label: '树遍历次数', value: cmp[state.kind], tone: state.kind === 'secondary' ? 'warning' : 'success' },
        { label: '回表次数', value: String(state.backToTable), tone: state.backToTable ? 'danger' : 'success' },
        { label: 'Buffer Pool 命中', value: `${state.poolHits} 次`, tone: 'success' },
        { label: '磁盘读', value: `${state.diskReads} 次`, tone: state.diskReads ? 'warning' : 'success' },
        { label: '扫描/返回', value: `${state.rowsExamined} / ${state.rowsReturned}` },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'query-pk', label: '主键查询(一步直达)' },
      { name: 'query-secondary', label: '二级索引查询(回表)', description: '两次树遍历 —— 结果集越大代价越大。' },
      { name: 'query-covering', label: '覆盖索引查询(免回表)', description: '只查一棵树,EXPLAIN 显示 Using index。' },
      { name: 'warm-pool', label: '预热 Buffer Pool', description: '相关数据页已在内存 → 免磁盘 IO。' },
      { name: 'cold-pool', label: '冷查询(有磁盘 IO)', danger: true },
    ]
  }

  performAction(name: string): void {
    switch (name) {
      case 'query-pk':
        this.rebuildWith('pk', this.poolWarm)
        break
      case 'query-secondary':
        this.rebuildWith('secondary', this.poolWarm)
        break
      case 'query-covering':
        this.rebuildWith('covering', this.poolWarm)
        break
      case 'warm-pool':
        this.rebuildWith(this.lastKind(), true)
        break
      case 'cold-pool':
        this.rebuildWith(this.lastKind(), false)
        break
      default:
        break
    }
  }

  private rebuildWith(kind: QueryKind, poolWarm: boolean): void {
    this.poolWarm = poolWarm
    const built = this.buildSteps()
    this.stepDefs = built.steps
    this.live = createQueryState(kind, poolWarm)
    this.render(this.live, { animate: false, timeline: null, fromIndex: 0 })
    this.events.emit('data', this.getState())
    void built
  }
}

function tl_unused(_s: QueryExecState): void {}

const sceneModule: SceneModule = {
  create: () => new MysqlQueryScene(),
}

export default sceneModule
