import { BaseScene } from '@/engine/core/Scene'
import type { GsapTimeline } from '@/engine/types/animation'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import type { NodeStatus } from '@/engine/components/NetworkNode'
import { Connection } from '@/engine/components/Connection'
import { Packet } from '@/engine/components/Packet'

/** 引擎验收测试场景:A → B → C 数据流(docs Phase 3 验收) */

interface TestState {
  a: NodeStatus
  b: NodeStatus
  c: NodeStatus
  linkFlow: 'none' | 'ab' | 'bc'
  packet: { visible: boolean; link: 'ab' | 'bc'; t: number; label: string }
  log: string[]
}

const STEPS: SceneStep[] = [
  {
    id: 'boot',
    title: '节点上电',
    description: '源节点 A 激活,准备发送数据。',
    explanation: '**节点激活**:A 节点进入活跃状态。在真实网络中,这一步对应设备完成初始化并获得接口地址。',
    duration: 700,
    action: 'boot',
  },
  {
    id: 'send',
    title: 'A 发送数据包',
    description: '数据包从 A 出发,沿链路移动到 B。',
    explanation: '**发送**:数据包沿 A→B 链路移动。动画引擎通过补间 `{t: 0→1}` 沿路径插值定位,兼容直线与曲线。',
    duration: 700,
    action: 'send',
  },
  {
    id: 'receive',
    title: 'B 接收并处理',
    description: 'B 节点处理数据包。',
    explanation: '**处理**:B 进入 processing 状态,数据包被消费(隐藏)。',
    duration: 700,
    action: 'receive',
  },
  {
    id: 'forward',
    title: 'B 转发到 C',
    description: '处理完成后,B 把结果转发给 C。',
    explanation: '**转发**:B 标记成功,新数据包沿 B→C 链路移动。',
    duration: 700,
    action: 'forward',
  },
  {
    id: 'done',
    title: 'C 接收完成',
    description: 'C 收到数据,链路任务完成。',
    explanation: '**完成**:C 进入 success 状态,本次端到端传输结束。',
    duration: 700,
    action: 'done',
  },
]

const TRANSITIONS: StepTransition<TestState>[] = [
  () => ({ a: 'active', b: 'idle', c: 'idle', linkFlow: 'none', packet: { visible: false, link: 'ab', t: 0, label: '' }, log: ['A 上电'] }),
  s => ({ ...s, packet: { visible: true, link: 'ab', t: 0, label: 'DATA' }, linkFlow: 'ab', log: [...s.log, 'A → B 发送'] }),
  s => ({ ...s, packet: { ...s.packet, visible: false }, linkFlow: 'none', b: 'processing', log: [...s.log, 'B 处理中'] }),
  s => ({ ...s, b: 'success', packet: { visible: true, link: 'bc', t: 0, label: 'ACK' }, linkFlow: 'bc', log: [...s.log, 'B → C 转发'] }),
  s => ({ ...s, packet: { ...s.packet, visible: false }, linkFlow: 'none', c: 'success', log: [...s.log, 'C 完成'] }),
]

class EngineTestScene extends BaseScene<TestState> {
  private nodeA!: NetworkNode
  private nodeB!: NetworkNode
  private nodeC!: NetworkNode
  private linkAB!: Connection
  private linkBC!: Connection
  private packet!: Packet

  constructor() {
    super({ id: 'engine-test', viewBox: { width: 720, height: 320 }, label: '引擎测试场景' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.linkAB = new Connection(renderer, {
      id: 'ab',
      from: { x: 140, y: 160 },
      to: { x: 360, y: 160 },
      label: '链路 1',
    })
    this.linkBC = new Connection(renderer, {
      id: 'bc',
      from: { x: 360, y: 160 },
      to: { x: 580, y: 160 },
      label: '链路 2',
    })

    this.nodeA = new NetworkNode(renderer, { id: 'a', x: 140, y: 160, label: '节点 A', glyph: 'A' })
    this.nodeB = new NetworkNode(renderer, { id: 'b', x: 360, y: 160, label: '节点 B', glyph: 'B' })
    this.nodeC = new NetworkNode(renderer, { id: 'c', x: 580, y: 160, label: '节点 C', glyph: 'C' })
    this.nodeA.setStatus('idle')
    this.nodeB.setStatus('idle')
    this.nodeC.setStatus('idle')

    this.packet = new Packet(renderer, { id: 'pkt', color: 'accent', shape: 'rect', width: 40, height: 24 })
    this.packet.show(false)
  }

  protected buildSteps() {
    return { steps: STEPS, transitions: TRANSITIONS }
  }

  protected buildInitialState(): TestState {
    return { a: 'idle', b: 'idle', c: 'idle', linkFlow: 'none', packet: { visible: false, link: 'ab', t: 0, label: '' }, log: [] }
  }

  protected render(state: TestState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const { timeline } = opts
    this.nodeA.setStatus(state.a)
    this.nodeB.setStatus(state.b)
    this.nodeC.setStatus(state.c)
    this.linkAB.setActive(state.linkFlow === 'ab')
    this.linkBC.setActive(state.linkFlow === 'bc')

    const connection = state.packet.link === 'ab' ? this.linkAB : this.linkBC
    this.packet.setLabel(state.packet.label)

    if (timeline && state.packet.visible) {
      // 动画:沿链路移动
      const conn = connection
      this.packet.show(true)
      this.packet.placeOn(conn, 0)
      this.packet.moveThrough(conn, { duration: 800, timeline, toT: 1 })
      timeline.add(() => {
        if (!state.packet.visible) return
      })
    } else {
      // 瞬时渲染(跳转/恢复)
      if (state.packet.visible) {
        this.packet.placeOn(connection, state.packet.t)
        this.packet.show(true)
      } else {
        this.packet.show(false)
      }
    }
  }

  protected snapshotData(state: TestState, completedSteps: number): Record<string, unknown> {
    return {
      rows: [
        { label: '节点 A', value: statusText(state.a), tone: toneOf(state.a) },
        { label: '节点 B', value: statusText(state.b), tone: toneOf(state.b) },
        { label: '节点 C', value: statusText(state.c), tone: toneOf(state.c) },
        { label: '数据包', value: state.packet.visible ? `${state.packet.label} @ ${state.packet.link}` : '不在链路上', tone: state.packet.visible ? 'accent' : 'default' },
        { label: '已完成步骤', value: `${completedSteps} / ${STEPS.length}` },
        { label: '事件日志', value: state.log.join(' | ') || '(空)' },
      ],
    }
  }
}

function statusText(s: NodeStatus): string {
  return { idle: '空闲', active: '活跃', processing: '处理中', success: '完成', error: '错误', dim: '待机' }[s]
}

function toneOf(s: NodeStatus): string {
  return s === 'success' ? 'success' : s === 'error' ? 'danger' : s === 'idle' ? 'default' : 'accent'
}

const sceneModule: SceneModule = {
  create: () => new EngineTestScene(),
}

// 供类型检查:确认状态快照兼容
export type { TestState }
export default sceneModule
