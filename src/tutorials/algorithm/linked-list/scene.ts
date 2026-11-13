import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  accessAt,
  createLinkedListState,
  insertHead,
  insertTail,
  removeAt,
  traverseStep,
} from './model'
import type { LinkedListState } from './model'

/** 链表场景:节点链 + 指针箭头 + 遍历游标 + 数组内存对照 */

const VIEW = { width: 840, height: 560 }
const NODE_X0 = 70
const NODE_W = 96
const NODE_STEP = 130
const NODE_Y = 250
const NODE_H = 56
const MAX_NODES = 6

class LinkedListScene extends BaseScene<LinkedListState> {
  private nodeBoxes: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; next: SVGTextElement }> = []
  private arrows: SVGPathElement[] = []
  private nullText: SVGTextElement | null = null
  private headChip: SVGTextElement | null = null
  private tailChip: SVGTextElement | null = null
  private cursorArrow: SVGPathElement | null = null
  private cursorLabel: SVGTextElement | null = null
  private live: LinkedListState | null = null

  constructor() {
    super({ id: 'linked-list', viewBox: VIEW, label: '链表节点与指针' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // 内存布局对照
    renderer.el('rect', { x: 50, y: 40, width: 740, height: 120, rx: 12, class: 'tf-ip-card' }, renderer.layerLabels)
    renderer.el('text', { x: 68, y: 66, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '内存布局对比'
    renderer.el('text', { x: 68, y: 92, class: 'tf-subnet-mono' }, renderer.layerLabels).textContent =
      '数组:连续内存,下标 → 地址 = 首址 + k×大小(访问 O(1),插入要移位 O(n))'
    renderer.el('text', { x: 68, y: 118, class: 'tf-subnet-mono' }, renderer.layerLabels).textContent =
      '链表:节点分散,靠指针串联(插入/删除改指针 O(1),访问只能从头走 O(n))'

    renderer.el('text', { x: 68, y: 210, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '链表演示(每个节点 = 值 + next 指针)'
    renderer.el('text', { x: 68, y: 232, class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      '蓝色 = head(入口);箭头 = next 指针;游标 = 遍历位置'

    // 节点框(最多 6 个)
    this.nodeBoxes = []
    for (let i = 0; i < MAX_NODES; i++) {
      const g = renderer.el('g', {}, renderer.layerNodes)
      const x = NODE_X0 + i * NODE_STEP
      const rect = renderer.el('rect', { x, y: NODE_Y, width: NODE_W, height: NODE_H, rx: 10, class: 'tf-jvm-frame' }, g)
      const text = renderer.el('text', { x: x + NODE_W / 2 - 8, y: NODE_Y + NODE_H / 2 + 6, 'text-anchor': 'middle', class: 'tf-cpu-value' }, g)
      const next = renderer.el('text', { x: x + NODE_W - 12, y: NODE_Y + NODE_H / 2 + 6, 'text-anchor': 'middle', class: 'tf-label--mono' }, g)
      g.style.opacity = '0'
      this.nodeBoxes.push({ g, rect, text, next })
    }

    // 指针箭头(节点间)
    this.arrows = []
    for (let i = 0; i < MAX_NODES - 1; i++) {
      const x1 = NODE_X0 + i * NODE_STEP + NODE_W
      const x2 = NODE_X0 + (i + 1) * NODE_STEP
      const arrow = renderer.el('path', { class: 'tf-bar-link', fill: 'none', stroke: 'var(--accent-bright)' }, renderer.layerOverlay)
      arrow.setAttribute('d', `M ${x1 + 2} ${NODE_Y + NODE_H / 2} H ${x2 - 6} M ${x2 - 12} ${NODE_Y + NODE_H / 2 - 5} l 6 5 l -6 5`)
      this.arrows.push(arrow)
    }

    this.nullText = renderer.el('text', { x: 0, y: NODE_Y + NODE_H / 2 + 6, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.nullText.textContent = '→ null'

    this.headChip = renderer.el('text', { x: NODE_X0, y: NODE_Y - 14, class: 'tf-tcp-state tf-tcp-state--active' }, renderer.layerLabels)
    this.tailChip = renderer.el('text', { x: NODE_X0, y: NODE_Y + NODE_H + 22, class: 'tf-tcp-state' }, renderer.layerLabels)

    this.cursorArrow = renderer.el('path', { class: 'tf-bar-link', fill: 'none', stroke: 'var(--warning)' }, renderer.layerOverlay)
    this.cursorLabel = renderer.el('text', { x: 0, y: NODE_Y - 14, 'text-anchor': 'middle', class: 'tf-tcp-state tf-tcp-state--warning' }, renderer.layerLabels)
    this.cursorLabel.textContent = '游标'

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '头插只改 1 个指针 O(1);按下标访问必须从头走 O(n) —— 快写慢读', kind: 'muted' })
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: '初始链表',
        description: '3 → 7 → 12 → null —— 节点靠指针串联。',
        explanation: `链表的每个节点存 **值 + next 指针**,内存位置任意分散;蓝色的是 **head**(唯一入口)。对比上方的数组:连续内存按下标直达 vs 链表顺指针走。注意每个节点框的右下角就是它的 next 指针(指向下个节点或 null)。`,
        duration: 1300,
        action: 'init',
      },
      {
        id: 'insert-head',
        title: '头插 99:只改一个指针',
        description: '新节点指向旧 head,head 更新 —— O(1)。',
        explanation: `头插是链表的招牌动作:新建节点 99,让它 **next 指向旧 head**,再把 head 标签移过来 —— **只动了 1 个指针,任何已有节点都没挪动**,O(1)。同样的操作在数组里要把全部元素向后移一位,O(n)。`,
        duration: 1400,
        action: 'insert-head',
      },
      {
        id: 'traverse',
        title: '按下标访问:从头走(游标动画)',
        description: '访问第 3 个元素 = 走 3 步指针跳转。',
        explanation: `链表**没有随机访问**:找第 3 个元素必须从头顺着指针走 3 步(看黄色游标)—— O(n)。数组则是「首址 + 下标×大小」一步算出,O(1)。这就是「查快插慢」与「插快查慢」的分水岭。`,
        duration: 1600,
        action: 'traverse',
      },
      {
        id: 'remove',
        title: '删除中间节点:指针绕过去',
        description: '前驱的 next 直接指向被删节点的后继。',
        explanation: `删除节点 = 让**前驱的 next 绕过它**指向后继,被删节点从此不可达(内存随后回收)。定位 O(n) + 摘除 O(1)。数组删除同样位置要整体前移。双向链表(LRU 缓存用的)额外持 prev 指针,已知前驱时连定位都省了。`,
        duration: 1500,
        action: 'remove',
      },
      {
        id: 'insert-tail',
        title: '尾插:持有尾指针时 O(1)',
        description: '原尾节点指向新节点,null 后移。',
        explanation: `在尾部追加:原尾节点的 next 指向新节点,新节点 next = null。**持有尾指针时 O(1)**;如果没有尾指针(单链表只有 head),还得先走完全程 O(n) —— 这就是「实现细节决定复杂度」的例子。`,
        duration: 1300,
        action: 'insert-tail',
      },
    ]

    const transitions: StepTransition<LinkedListState>[] = [
      () => createLinkedListState([3, 7, 12]),
      s => insertHead(s, 99),
      s => traverseStep(traverseStep(traverseStep(s))),
      s => removeAt(s, 2),
      s => insertTail(s, 42),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): LinkedListState {
    return createLinkedListState([3, 7, 12])
  }

  private effectiveState(stepState: LinkedListState): LinkedListState {
    return this.live ?? stepState
  }

  protected render(stepState: LinkedListState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    for (let i = 0; i < this.nodeBoxes.length; i++) {
      const box = this.nodeBoxes[i]
      if (!box) continue
      const node = state.nodes[i]
      const visible = node !== undefined
      const target = visible ? '1' : '0'
      const x = NODE_X0 + i * NODE_STEP

      if (visible) {
        if (box.text) box.text.textContent = String(node.value)
        if (box.next) {
          box.next.textContent = state.nextMap[node.id] ? '●' : '∅'
        }
        if (box.rect) {
          const isCursor = state.cursor === i
          const isHighlight = state.highlight === i
          box.rect.setAttribute('class', `tf-jvm-frame ${isCursor || isHighlight ? 'is-top' : ''}`)
        }
      }

      void x
      if (tl && visible) {
        tl.to(box.g, { opacity: target, duration: 0.3 }, 0)
      } else {
        box.g.style.opacity = target
      }
    }

    // 箭头随节点可见性
    this.arrows.forEach((arrow, i) => {
      const a = state.nodes[i]
      const b = state.nodes[i + 1]
      arrow.style.opacity = a && b ? '1' : '0'
    })

    if (this.nullText) {
      const n = state.nodes.length
      if (n > 0) {
        const lastX = NODE_X0 + (n - 1) * NODE_STEP + NODE_W
        this.nullText.style.opacity = '1'
        this.nullText.setAttribute('x', String(lastX + 2))
      } else {
        this.nullText.style.opacity = '0'
      }
    }

    if (this.headChip) {
      this.headChip.textContent = state.nodes.length ? `head(值 ${state.headValue})` : ''
      this.headChip.setAttribute('x', String(NODE_X0))
    }
    if (this.tailChip) {
      const tailIdx = state.nodes.length - 1
      this.tailChip.textContent = state.nodes.length ? `tail(值 ${state.tailValue})` : ''
      this.tailChip.setAttribute('x', String(Math.min(tailIdx, MAX_NODES - 1) * NODE_STEP + NODE_X0))
    }

    // 游标
    if (this.cursorArrow && this.cursorLabel) {
      if (state.cursor !== null && state.cursor < MAX_NODES) {
        const x = NODE_X0 + state.cursor * NODE_STEP + NODE_W / 2
        this.cursorArrow.style.opacity = '1'
        this.cursorArrow.setAttribute('d', `M ${x} ${NODE_Y - 22} v 16 M ${x - 5} ${NODE_Y - 12} l 5 5 l 5 -5`)
        this.cursorLabel.style.opacity = '1'
        this.cursorLabel.setAttribute('x', String(x))
        this.cursorLabel.textContent = `游标:第 ${state.cursor + 1} 个`
      } else {
        this.cursorArrow.style.opacity = '0'
        this.cursorLabel.style.opacity = '0'
      }
    }
  }

  protected snapshotData(stepState: LinkedListState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const chain = state.nodes.map(n => n.value).join(' → ')
    return {
      rows: [
        { label: '链表', value: state.nodes.length ? `${chain} → null` : '(空)', tone: 'accent' },
        { label: 'head / tail', value: state.nodes.length ? `${state.headValue} / ${state.tailValue}` : '—' },
        { label: '节点数', value: String(state.nodes.length) },
        { label: '遍历游标', value: state.cursor !== null ? `第 ${state.cursor + 1} 个(值 ${state.nodes[state.cursor]?.value})` : '(未遍历)', tone: state.cursor !== null ? 'warning' : 'default' },
        { label: '访问下标 k', value: `走 k 步 · O(n)` },
        { label: '头插', value: '改 1 个指针 · O(1)', tone: 'success' },
        { label: '删除(已知位置)', value: '重排指针 · O(1)', tone: 'success' },
        { label: '数组对照', value: '访问 O(1) · 头插 O(n)', tone: 'default' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'insert-head',
        label: '头插(随机值)',
        description: 'O(1):新节点指向旧 head。最多 6 个节点。',
      },
      { name: 'insert-tail', label: '尾插(随机值)' },
      {
        name: 'access',
        label: '按下标访问(遍历)',
        description: '从头走 k 步,游标逐帧演示 O(n)。',
        params: [{ name: 'index', label: '下标', type: 'number', min: 0, max: 5, placeholder: '2' }],
      },
      {
        name: 'remove',
        label: '按下标删除',
        description: '定位 O(n) + 指针摘除 O(1)。',
        params: [{ name: 'index', label: '下标', type: 'number', min: 0, max: 5, placeholder: '1' }],
      },
      { name: 'reset', label: '复位为 3→7→12' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: LinkedListState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    const randVal = () => Math.floor(Math.random() * 90) + 10
    switch (name) {
      case 'insert-head':
        if (base().nodes.length < MAX_NODES) apply(insertHead(base(), randVal()))
        break
      case 'insert-tail':
        if (base().nodes.length < MAX_NODES) apply(insertTail(base(), randVal()))
        break
      case 'access': {
        const idx = Math.round(Number(params?.index ?? 0))
        if (Number.isFinite(idx) && idx >= 0 && idx < base().nodes.length) {
          apply(accessAt(base(), idx))
        }
        break
      }
      case 'remove': {
        const idx = Math.round(Number(params?.index ?? 0))
        if (Number.isFinite(idx) && idx >= 0 && idx < base().nodes.length) {
          apply(removeAt(base(), idx))
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
  create: () => new LinkedListScene(),
}

export default sceneModule
