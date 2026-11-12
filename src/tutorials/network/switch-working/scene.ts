import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Connection } from '@/engine/components/Connection'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'

/** 交换机工作原理场景:MAC 地址表学习 / 未知单播泛洪 / 广播 / 精准转发 */

export interface SwitchDevice {
  name: string
  mac: string
}

export interface MacEntry {
  mac: string
  device: string
}

export type FrameType = 'unknown-unicast' | 'known-unicast' | 'broadcast' | 'reply'

export interface SwitchFrame {
  id: string
  src: string
  srcMac: string
  dstMac: string
  type: FrameType
  /** 接收方设备名(泛洪 = 除源外的全部) */
  targets: string[]
  label: string
  /** 是否已学到源 MAC(伴随本帧) */
  learned: string | null
}

export interface SwitchSceneState {
  devices: SwitchDevice[]
  macTable: MacEntry[]
  frames: SwitchFrame[]
  active: string | null
  log: string[]
}

const VIEW = { width: 840, height: 600 }
const SW = { x: 420, y: 120 }
const PC_Y = 330
const PC_X = [110, 300, 490, 680] as const

const DEVICES: SwitchDevice[] = [
  { name: 'PC1', mac: 'AA:BB:CC:00:00:01' },
  { name: 'PC2', mac: 'AA:BB:CC:00:00:02' },
  { name: 'PC3', mac: 'AA:BB:CC:00:00:03' },
  { name: 'PC4', mac: 'AA:BB:CC:00:00:04' },
]

/** 纯函数:收到帧时先学习源 MAC */
export function learnOnReceive(state: SwitchSceneState, frame: SwitchFrame): MacEntry[] {
  if (frame.learned === null) return state.macTable
  const exists = state.macTable.some(e => e.mac === frame.learned && e.device === frame.src)
  if (exists) return state.macTable
  return [...state.macTable, { mac: frame.srcMac, device: frame.src }]
}

/** 纯函数:根据目的 MAC 决定转发目标 */
export function forwardTargets(state: SwitchSceneState, frame: SwitchFrame): string[] {
  if (frame.type === 'broadcast') {
    return state.devices.map(d => d.name).filter(n => n !== frame.src)
  }
  const entry = state.macTable.find(e => e.mac === frame.dstMac)
  return entry ? [entry.device] : state.devices.map(d => d.name).filter(n => n !== frame.src)
}

export function buildFrame(
  state: SwitchSceneState,
  src: string,
  dstMac: string,
): SwitchFrame {
  const device = state.devices.find(d => d.name === src)!
  const isBroadcast = dstMac === 'FF:FF:FF:FF:FF:FF'
  const known = state.macTable.some(e => e.mac === dstMac)
  const type: FrameType = isBroadcast ? 'broadcast' : known ? 'known-unicast' : 'unknown-unicast'
  const targets = isBroadcast
    ? state.devices.map(d => d.name).filter(n => n !== src)
    : known
      ? [state.macTable.find(e => e.mac === dstMac)!.device]
      : state.devices.map(d => d.name).filter(n => n !== src)
  return {
    id: `frame-${state.frames.length + 1}`,
    src,
    srcMac: device.mac,
    dstMac,
    type,
    targets,
    label: `${src} → ${isBroadcast ? '广播' : targets.join('/')}`,
    learned: src,
  }
}

class SwitchScene extends BaseScene<SwitchSceneState> {
  private switchNode!: NetworkNode
  private pcNodes: NetworkNode[] = []
  private tableRows: Array<{ g: SVGGElement; mac: SVGTextElement; device: SVGTextElement }> = []
  private slots: Packet[] = []

