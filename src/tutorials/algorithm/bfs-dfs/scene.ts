import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { TEACHING_GRAPH, createTraversalState, traversalStep } from './model'
import type { TraversalMode, TraversalState } from './model'

/** BFS/DFS 场景:同一张图,队列 vs 栈容器面板决定遍历顺序 */

const VIEW = { width: 840, height: 620 }

class BfsDfsScene extends BaseScene<TraversalState> {
  private containerTitle: SVGTextElement | null = null
  private containerCells: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }> = []
  private visitedChip: SVGTextElement | null = null
  private modeChip: SVGTextElement | null = null
  private live: TraversalState | null = null

  constructor() {
    super({ id: 'bfs-dfs', viewBox: VIEW, label: 'BFS 与 DFS 图遍历' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // 图区域(左)
    new Label(renderer, { x: 60, y: 40, text: '图(访问过的变绿,树边加粗)', kind: 'accent', anchor: 'start' })

    // 容器面板(右)
    new Label(renderer, { x: 640, y: 40, text: '待访问容器', kind: 'accent', anchor: 'start' })
    this.modeChip = renderer.el('text', { x: 640, y: 64, class: 'tf-tcp-state' }, renderer.layerLabels)
    this.containerTitle = renderer.el('text', { x: 640, y: 92, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.containerCells = []
    for (let i = 0; i < 8; i++) {
      const g = renderer.el('g', {}, renderer.layerNodes)
      const y = 110 + i * 44
      const rect = renderer.el('rect', { x: 640, y, width: 150, height: 36, rx: 7, class: 'tf-jvm-frame' }, g)
      const text = renderer.el('text', { x: 715, y: y + 23, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g)
      g.style.opacity = '0'
      this.containerCells.push({ g, rect, text })
    }
    this.visitedChip = renderer.el('text', { x: 640, y: 480, class: 'tf-subnet-mono' }, renderer.layerLabels)

    new Label(renderer, { x: 640, y: 510, text: 'BFS:队头出、队尾进(FIFO)', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 640, y: 534, text: 'DFS:栈顶出、栈顶进(LIFO)', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 640, y: 558, text: '同框架,只差容器 —— 顺序天差地别', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 6, text: '问「最近/最少步数」用队列(BFS);问「有没有/枚举路径」用栈(DFS 回溯)', kind: 'muted' })
  }

  protected buildSteps() {
    const mode = this.live?.mode ?? 'BFS'
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: mode === 'BFS' ? 'BFS:容器 = 队列' : 'DFS:容器 = 栈',
        description: `从 ${this.startNode(mode)} 开始遍历。`,
        explanation: mode === 'BFS'
          ? '**BFS(广度优先)** 的容器是**队列**:先访问的节点的邻居先被处理 —— 访问顺序按到起点的**跳数分层**。核心性质:**无权图中第一次到达某节点时,路径就是最短的**。队列里可能同时装着一整层的节点,空间 O(宽度)。'
          : '**DFS(深度优先)** 的容器是**栈**:最新发现的邻居先被处理 —— 一条路走到底,走不通再**回溯**(递归写法就是隐式栈)。栈里只存当前路径,空间 O(深度);但找到的路径**不保证最短**。',
        duration: 1200,
        action: 'init',
      },
    ]
    const transitions: StepTransition<TraversalState>[] = [() => createTraversalState(mode, "A")]

    let st = createTraversalState(mode, 'A')
    let guard = 0
    let stepNo = 1
    while (!st.done && guard < 40) {
      const before = st
      st = traversalStep(st)
      stepNo += 1
      const node = st.visited[st.visited.length - 1] ?? '?'
      steps.push({
        id: `step-${stepNo}`,
        title: `访问 ${node}(第 ${st.visited.length} 个)`,
        description: st.log.filter(l => l.includes('访问')).slice(-1)[0] ?? '',
        explanation: mode === 'BFS'
          ? `从队列**队头**取出 ${node} 访问(队头 = 离起点最近的那一层)。它的未标记邻居按序**入队尾** —— 下一波处理的就是「距离 +1」的层。这就是 BFS **按层扩散** 的机制,也是无权图最短路径的保证。`
          : `从栈**顶**取出 ${node} 访问(栈顶 = 最新发现的节点)。它的未标记邻居**压栈** —— 下一步会深入其中一个,一条路走到底再回溯。DFS **不保证最短路径**,但擅长枚举所有路径与回溯类问题。`,
        duration: 950,
        action: st.mode,
      })
      transitions.push(s => traversalStep(s))
      st = st
      void before
    }

    steps.push({
      id: 'conclusion',
      title: '遍历完成:顺序对照',
      description: `访问顺序:[${st.visited.join(' → ')}]`,
      explanation: `同一个图、同一个框架,仅因容器不同,访问顺序完全不同。**问「最近/最少步数」用队列(BFS);问「有没有/枚举所有路径」用栈(DFS 回溯)**。切到另一种模式再跑一遍,对照右侧容器行为与访问顺序。`,
      duration: 1200,
      action: 'conclusion',
    })
    transitions.push(s => ({ ...s, log: [...s.log, `访问顺序:[${st.visited.join(' → ')}]`] }))

    return { steps, transitions }
  }

  private startNode(mode: TraversalMode): string {
    return createTraversalState(mode, 'A').start
  }

  protected buildInitialState(): TraversalState {
    return createTraversalState(this.live?.mode ?? 'BFS', 'A')
  }

  private effectiveState(stepState: TraversalState): TraversalState {
    return this.live ?? stepState
  }

  protected render(stepState: TraversalState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const renderer = this.renderer
    if (!renderer) return
    const tl = opts.timeline

    renderer.clear('nodes')
    renderer.clear('links')
    renderer.clear('labels')
    renderer.clear('overlay')

    // 边
    const drawn = new Set<string>()
    for (const [id, nbs] of Object.entries(state.graph)) {
      for (const nb of nbs) {
        const key = [id, nb].sort().join('-')
        if (drawn.has(key)) continue
        drawn.add(key)
        const a = state.positions[id]!
        const b = state.positions[nb]!
        const isTreeEdge = state.treeEdges.some(([x, y]) => (x === id && y === nb) || (x === nb && y === id))
        const isCurrent = state.currentEdge && ((state.currentEdge[0] === id && state.currentEdge[1] === nb) || (state.currentEdge[0] === nb && state.currentEdge[1] === id))
        renderer.el('path', {
          d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
          class: isCurrent ? 'tf-bar-link is-swap' : isTreeEdge ? 'tf-bar-link is-sorted' : 'tf-link tf-link--dashed',
        }, renderer.layerLinks)
      }
    }

    // 节点
    for (const [id, n] of Object.entries(state.positions)) {
      const visited = state.visited.includes(id)
      const marked = state.marked.includes(id)
      const g = renderer.el('g', { transform: `translate(${n.x - 24} ${n.y - 24})` }, renderer.layerNodes)
      renderer.el('circle', {
        cx: 24, cy: 24, r: 24,
        class: visited ? 'tf-jvm-gen is-race' : marked ? 'tf-jvm-gen' : 'tf-jvm-gen',
        style: visited
          ? 'fill: color-mix(in srgb, var(--success) 22%, var(--bg-panel)); stroke: var(--success); stroke-width: 2'
          : marked
            ? 'fill: color-mix(in srgb, var(--warning) 18%, var(--bg-panel)); stroke: var(--warning)'
            : undefined,
      }, g)
      renderer.el('text', { x: 24, y: 29, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g).textContent = id
    }

    // 容器面板
    if (this.modeChip) {
      this.modeChip.textContent = state.mode
      this.modeChip.setAttribute('class', `tf-tcp-state ${state.mode === 'BFS' ? 'tf-tcp-state--active' : 'tf-tcp-state--warning'}`)
    }
    if (this.containerTitle) {
      this.containerTitle.textContent = state.mode === 'BFS' ? '队列(队头 → 队尾)' : '栈(底 → 顶)'
    }
    for (let i = 0; i < this.containerCells.length; i++) {
      const cell = this.containerCells[i]
      if (!cell) continue
      // BFS:队头在下标 0(底部);DFS:栈顶在下标 0(顶部)
      let item: string | undefined
      if (state.mode === 'BFS') item = state.frontier[i]
      else item = state.frontier[state.frontier.length - 1 - i]
      const target = item !== undefined ? '1' : '0'
      if (cell.text) cell.text.textContent = item ?? ''
      void tl
      cell.g.style.opacity = target
    }

    if (this.visitedChip) {
      this.visitedChip.textContent = state.visited.length ? `已访问(${state.visited.length}):${state.visited.join(' → ')}` : '已访问:(空)'
    }
  }

  protected snapshotData(stepState: TraversalState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const mode = state.mode
    return {
      rows: [
        { label: '遍历模式', value: mode, tone: mode === 'BFS' ? 'accent' : 'warning' },
        { label: '容器', value: mode === 'BFS' ? '队列(FIFO)' : '栈(LIFO)' },
        { label: '起点', value: state.start },
        { label: '容器内容', value: state.frontier.length ? state.frontier.join(' | ') : '(空)', tone: 'warning' },
        { label: '已访问', value: `${state.visited.length} 个:${state.visited.join(' → ')}`, tone: 'success' },
        { label: '访问顺序', value: state.visited.join(' → ') || '(未开始)', tone: 'accent' },
        { label: '最短路径保证', value: mode === 'BFS' ? '✓ 无权图最短' : '✗ 不保证(可能绕远)', tone: mode === 'BFS' ? 'success' : 'danger' },
        { label: '空间复杂度', value: mode === 'BFS' ? 'O(宽度)' : 'O(深度)' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'switch-bfs', label: '切到 BFS(队列)' },
      { name: 'switch-dfs', label: '切到 DFS(栈)' },
      { name: 'step', label: '推进一步' },
      {
        name: 'set-start',
        label: '换起点',
        params: [
          {
            name: 'start',
            label: '起点',
            type: 'select',
            options: Object.keys(TEACHING_GRAPH).map(n => ({ value: n, label: n })),
          },
        ],
      },
      { name: 'reset', label: '复位' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const apply = (next: TraversalState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'switch-bfs':
        apply(createTraversalState('BFS', 'A'))
        break
      case 'switch-dfs':
        apply(createTraversalState('DFS', 'A'))
        break
      case 'step':
        apply(traversalStep(this.effectiveState(this.states.current)))
        break
      case 'set-start': {
        const start = String(params?.start ?? 'A')
        if (TEACHING_GRAPH[start]) {
          const mode = this.effectiveState(this.states.current).mode
          apply(createTraversalState(mode, start))
        }
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

const sceneModule: SceneModule = {
  create: () => new BfsDfsScene(),
}

export default sceneModule
