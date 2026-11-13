import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { checkRbProperties, createRbState, rbFixupStep, rbInsert, rbHeight } from './model'
import type { RbState } from './model'

/** 红黑树场景:复用树形重绘;红/黑着色 + 修复步骤逐步(变色/旋转) */

const VIEW = { width: 840, height: 560 }
const TOP = 150
const LEVEL_H = 110
const NODE_R = 22
const TEACHING_KEYS = [10, 20, 30, 15, 25, 5]

class RedBlackTreeScene extends BaseScene<RbState> {
  private propsChip: SVGTextElement | null = null
  private actionChip: SVGTextElement | null = null
  private heightChip: SVGTextElement | null = null
  private live: RbState | null = null

  constructor() {
    super({ id: 'red-black-tree', viewBox: VIEW, label: '红黑树插入修复(变色与旋转)' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    new Label(renderer, { x: 60, y: 46, text: '五性质:根黑 · 红不相连 · 黑高一致(NIL 视为黑)', kind: 'accent', anchor: 'start' })
    this.propsChip = renderer.el('text', { x: 60, y: 74, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.heightChip = renderer.el('text', { x: 60, y: 98, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.actionChip = renderer.el('text', { x: VIEW.width - 60, y: 74, 'text-anchor': 'end', class: 'tf-subnet-result' }, renderer.layerLabels)
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '插入恒红 → 父红即修复:叔红变色上移;叔黑旋转(LL/RR/LR/RL)', kind: 'muted' })
  }

  protected buildSteps() {
    const arr = TEACHING_KEYS
    const steps: SceneStep[] = [
      {
        id: 'intro',
        title: '空树就绪',
        description: `将依次插入 [${arr.join(', ')}] —— 重点观察变色与旋转。`,
        explanation: `红黑树 = BST + 节点颜色 + 五条性质(右侧面板实时校验)。**插入总是红色节点**;若父节点也是红,违反「红不相连」→ 按**叔叔颜色**修复:叔红 → 变色上移;叔黑 → 旋转(LL/RR/LR/RL 四种几何形态)。这是 BST 退化问题的标准答案:性质 4+5 把树高钉在 O(log n)。`,
        duration: 1200,
        action: 'intro',
      },
    ]
    const transitions: StepTransition<RbState>[] = [s0 => (s0.keyCount === 0 ? s0 : s0)]
    void transitions

    let st = createRbState()
    for (const key of arr) {
      const before = st
      st = rbInsert(st, key)
      steps.push({
        id: `ins-${key}`,
        title: `插入 ${key}(红)`,
        description: st.log[st.log.length - 1] ?? '',
        explanation: `BST 规则下降挂到空位,涂**红色**(插黑会破坏黑高,更难修)。若父节点为黑则万事大吉;为红则进入修复流程 —— 下一步逐步执行变色与旋转。`,
        duration: 950,
        action: 'insert',
      })
      transitions.push(s0 => rbInsert(s0, key))
      // 修复步(逐步)
      let guard = 0
      let fixSt = st
      while (fixSt.fixupId !== null && guard < 10) {
        const beforeFix = fixSt
        fixSt = rbFixupStep(fixSt)
        if (fixSt.log.length > beforeFix.log.length) {
          const logLine = fixSt.log[fixSt.log.length - 1] ?? ''
          const action = fixSt.lastAction
          steps.push({
            id: `fix-${key}-${guard}`,
            title: action === 'recolor' ? '修复:变色(叔红)' : action === 'rotate-left' ? '修复:左旋' : action === 'rotate-right' ? '修复:右旋' : '修复完成',
            description: logLine,
            explanation: action === 'recolor'
              ? '**叔红 → 变色上移**:父与叔都变黑(消除红红冲突),祖父变红(维持黑高)—— 问题上移到祖父继续检查;若祖父是根,涂黑即结束。'
              : action === 'rotate-left' || action === 'rotate-right'
                ? '**叔黑 → 旋转**:LL/RR 一步旋祖父(父变黑、祖父变红);LR/RL 先旋父转正形态再旋祖父。旋转只改三个指针,**搜索性质完全保留**,修复即终止。'
                : '修复收敛:五性质重新满足(右侧面板全 ✓)。',
            duration: 950,
            action: 'fix',
          })
          transitions.push(s0 => rbFixupStep(s0))
        }
        st = fixSt
        guard++
      }
      void before
    }

    steps.push({
      id: 'conclusion',
      title: '校验:五性质全部满足',
      description: '根黑 ✓ · 红不相连 ✓ · 黑高一致 ✓ → 树高被钉在 O(log n)。',
      explanation: `对照《BST》:同样这些键,BST 可能退化成链表(O(n));红黑树靠**插入时的变色与旋转**把树高钉在 O(log n),且旋转次数远少于 AVL —— Java TreeMap、epoll、CFS 调度器的共同选择。`,
      duration: 1200,
      action: 'conclusion',
    })
    transitions.push(s0 => ({ ...s0, log: [...s0.log, `中序:${inOrderKeys(s0).join(', ')} 有序 ✓;树高 ${rbHeight(s0)}`] }))

    return { steps, transitions }
  }

  protected buildInitialState(): RbState {
    return createRbState()
  }

  private effectiveState(stepState: RbState): RbState {
    return this.live ?? stepState
  }

  private layout(): Map<string, { x: number; y: number }> {
    const state = this.effectiveState(this.states.current)
    const pos = new Map<string, { x: number; y: number }>()
    let slot = 0
    const spacing = 110
    const walk = (id: string | null, level: number): number => {
      if (id === null) {
        slot += 1
        return 70 + (slot - 1) * spacing + spacing / 2
      }
      const n = state.nodes[id]!
      const leftX = walk(n.left, level + 1)
      const rightX = walk(n.right, level + 1)
      const x = n.left !== null && n.right !== null ? (leftX + rightX) / 2 : n.left !== null ? leftX : n.right !== null ? rightX : 70 + (slot - 1) * spacing + spacing / 2
      pos.set(id, { x, y: TOP + level * LEVEL_H })
      return x
    }
    walk(state.rootId, 0)
    return pos
  }

  protected render(stepState: RbState, opts: RenderOptions & { timeline: import('@/engine/types/animation').GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const renderer = this.renderer
    if (!renderer) return
    void opts
    void tl_unused(state)

    renderer.clear('nodes')
    renderer.clear('links')
    renderer.clear('labels')
    renderer.clear('overlay')

    const pos = this.layout()

    for (const node of Object.values(state.nodes)) {
      const from = pos.get(node.id)
      if (!from) continue
      for (const childId of [node.left, node.right]) {
        if (childId === null) continue
        const to = pos.get(childId)
        if (!to) continue
        renderer.el('path', { d: `M ${from.x} ${from.y + NODE_R} L ${to.x} ${to.y - NODE_R}`, class: 'tf-link' }, renderer.layerLinks)
      }
    }

    for (const node of Object.values(state.nodes)) {
      const p = pos.get(node.id)
      if (!p) continue
      const onPath = state.fixupId === node.id || node.color === 'red'
      const g = renderer.el('g', { transform: `translate(${p.x - NODE_R} ${p.y - NODE_R})` }, renderer.layerNodes)
      renderer.el('circle', {
        cx: NODE_R, cy: NODE_R, r: NODE_R,
        class: `tf-jvm-gen ${node.color === 'red' ? 'is-race' : ''} ${onPath && node.color === 'red' ? '' : ''}`,
        style:
          node.color === 'red'
            ? 'fill: color-mix(in srgb, var(--danger) 26%, var(--bg-panel)); stroke: var(--danger); stroke-width: 2.5'
            : 'fill: color-mix(in srgb, var(--accent) 14%, var(--bg-panel)); stroke: var(--text-1); stroke-width: 2',
      }, g)
      renderer.el('text', { x: NODE_R, y: NODE_R + 5, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g).textContent = String(node.key)
    }

    const props = checkRbProperties(state)
    if (this.propsChip) {
      this.propsChip.textContent = `根黑:${props.rootBlack ? '✓' : '✗'} · 红不相连:${props.noRedRed ? '✓' : '✗'} · 黑高一致:${props.equalBlackHeight ? '✓' : '✗'} · 中序有序:${props.ordered ? '✓' : '✗'}`
      this.propsChip.setAttribute('class', `tf-subnet-mono ${props.rootBlack && props.noRedRed && props.equalBlackHeight && props.ordered ? 'ok' : 'bad'}`)
    }
    if (this.actionChip) {
      this.actionChip.textContent = state.lastAction ? `最近动作:${state.lastAction === 'recolor' ? '变色' : state.lastAction === 'rotate-left' ? '左旋' : state.lastAction === 'rotate-right' ? '右旋' : state.lastAction === 'root-black' ? '根涂黑' : state.lastAction}` : ''
      this.actionChip.setAttribute('class', `tf-subnet-result ${state.lastAction ? 'ok' : ''}`)
    }
    if (this.heightChip) this.heightChip.textContent = `节点:${state.keyCount} · 树高:${rbHeight(state)}(红黑树保证 ≤ 2·log₂(n+1))`
  }

  protected snapshotData(stepState: RbState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const props = checkRbProperties(state)
    const redCount = Object.values(state.nodes).filter(n => n.color === 'red').length
    return {
      rows: [
        { label: '节点数', value: String(state.keyCount), tone: 'accent' },
        { label: '树高', value: `${rbHeight(state)}(红黑保证 ≤ 2·log₂(n+1))`, tone: rbHeight(state) <= 2 * Math.ceil(Math.log2(state.keyCount + 2)) ? 'success' : 'danger' },
        { label: '红色节点', value: String(redCount) },
        { label: '根黑', value: props.rootBlack ? '✓' : '✗', tone: props.rootBlack ? 'success' : 'danger' },
        { label: '红不相连', value: props.noRedRed ? '✓' : '✗', tone: props.noRedRed ? 'success' : 'danger' },
        { label: '黑高一致', value: props.equalBlackHeight ? '✓' : '✗', tone: props.equalBlackHeight ? 'success' : 'danger' },
        { label: '中序有序', value: props.ordered ? '✓' : '✗', tone: props.ordered ? 'success' : 'danger' },
        { label: '旋转 / 变色', value: `${state.rotations} 次 / ${state.recolors} 次` },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'insert', label: '插入一个键', description: '逐步观察变色与旋转。', params: [{ name: 'key', label: '键值', type: 'number', min: 1, max: 99, placeholder: '45' }] },
      { name: 'insert-seq', label: '递增插入 10~40', description: 'BST 会退化成链表的序列 —— 红黑树依然平衡(对照《BST》挑战)。' },
      { name: 'reset', label: '复位' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: RbState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'insert': {
        const key = Math.round(Number(params?.key ?? 0))
        if (Number.isFinite(key) && key >= 1 && key <= 99) {
          let st = rbInsert(base(), key)
          let guard = 0
          while (st.fixupId !== null && guard < 12) {
            st = rbFixupStep(st)
            guard++
          }
          apply(st)
        }
        break
      }
      case 'insert-seq': {
        let st = base()
        for (let k = 10; k <= 40; k += 10) {
          st = rbInsert(st, k)
          let guard = 0
          while (st.fixupId !== null && guard < 12) {
            st = rbFixupStep(st)
            guard++
          }
        }
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

function tl_unused(_s: RbState): void {}

function inOrderKeys(s: RbState): number[] {
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

const sceneModule: SceneModule = {
  create: () => new RedBlackTreeScene(),
}

export default sceneModule