  constructor() {
    super({ id: 'switch', viewBox: VIEW, label: '交换机 MAC 学习拓扑' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.switchNode = new NetworkNode(renderer, {
      id: 'switch', x: SW.x, y: SW.y, width: 190, height: 64, label: '交换机', glyph: 'SWITCH',
    })
    this.pcNodes = PC_X.map((x, i) =>
      new NetworkNode(renderer, {
        id: `pc${i + 1}`, x, y: PC_Y, width: 120, height: 54, label: DEVICES[i]!.name, glyph: DEVICES[i]!.mac.slice(-2),
      }),
    )
    PC_X.map((x, i) =>
      new Connection(renderer, {
        id: `line-${i}`,
        from: { x, y: PC_Y - 27 },
        to: { x: SW.x - 60 + i * 40, y: SW.y + 32 },
        arrow: false,
      }),
    )

    // MAC 地址表
    const tbl = renderer.el('text', { x: 110, y: 425, class: 'tf-label--accent' }, renderer.layerLabels)
    tbl.textContent = 'MAC 地址表(动态学习,老化时间默认 300s)'
    this.tableRows = []
    for (let i = 0; i < 4; i++) {
      const g = renderer.el('g', {}, renderer.layerLabels)
      renderer.el('rect', { x: 110, y: 438 + i * 34, width: 300, height: 28, rx: 6, class: 'tf-subnet-row-bg' }, g)
      const mac = renderer.el('text', { x: 126, y: 457 + i * 34, class: 'tf-subnet-mono' }, g)
      const device = renderer.el('text', { x: 380, y: 457 + i * 34, class: 'tf-subnet-mono' }, g)
      g.style.opacity = '0'
      this.tableRows.push({ g, mac, device })
    }

    // 说明标签
    new Label(renderer, { x: 640, y: 445, text: '蓝色 = 学习到表项', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 640, y: 470, text: '黄色 = 泛洪(除入口外全部)', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 640, y: 495, text: '绿色 = 精准单播转发', kind: 'mono', anchor: 'start' })

    this.slots = []
    for (let i = 0; i < 14; i++) {
      this.slots.push(new Packet(renderer, { id: `sw-slot-${i}`, color: 'accent', shape: 'circle', radius: 7 }))
    }
    this.live = null
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'topology',
        title: '四台主机与一台交换机',
        description: '初始状态:交换机的 MAC 地址表是空的。',
        explanation:
          '每台设备有一个 **48 位 MAC 地址**(如 AA:BB:CC:00:00:01)。交换机刚上电时 MAC 地址表**完全为空** —— 它对「谁在哪个端口」一无所知,一切靠接下来逐帧学习。',
        duration: 1300,
        action: 'topology',
      },
      {
        id: 'frame1',
        title: 'PC1 发帧给 PC2(第一次)',
        description: '以太网帧:目的 MAC=PC2,源 MAC=PC1。',
        explanation:
          'PC1 要发给 PC2,它只知道 PC2 的 **IP**,通过 ARP 广播换来了 PC2 的 MAC(本教程直接从拿到 MAC 之后开始)。帧的头部写着:**目的 MAC = PC2,源 MAC = PC1**。注意:此刻交换机的表里还没有任何条目。',
        duration: 1400,
        action: 'frame1',
      },
      {
        id: 'learn1',
        title: '交换机学习:源 MAC + 入端口',
        description: 'AA:…:01 ↔ 端口 1,写入 MAC 表。',
        explanation:
          '帧从端口 1 进入,交换机**只看源 MAC** 就能学到「AA:…:01 在端口 1」并写入表。学习与目的地址无关 —— 就算这个帧最终要泛洪,源地址信息也照样有效。表项有**老化时间**(默认 300s),期间不再出现会被删除。',
        duration: 1300,
        action: 'learn1',
      },
      {
        id: 'flood1',
        title: '查目的 MAC:表里没有 → 未知单播泛洪',
        description: '帧从除入口外的所有端口发出;只有 PC2 收下。',
        explanation:
          '查目的 MAC(AA:…:02)发现表里没有 —— 交换机只能**泛洪**:从除入口外的所有端口复制发出。PC2 看到目的 MAC 是自己,收下;PC3、PC4 看到不是自己,**网卡直接丢弃**(它们只是被打扰了一下)。这就是**未知单播泛洪**,注意它是「查表失败」导致的,和广播帧不是一回事。',
        duration: 1600,
        action: 'flood1',
      },
      {
        id: 'frame2',
        title: 'PC2 回复:交换机学习 PC2 的 MAC',
        description: 'MAC 表新增:AA:…:02 ↔ 端口 2。',
        explanation: 'PC2 回帧时,交换机同样**学习源 MAC**:「AA:…:02 在端口 2」。现在表里有了两台设备 —— 双向的地图都画好了。',
        duration: 1300,
        action: 'frame2',
      },
      {
        id: 'forward',
        title: '查目的 MAC=PC1:表里有 → 精准转发',
        description: '帧只从端口 1 发出,PC3/PC4 完全不受打扰。',
        explanation:
          '目的 MAC(AA:…:01)在表里,端口 1 —— 帧只从这一个端口发出,称为**单播精准转发**。泛洪到精准的转变,就是「学习」的全部意义:第一次被打扰的设备,第二次不再被打扰。',
        duration: 1400,
        action: 'forward',
      },
      {
        id: 'again',
        title: 'PC1 再次发送:直接精准送达',
        description: '双向通信全部走精准转发。',
        explanation: '此后 PC1 ↔ PC2 的通信都查表直达。观察右侧操作:清空 MAC 表再发一帧,会重新经历一轮泛洪 —— 这也是 ARP 欺骗、MAC 洪水攻击影响交换机的原理(表被假表项填满后,合法流量退化为泛洪)。',
        duration: 1300,
        action: 'again',
      },
      {
        id: 'broadcast',
        title: 'PC3 发送广播帧(如 ARP 请求)',
        description: '目的 MAC = FF:FF:FF:FF:FF:FF → 广播泛洪。',
        explanation:
          '广播帧的**目的地址本身就是 FF:FF:FF:FF:FF:FF**,每个广播帧都必须从除入口外所有端口发出 —— 这不是查表失败,而是广播的语义。所有设备都必须收下处理。区分:**未知单播泛洪**是一次性的、学会后就消失;**广播**永远泛洪。广播域过大(所有设备在一个 VLAN)就是广播风暴温床,这也是 VLAN 划分要解决的问题。',
        duration: 1600,
        action: 'broadcast',
      },
      {
        id: 'summary',
        title: '总结:学习、转发、老化',
        description: 'MAC 表当前状态与机制回顾。',
        explanation:
          '交换机的全部智慧就是这张表:**收帧学源、查表转发、查不到泛洪、定期老化**。它工作在二层(只认 MAC,不看 IP);如果两台设备跨网段通信,帧会被送到网关(路由器),由三层设备接力 —— 交换机永远不知道 IP 的存在。',
        duration: 1400,
        action: 'summary',
      },
    ]

    const mkFrame1 = () => buildFrame(createState(), 'PC1', 'AA:BB:CC:00:00:02')

    function createState(): SwitchSceneState {
      return { devices: DEVICES, macTable: [], frames: [], active: null, log: [] }
    }

    const transitions: StepTransition<SwitchSceneState>[] = [
      s => ({ ...s, log: [...s.log, '交换机上电,MAC 表为空'] }),
      s => {
        const f = buildFrame(s, 'PC1', 'AA:BB:CC:00:00:02')
        return { ...s, frames: [...s.frames, f], active: 'PC1', log: [...s.log, `${f.src} → ${f.dstMac}:帧进入交换机(端口 1)`] }
      },
      s => {
        const f = s.frames[s.frames.length - 1] as SwitchFrame
        return { ...s, macTable: learnOnReceive(s, f), log: [...s.log, `学习源 MAC:${f.srcMac} ↔ 端口 1`] }
      },
      s => {
        const prev = s.frames[s.frames.length - 1] as SwitchFrame
        const f = buildFrame({ ...s, macTable: learnOnReceive(s, prev) }, 'PC1', 'AA:BB:CC:00:00:02')
        return {
          ...s,
          macTable: learnOnReceive({ ...s, macTable: learnOnReceive(s, prev) }, f),
          frames: [...s.frames, f],
          active: 'switch',
          log: [...s.log, `查目的 MAC ${f.dstMac}:未命中 → 未知单播泛洪(${f.targets.join(', ')} 都收到,仅 PC2 接收)`],
        }
      },
      s => {
        const f = buildFrame(s, 'PC2', 'AA:BB:CC:00:00:01')
        return { ...s, frames: [...s.frames, f], macTable: learnOnReceive(s, f), active: 'PC2', log: [...s.log, `PC2 回复;学习源 MAC ${f.srcMac} ↔ 端口 2`] }
      },
      s => {
        const f = buildFrame(s, 'PC2', 'AA:BB:CC:00:00:01')
        return { ...s, frames: [...s.frames, f], active: 'switch', log: [...s.log, `查目的 MAC ${f.dstMac}:命中端口 1 → 精准转发`] }
      },
      s => {
        const f = buildFrame(s, 'PC1', 'AA:BB:CC:00:00:02')
        return { ...s, frames: [...s.frames, f], active: 'PC1', log: [...s.log, 'PC1 再次发送:查表直达端口 2(精准)'] }
      },
      s => {
        const f = buildFrame(s, 'PC3', 'FF:FF:FF:FF:FF:FF')
        return { ...s, frames: [...s.frames, f], active: 'PC3', log: [...s.log, `PC3 发送广播帧 → 泛洪到 ${f.targets.join(', ')}(所有设备必须处理)`] }
      },
      s => ({ ...s, active: null, log: [...s.log, `MAC 表共 ${s.macTable.length} 条;老化时间 300s`], frames: [...s.frames] }),
    ]
    void mkFrame1
    return { steps, transitions }
  }

