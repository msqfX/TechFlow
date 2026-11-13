import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import type { GsapTimeline } from '@/engine/types/animation'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  TEACHING_EDGES,
  TEACHING_NODES,
  createDijkstraState,
  dijkstraStep,
  pathTo,
} from './model'
import type { DijkstraState } from './model'

/** Dijkstra 场景:带权图 + dist 标签 + 优先队列面板 + 距离表 */

const VIEW = { width: 840, height: 620 }

class DijkstraScene extends BaseScene<DijkstraState> {
  private distChips = new Map<string, SVGTextElement>()
  private settledChip: SVGTextElement | null = null
  private queueChips: SVGTextElement[] = []
  private pathChip: SVGTextElement | null = null
  private live: DijkstraState | null = null

  constructor() {
    super({ id: 'dijkstra', viewBox: VIEW, label: 'Dijkstra 带权最短路径' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // 边(含权重)
    for (const e of TEACHING_EDGES) {
      const a = TEACHING_NODES.find(n => n.id === e.from)!
      const b = TEACHING_NODES.find(n => n.id === e.to)!
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      renderer.el('path', { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, class: 'tf-link tf-link--dashed' }, renderer.layerLinks)
      renderer.el('rect', { x: mx - 16, y: my - 14, width: 32, height: 24, rx: 6, class: 'tf-label-pill-bg' }, renderer.layerLinks)
      renderer.el('text', { x: mx, y: my + 5, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, renderer.layerLinks).textContent = String(e.weight)
    }

    // 节点(每帧重绘以更新 dist 标签)
    for (const n of TEACHING_NODES) {
      const node = new NetworkNodeShim(renderer, n.id, n.x, n.y, n.label)
      this.distChips.set(n.id, node.distChip)
    }

    new Label(renderer, { x: 60, y: 40, text: '贪心:每轮取 dist 最小的未定节点 → 松弛邻居 → 敲定', kind: 'accent', anchor: 'start' })
    this.settledChip = renderer.el('text', { x: 60, y: 64, class: 'tf-subnet-mono' }, renderer.layerLabels)

    // 优先队列面板
    new Label(renderer, { x: 700, y: 40, text: '优先队列(dist 排序)', kind: 'accent', anchor: 'start' })
    this.queueChips = []
    for (let i = 0; i < 6; i++) {
      const chip = renderer.el('text', { x: 760, y: 68 + i * 30, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, renderer.layerLabels)
      this.queueChips.push(chip)
    }

    this.pathChip = renderer.el('text', { x: VIEW.width / 2, y: VIEW.height - 24, 'text-anchor': 'middle', class: 'tf-subnet-result' }, renderer.layerLabels)
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 6, text: '对照 BFS:队列 → 优先队列;负权边会让贪心失效(Bellman-Ford 补位)', kind: 'muted' })
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: '起点 A:dist=0,其余 ∞',
        description: '优先队列就绪 —— 每轮取 dist 最小的未定节点。',
        explanation: `BFS 用普通队列(跳数),Dijkstra 用**优先队列**(累计权重)。规则:**每轮取 dist 最小的未定节点 u,敲定它,然后松弛 u 的所有邻居**(dist[v] > dist[u]+w 时更新)。前提:**边权非负** —— 这样「当前最小」不可能再被绕路改进,贪心才正确。`,
        duration: 1300,
        action: 'init',
      },
    ]
    const transitions: StepTransition<DijkstraState>[] = [() => createDijkstraState('A')]

    let st = createDijkstraState('A')
    let guard = 0
    let round = 1
    while (!st.done && guard < 20) {
      const before = st
      st = dijkstraStep(st)
      const u = st.currentNode
      if (st.settled.length > before.settled.length) {
        const relaxed = st.log.slice(before.log.length - st.log.length).filter(l => l.includes('松弛'))
        steps.push({
          id: `round-${round}`,
          title: `第 ${round} 轮:确定 ${u ?? '?'}(dist=${u ? fmt(before.dist[u] ?? 0) : '?'})`,
          description: relaxed.join(' ') || '无可改进的邻居',
          explanation: `**敲定 ${u}**:它的 dist 已是全局最小,任何绕路只会更贵(边权非负)—— 不再回头。接着**松弛**它的邻居:凡是通过 u 能更短到达的,更新 dist 并记录前驱。下一轮优先队列重新按 dist 排序取最小。`,
          duration: 1100,
          action: 'dijkstra',
        })
        round += 1
        transitions.push(s0 => dijkstraStep(s0))
      }
      guard++
    }

    // 路径回溯
    const targetDist = st.dist['F'] ?? Number.POSITIVE_INFINITY
    if (targetDist !== Number.POSITIVE_INFINITY) {
      steps.push({
        id: 'path',
        title: `最短路径 A → F:总代价 ${targetDist}`,
        description: '沿前驱(prev)回溯得到路径。',
        explanation: `距离表 + 前驱表就是 Dijkstra 的全部输出:**沿 prev 从终点回溯**得到最短路径。对照 BFS:如果把所有边权当作 1,BFS 就是 Dijkstra 的特例 —— 优先队列退化为普通队列。`,
        duration: 1200,
        action: 'path',
      })
      transitions.push(s0 => ({ ...s0, log: [...s0.log, `最短路径 A→F:${pathTo(s0, 'F').join(' → ')},总代价 ${s0.dist['F']}`] }))
    }

    steps.push({
      id: 'conclusion',
      title: '负权边警告',
      description: '若某条边为负,贪心失效。',
      explanation: `若存在负权边,「当前最小不可能再改进」不再成立 —— Dijkstra 会给出错误答案。对策:**Bellman-Ford**(逐轮松弛全部边,O(V·E),可检测负环)。现实场景(延迟/距离/价格)极少负权,Dijkstra 是默认选择。`,
      duration: 1200,
      action: 'conclusion',
    })
    transitions.push(s0 => ({ ...s0, log: [...s0.log, '警告:负权边会破坏贪心前提 —— 需 Bellman-Ford'] }))

    return { steps, transitions }
  }