  protected buildInitialState(): SwitchSceneState {
    return { devices: DEVICES, macTable: [], frames: [], active: null, log: ['交换机上电,MAC 表为空'] }
  }

  /* ---------- 渲染 ---------- */

  private devicePoint(name: string): { x: number; y: number } {
    if (name === 'switch') return SW
    const idx = DEVICES.findIndex(d => d.name === name)
    return { x: PC_X[idx] ?? 110, y: PC_Y }
  }

  protected render(stepState: SwitchSceneState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    // 节点状态
    this.switchNode.setStatus(state.active === 'switch' ? 'active' : 'idle')
    this.pcNodes.forEach((node, i) => {
      const name = DEVICES[i]!.name
      const lastFrame = state.frames[state.frames.length - 1]
      const isTarget = lastFrame?.targets.includes(name)
      node.setStatus(state.active === name ? 'active' : isTarget ? 'processing' : 'idle')
    })

    // MAC 表
    for (let i = 0; i < this.tableRows.length; i++) {
      const row = this.tableRows[i]
      if (!row) continue
      const entry = state.macTable[i]
      const target = entry ? '1' : '0'
      if (entry) {
        row.mac.textContent = entry.mac
        row.device.textContent = `端口 ${DEVICES.findIndex(d => d.name === entry.device) + 1}(${entry.device})`
      }
      if (tl) tl.to(row.g, { opacity: target, duration: 0.25 }, i * 0.1)
      else row.g.style.opacity = target
    }

    // 帧 → 数据包
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (!slot) continue
      const frame = state.frames[i]
      if (!frame) {
        slot.show(false)
        continue
      }
      const settled = !opts.animate || i < state.frames.length - 1 || tl === null
      const color =
        frame.type === 'broadcast' ? 'warning' : frame.type === 'unknown-unicast' ? 'warning' : 'success'
      slot.options.color = color
      const body = slot.group.querySelector('.tf-packet-body')
      if (body) body.setAttribute('class', `tf-packet-body tf-packet-body--${color}`)

      const srcPoint = this.devicePoint(frame.src)
      const swPoint = { x: SW.x, y: SW.y + 40 }
      if (settled) {
        // 终态:展示在目标方向的第一跳
        const targetPoint = this.devicePoint(frame.targets[0] ?? 'switch')
        slot.placeAt(targetPoint.x, targetPoint.y - 40)
        slot.show(true)
        continue
      }
      // 动画:两阶段(源→交换机,再交换机→目标们)
      slot.placeAt(srcPoint.x, srcPoint.y - 40)
      slot.show(true)
      tl.to(slot.group, { x: swPoint.x - srcPoint.x, y: swPoint.y - srcPoint.y + 40 - 40, duration: 0.45, ease: 'power1.in' }, 0)
      const targets = frame.targets
      targets.slice(0, 3).forEach((t, k) => {
        const p = this.devicePoint(t)
        tl.add(
          () => {
            slot.placeAt(swPoint.x, swPoint.y)
          },
          0.45,
        )
        tl.to(slot.group, { x: p.x - swPoint.x, y: p.y - 40 - swPoint.y, duration: 0.5, ease: 'power1.out' }, 0.5 + k * 0.08)
      })
    }
  }

  protected snapshotData(stepState: SwitchSceneState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const last = state.frames[state.frames.length - 1]
    const tableStr = state.macTable.map(e => `${e.device}`).join(', ')
    return {
      rows: [
        { label: 'MAC 地址表', value: state.macTable.length ? state.macTable.map(e => `${e.mac.slice(-5)}→${e.device}`).join(' | ') : '(空)', tone: state.macTable.length ? 'success' : 'default' },
        { label: '已学习设备', value: tableStr || '(空)' },
        {
          label: '最近一帧',
          value: last ? `${last.src} → ${last.dstMac === 'FF:FF:FF:FF:FF:FF' ? '广播' : last.dstMac.slice(-5)}` : '(无)',
          tone: 'accent',
        },
        { label: '帧类型', value: last ? ({ 'unknown-unicast': '未知单播泛洪', 'known-unicast': '精准单播转发', broadcast: '广播帧', reply: '回复帧' } as Record<FrameType, string>)[last.type] : '—' },
        { label: '接收设备', value: last ? last.targets.join(', ') : '—' },
        { label: '帧计数', value: String(state.frames.length) },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'send-frame',
        label: '发送一帧',
        description: '任选源与目的,观察学习与转发决策。',
        params: [
          { name: 'src', label: '源设备', type: 'select', options: DEVICES.map(d => ({ value: d.name, label: d.name })) },
          { name: 'dst', label: '目的', type: 'select', options: [...DEVICES.map(d => ({ value: d.mac, label: `${d.name}(${d.mac.slice(-5)})` })), { value: 'FF:FF:FF:FF:FF:FF', label: '广播地址' }] },
        ],
      },
      {
        name: 'clear-table',
        label: '清空 MAC 表(模拟老化/攻击)',
        description: '挑战:表清空后,下一次发送将重新泛洪。',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    switch (name) {
      case 'send-frame': {
        const src = String(params?.src ?? 'PC1')
        const dstMac = String(params?.dst ?? 'AA:BB:CC:00:00:02')
        // 在当前状态上追加一帧并重渲染(不重建步骤机)
        const base = this.effectiveState(this.states.current)
        const f = buildFrame(base, src, dstMac)
        const next: SwitchSceneState = {
          ...base,
          frames: [...base.frames, f],
          macTable: learnOnReceive(base, f),
          active: src,
          log: [...base.log, `实验操作:${f.src} → ${dstMac === 'FF:FF:FF:FF:FF:FF' ? '广播' : dstMac}:${f.type === 'broadcast' ? '泛洪' : f.type === 'known-unicast' ? '精准转发' : '未知单播泛洪'}`],
        }
        this.applyLiveState(next)
        break
      }
      case 'clear-table': {
        const base = this.effectiveState(this.states.current)
        const next: SwitchSceneState = {
          ...base,
          macTable: [],
          log: [...base.log, 'MAC 地址表被清空(模拟老化/表项溢出)'],
        }
        this.applyLiveState(next)
        break
      }
      default:
        break
    }
  }

  /**
   * 实验操作:直接以新状态渲染(不走步骤机)。
   * live 覆盖层独立于步骤状态机;跳转步骤/重建时由 rebuild 清空。
   */
  private live: SwitchSceneState | null = null

  private applyLiveState(next: SwitchSceneState): void {
    this.live = next
    this.render(next, { animate: false, timeline: null, fromIndex: 0 })
    this.events.emit('data', this.getState())
  }

  /** 取渲染用状态:实验覆盖层优先于步骤状态 */
  private effectiveState(stepState: SwitchSceneState): SwitchSceneState {
    return this.live ?? stepState
  }
}

const sceneModule: SceneModule = {
  create: () => new SwitchScene(),
}

export default sceneModule