  protected buildInitialState(): DijkstraState {
    return createDijkstraState('A')
  }

  private effectiveState(stepState: DijkstraState): DijkstraState {
    return this.live ?? stepState
  }

  protected render(stepState: DijkstraState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const renderer = this.renderer
    if (!renderer) return
    void opts
    void tl_noop(state)

    renderer.clear('nodes')
    renderer.clear('labels')
    renderer.clear('overlay')

    for (const n of TEACHING_NODES) {
      const settled = state.settled.includes(n.id)
      const isCurrent = state.currentNode === n.id
      const g = renderer.el('g', { transform: `translate(${n.x - 24} ${n.y - 24})` }, renderer.layerNodes)
      renderer.el('circle', {
        cx: 24, cy: 24, r: 24,
        class: `tf-jvm-gen ${settled ? 'is-sorted' : isCurrent ? 'is-race' : ''}`,
        style: settled
          ? 'fill: color-mix(in srgb, var(--success) 22%, var(--bg-panel)); stroke: var(--success); stroke-width: 2.5'
          : isCurrent
            ? 'fill: color-mix(in srgb, var(--warning) 22%, var(--bg-panel)); stroke: var(--warning); stroke-width: 2.5'
            : undefined,
      }, g)
      renderer.el('text', { x: 24, y: 29, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g).textContent = n.label
      const dist = state.dist[n.id] ?? Number.POSITIVE_INFINITY
      const chip = this.distChips.get(n.id)
      if (chip) {
        chip.textContent = `dist = ${dist === Number.POSITIVE_INFINITY ? '∞' : dist}${settled ? ' ✓' : ''}`
        chip.setAttribute('x', String(n.x))
        chip.setAttribute('y', String(n.y + 48))
        chip.setAttribute('class', `tf-subnet-mono ${settled ? 'ok' : ''}`)
      }
    }

    // 松弛边高亮
    if (state.currentEdge) {
      const a = TEACHING_NODES.find(n => n.id === state.currentEdge![0])!
      const b = TEACHING_NODES.find(n => n.id === state.currentEdge![1])!
      renderer.el('path', {
        d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
        class: 'tf-bar-link is-swap',
      }, renderer.layerOverlay)
    }

    if (this.settledChip) {
      this.settledChip.textContent = state.settled.length ? `已确定:${state.settled.join(', ')}` : '已确定:(无)'
    }
    // 优先队列(未定节点按 dist 排序前 6)
    const queue = state.nodes
      .filter(n => !state.settled.includes(n.id))
      .sort((a, b) => (state.dist[a.id] ?? Infinity) - (state.dist[b.id] ?? Infinity))
    this.queueChips.forEach((chip, i) => {
      const n = queue[i]
      chip.textContent = n ? `${n.label}: ${fmtD(state.dist[n.id] ?? Infinity)}` : ''
    })
    if (this.pathChip) {
      const p = state.done ? pathTo(state, 'F') : []
      this.pathChip.textContent = p.length ? `最短路径 A→F:${p.join(' → ')}(代价 ${state.dist['F']})` : ''
    }
  }

  protected snapshotData(stepState: DijkstraState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const distRows = TEACHING_NODES.map(n => ({
      label: `dist ${n.label}`,
      value: fmtD(state.dist[n.id] ?? Infinity),
      tone: state.settled.includes(n.id) ? ('success' as const) : ('default' as const),
    }))
    return {
      rows: [
        { label: '起点', value: state.start, tone: 'accent' },
        { label: '已确定', value: `${state.settled.length} / ${state.nodes.length}` },
        ...distRows,
        { label: '比较/松弛', value: `贪心 + 松弛(边权非负前提)` },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }

    function fmtD(d: number): string {
      return d === Number.POSITIVE_INFINITY ? '∞' : String(d)
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'step', label: '推进一轮(取最小 + 松弛)' },
      {
        name: 'set-start',
        label: '换起点',
        params: [
          {
            name: 'start',
            label: '起点',
            type: 'select',
            options: TEACHING_NODES.map(n => ({ value: n.id, label: n.label })),
          },
        ],
      },
      { name: 'reset', label: '复位' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const apply = (next: DijkstraState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'step':
        apply(dijkstraStep(this.effectiveState(this.states.current)))
        break
      case 'set-start': {
        const start = String(params?.start ?? 'A')
        if (TEACHING_NODES.some(n => n.id === start)) apply(createDijkstraState(start))
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

function fmt(v: number): string {
  return v === Number.POSITIVE_INFINITY ? '∞' : String(v)
}
function fmtD(d: number): string {
  return d === Number.POSITIVE_INFINITY ? '∞' : String(d)
}
function tl_noop(_s: DijkstraState): void {}

/** 轻量节点包装(圆 + dist 标签),与 NetworkNode 独立(每帧重绘) */
class NetworkNodeShim {
  distChip: SVGTextElement
  constructor(renderer: SVGRenderer, _id: string, x: number, y: number, label: string) {
    renderer.el('circle', { cx: x, cy: y, r: 26, class: 'tf-jvm-frame' }, renderer.layerNodes)
    const t = renderer.el('text', { x, y: y + 5, 'text-anchor': 'middle', class: 'tf-cpu-value' }, renderer.layerNodes)
    t.textContent = label
    this.distChip = renderer.el('text', { x, y: y + 52, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, renderer.layerLabels)
  }
}

const sceneModule: SceneModule = {
  create: () => new DijkstraScene(),
}

export default sceneModule
