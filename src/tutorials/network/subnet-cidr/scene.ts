import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import type { SceneAction } from '@/engine/types/scene'
import {
  broadcastAddress,
  ipToBits,
  ipToString,
  parseIPv4,
  prefixToMask,
  sameSubnet,
  usableRange,
} from '../ip-address/model'
import type { IPv4 } from '../ip-address/model'

/** 子网划分场景:借位高亮 + 子网列表逐个展开 + 同网段判断 */

interface SubnetInfo {
  index: number
  network: string
  broadcast: string
  first: string
  last: string
  count: number
}

interface SubnetSceneState {
  base: IPv4
  basePrefix: number
  newPrefix: number
  showBorrow: boolean
  visibleSubnets: number
  check: { a: string; b: string; done: boolean; same: boolean }
}

interface SubnetSceneConfig {
  baseIp: string
  basePrefix: number
  newPrefix: number
  checkA: string
  checkB: string
  error?: string
}

const VIEW = { width: 820, height: 620 }
const BITS_Y = 120
const CELL = 22
const GAP = 2
const GROUP_GAP = 22
const X0 = 34
const LIST_Y = 210

const DEFAULT_CONFIG: SubnetSceneConfig = {
  baseIp: '192.168.1.0',
  basePrefix: 24,
  newPrefix: 26,
  checkA: '192.168.1.20',
  checkB: '192.168.1.200',
}

function computeSubnets(base: IPv4, basePrefix: number, newPrefix: number): SubnetInfo[] {
  const count = Math.min(16, 2 ** (newPrefix - basePrefix))
  const blockSize = 2 ** (32 - newPrefix)
  const result: SubnetInfo[] = []
  const baseNum = base.octets.reduce((acc, o) => acc * 256 + o, 0)
  for (let i = 0; i < count; i++) {
    const num = baseNum + i * blockSize
    const octets = [
      Math.floor(num / 16777216) % 256,
      Math.floor(num / 65536) % 256,
      Math.floor(num / 256) % 256,
      num % 256,
    ] as IPv4['octets']
    const net: IPv4 = { octets }
    const bc = broadcastAddress(net, newPrefix)
    const range = usableRange(net, newPrefix)
    result.push({
      index: i,
      network: ipToString(net),
      broadcast: ipToString(bc),
      first: range.first,
      last: range.last,
      count: range.count,
    })
  }
  return result
}

class SubnetCidrScene extends BaseScene<SubnetSceneState> {
  private config: SubnetSceneConfig = { ...DEFAULT_CONFIG }

  private baseText: SVGTextElement | null = null
  private maskText: SVGTextElement | null = null
  private cellRects: SVGRectElement[] = []
  private cellTexts: SVGTextElement[] = []
  private subnetRows: SVGGElement[] = []
  private subnetRowData: Array<{ net: SVGTextElement; bc: SVGTextElement; range: SVGTextElement }> = []
  private checkEls: SVGGElement | null = null
  private checkAText: SVGTextElement | null = null
  private checkBText: SVGTextElement | null = null
  private checkResult: SVGTextElement | null = null
  private errorBanner: SVGGElement | null = null
  private errorText: SVGTextElement | null = null

  constructor() {
    super({ id: 'subnet-cidr', viewBox: VIEW, label: '子网划分实验室' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.baseText = renderer.el('text', {
      x: VIEW.width / 2,
      y: 46,
      'text-anchor': 'middle',
      class: 'tf-ip-decimal',
    })
    this.maskText = renderer.el('text', {
      x: VIEW.width / 2,
      y: 74,
      'text-anchor': 'middle',
      class: 'tf-label--mono',
    })

    this.cellRects = []
    this.cellTexts = []
    for (let o = 0; o < 4; o++) {
      const gx = X0 + o * (8 * (CELL + GAP) + GROUP_GAP)
      for (let b = 0; b < 8; b++) {
        const x = gx + b * (CELL + GAP)
        this.cellRects.push(renderer.el('rect', { x, y: BITS_Y, width: CELL, height: 28, rx: 4, class: 'tf-bit-cell' }, renderer.layerNodes))
        this.cellTexts.push(renderer.el('text', { x: x + CELL / 2, y: BITS_Y + 19, 'text-anchor': 'middle', class: 'tf-bit-text' }, renderer.layerNodes))
      }
    }

    // 子网列表表头 + 行
    const header = renderer.el('text', { x: X0, y: LIST_Y - 14, class: 'tf-label--muted' }, renderer.layerLabels)
    header.textContent = '子网          网络地址                广播地址              可用范围'
    this.subnetRows = []
    this.subnetRowData = []
    for (let i = 0; i < 8; i++) {
      const y = LIST_Y + i * 34
      const g = renderer.el('g', { class: 'tf-subnet-row' }, renderer.layerLabels)
      renderer.el('rect', { x: X0, y, width: 752, height: 28, rx: 6, class: 'tf-subnet-row-bg' }, g)
      renderer.el('text', { x: X0 + 16, y: y + 19, class: 'tf-subnet-idx' }, g)
      const net = renderer.el('text', { x: X0 + 70, y: y + 19, class: 'tf-subnet-mono' }, g)
      const bc = renderer.el('text', { x: X0 + 300, y: y + 19, class: 'tf-subnet-mono' }, g)
      const range = renderer.el('text', { x: X0 + 520, y: y + 19, class: 'tf-subnet-mono' }, g)
      g.style.opacity = '0'
      this.subnetRows.push(g)
      this.subnetRowData.push({ net, bc, range })
    }

    // 同网段判断卡
    this.checkEls = renderer.el('g', {}, renderer.layerLabels)
    renderer.el('rect', { x: X0, y: LIST_Y + 8 * 34 + 8, width: 752, height: 74, rx: 10, class: 'tf-ip-card' }, this.checkEls)
    const qText = renderer.el('text', { x: X0 + 18, y: LIST_Y + 8 * 34 + 32, class: 'tf-label--muted' }, this.checkEls)
    qText.textContent = '同网段判断(双方使用 A 的掩码做按位与):'
    this.checkAText = renderer.el('text', { x: X0 + 18, y: LIST_Y + 8 * 34 + 62, class: 'tf-subnet-mono' }, this.checkEls)
    this.checkBText = renderer.el('text', { x: X0 + 300, y: LIST_Y + 8 * 34 + 62, class: 'tf-subnet-mono' }, this.checkEls)
    this.checkResult = renderer.el('text', { x: X0 + 560, y: LIST_Y + 8 * 34 + 62, class: 'tf-subnet-result' }, this.checkEls)
    this.checkEls.style.opacity = '0'

    this.errorBanner = renderer.el('g', {}, renderer.layerOverlay)
    renderer.el('rect', { x: X0, y: 168, width: 752, height: 32, rx: 8, class: 'tf-ip-error-bg' }, this.errorBanner)
    this.errorText = renderer.el('text', { x: X0 + 16, y: 189, class: 'tf-ip-error-text' }, this.errorBanner)
    this.errorBanner.style.display = 'none'
  }

  protected buildSteps() {
    const { basePrefix, newPrefix } = this.config
    const borrow = newPrefix - basePrefix
    const base = this.baseOf()
    const valid = newPrefix > basePrefix && newPrefix <= 30

    const steps: SceneStep[] = [
      {
        id: 'base',
        title: '起始网段',
        description: `从一个完整网段 ${ipToString(base)}/${basePrefix} 出发。`,
        explanation: `起点是一个 **/${basePrefix}** 网段(掩码 \`${
          ipToString(prefixToMask(basePrefix))
        }\`),共有 **${2 ** (32 - basePrefix) - 2}** 个可用地址。现在把全部地址放在一个广播域里,广播流量会打扰每一台设备 —— 我们要把它切开。`,
        duration: 1200,
        action: 'base',
      },
      {
        id: 'borrow',
        title: `向主机位借 ${borrow} 位`,
        description: `前缀从 /${basePrefix} 变成 /${newPrefix},子网位亮橙色。`,
        explanation:
          borrow > 0
            ? `借出 **${borrow} 位主机位**做「子网位」。数学上:${borrow} 位能表示 **${2 ** borrow}** 个不同的子网编号;每个子网剩余 ${
                32 - newPrefix
              } 位主机位,可用地址 2^${32 - newPrefix} − 2 个。注意:借位越多,子网越多,但每个子网能容纳的主机越少 —— 这是一对此消彼长的权衡。`
            : '当前前缀配置没有借位(新前缀 ≤ 原前缀),无法划分子网。请在右侧实验面板选择更大的新前缀。',
        duration: 1300,
        action: 'borrow',
      },
      {
        id: 'list',
        title: `${valid ? 2 ** borrow : '?'} 个子网逐个展开`,
        description: '每个子网的块大小相同,起始地址依次排列。',
        explanation: `子网的**块大小** = 2^(新主机位数) = ${
          valid ? 2 ** (32 - newPrefix) : '?'
        },所以各子网的网络地址依次相差这个数。这是子网计算最实用的速算法:块大小 = 256 − 掩码最后一个非零字节的值。`,
        duration: 1400,
        action: 'list',
      },
      {
        id: 'detail',
        title: '每个子网的地址结构',
        description: '网络地址、广播地址与可用范围。',
        explanation:
          '每个子网内部结构和普通网段一样:主机位全 0 是网络地址,全 1 是广播地址,中间是可用范围。同一大网段被切开后,不同子网之间必须经过路由器(三层)转发 —— 它们是相互独立的广播域。',
        duration: 1200,
        action: 'detail',
      },
      {
        id: 'check',
        title: '判断两个 IP 是否同网段',
        description: '比较按位与之后的网络地址。',
        explanation: `判断规则:把 A、B 分别与**掩码**按位与,结果相同即同网段。注意永远使用**本机自己的掩码**参与运算。演示:${
          this.config.checkA
        } 与 ${this.config.checkB} 在 /${newPrefix} 下,${
          this.checkSame() ? '网络地址相同,属于同一子网' : '网络地址不同,属于不同子网,需要经过路由器'
        }。`,
        duration: 1300,
        action: 'check',
      },
    ]

    const transitions: StepTransition<SubnetSceneState>[] = [
      s => ({ ...s, showBorrow: false, visibleSubnets: 0, check: { ...s.check, done: false } }),
      s => ({ ...s, showBorrow: true }),
      s => ({ ...s, visibleSubnets: valid ? Math.min(4, 2 ** borrow) : 0 }),
      s => ({ ...s, visibleSubnets: valid ? Math.min(8, 2 ** borrow) : 0 }),
      s => ({ ...s, check: { a: this.config.checkA, b: this.config.checkB, done: true, same: this.checkSame() } }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): SubnetSceneState {
    return {
      base: this.baseOf(),
      basePrefix: this.config.basePrefix,
      newPrefix: this.config.newPrefix,
      showBorrow: false,
      visibleSubnets: 0,
      check: { a: this.config.checkA, b: this.config.checkB, done: false, same: false },
    }
  }

  private baseOf(): IPv4 {
    const parsed = parseIPv4(this.config.baseIp)
    return parsed.ok ? parsed.value : { octets: [192, 168, 1, 0] }
  }

  private checkSame(): boolean {
    const a = parseIPv4(this.config.checkA)
    const b = parseIPv4(this.config.checkB)
    if (!a.ok || !b.ok) return false
    return sameSubnet(a.value, b.value, this.config.newPrefix)
  }

  protected render(state: SubnetSceneState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const tl = opts.timeline
    const bits = ipToBits(state.base)
    if (this.baseText) this.baseText.textContent = `${ipToString(state.base)}/${state.basePrefix} → /${state.newPrefix}`
    if (this.maskText) {
      this.maskText.textContent =
        state.newPrefix > 30
          ? '/31、/32 不适合再划分主机位'
          : `掩码 ${ipToString(prefixToMask(state.basePrefix))} → ${ipToString(prefixToMask(state.newPrefix))}`
    }

    const isBorrow = (i: number) => i >= state.basePrefix && i < state.newPrefix
    for (let i = 0; i < 32; i++) {
      const rect = this.cellRects[i]
      const text = this.cellTexts[i]
      if (!rect || !text) continue
      text.textContent = bits[i] ?? ''
      const cls = ['tf-bit-cell', 'tf-bit-cell--on']
      if (i < state.basePrefix) cls.push('tf-bit-cell--net')
      else if (isBorrow(i)) cls.push('tf-bit-cell--borrow')
      else cls.push('tf-bit-cell--host')
      rect.setAttribute('class', cls.join(' '))
    }

    const subnets = computeSubnets(state.base, state.basePrefix, state.newPrefix)
    for (let i = 0; i < this.subnetRows.length; i++) {
      const row = this.subnetRows[i]
      const data = this.subnetRowData[i]
      if (!row || !data) continue
      const info = subnets[i]
      const visible = i < state.visibleSubnets && info
      if (info && data.net) data.net.textContent = `${info.network}/${state.newPrefix}`
      if (info && data.bc) data.bc.textContent = info.broadcast
      if (info && data.range) data.range.textContent = `${info.first} ~ ${info.last}(${info.count})`
      const idxEl = row.children[1] as SVGTextElement | undefined
      if (idxEl) idxEl.textContent = visible ? `#${i}` : ''
      const target = visible ? '1' : '0'
      if (tl) {
        tl.to(row, { opacity: target, duration: 0.3 }, i * 0.12)
      } else {
        row.style.opacity = target
      }
    }

    if (this.checkEls) {
      if (this.checkAText) this.checkAText.textContent = `A = ${this.config.checkA}`
      if (this.checkBText) this.checkBText.textContent = `B = ${this.config.checkB}`
      if (this.checkResult) {
        this.checkResult.textContent = !state.check.done
          ? ''
          : state.check.same
            ? '✓ 同一子网'
            : '✗ 不同子网'
        this.checkResult.setAttribute('class', `tf-subnet-result ${state.check.same ? 'ok' : 'bad'}`)
      }
      const target = state.check.done ? '1' : '0'
      if (tl) {
        tl.to(this.checkEls, { opacity: target, duration: 0.35 }, 0)
      } else {
        this.checkEls.style.opacity = target
      }
    }

    if (this.errorBanner && this.errorText) {
      if (this.config.error) {
        this.errorText.textContent = this.config.error
        this.errorBanner.style.display = 'block'
      } else {
        this.errorBanner.style.display = 'none'
      }
    }
  }

  protected snapshotData(state: SubnetSceneState, completedSteps: number): Record<string, unknown> {
    const subnets = computeSubnets(state.base, state.basePrefix, state.newPrefix)
    const borrow = state.newPrefix - state.basePrefix
    return {
      rows: [
        { label: '起始网段', value: `${ipToString(state.base)}/${state.basePrefix}`, tone: 'accent' },
        { label: '新前缀', value: `/${state.newPrefix}` },
        { label: '借位', value: `${Math.max(0, borrow)} 位 → ${borrow > 0 ? 2 ** borrow : 0} 个子网` },
        {
          label: '子网块大小',
          value: state.newPrefix <= 30 ? String(2 ** (32 - state.newPrefix)) : '—',
        },
        {
          label: '每子网可用',
          value: state.newPrefix <= 30 ? `${2 ** (32 - state.newPrefix) - 2} 个` : '(特殊前缀)',
        },
        { label: '子网 #0', value: subnets[0] ? `${subnets[0].network} ~ ${subnets[0].broadcast}` : '—' },
        { label: '同网段判断', value: state.check.done ? (state.check.same ? `${state.check.a} 与 ${state.check.b} 同网段` : `${state.check.a} 与 ${state.check.b} 不同网段`) : '未执行' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-base',
        label: '修改起始网段',
        description: '输入任意合法 IPv4 网段地址。',
        params: [{ name: 'ip', label: '网段地址', type: 'text', placeholder: '如 10.0.0.0' }],
      },
      {
        name: 'set-base-prefix',
        label: '修改原前缀',
        params: [
          {
            name: 'prefix',
            label: '原前缀',
            type: 'select',
            options: [16, 20, 22, 24, 25].map(n => ({ value: String(n), label: `/${n}` })),
          },
        ],
      },
      {
        name: 'set-new-prefix',
        label: '修改新前缀(借位结果)',
        params: [
          {
            name: 'prefix',
            label: '新前缀',
            type: 'select',
            options: [22, 24, 25, 26, 27, 28, 29, 30, 31].map(n => ({ value: String(n), label: `/${n}` })),
          },
        ],
      },
      {
        name: 'set-check',
        label: '设置同网段判断的 IP',
        params: [
          { name: 'a', label: 'IP A', type: 'text', placeholder: '192.168.1.20' },
          { name: 'b', label: 'IP B', type: 'text', placeholder: '192.168.1.200' },
        ],
      },
      {
        name: 'borrow-too-much',
        label: '借位过头(主机位不足)',
        description: '挑战:把新前缀拉到 /31,观察子网无法容纳任何常规主机。',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const clean = (v: unknown, fallback: string) => {
      const parsed = parseIPv4(String(v ?? ''))
      return parsed.ok ? ipToString(parsed.value) : fallback
    }
    switch (name) {
      case 'set-base':
        this.config = { ...this.config, baseIp: clean(params?.ip, this.config.baseIp), error: undefined }
        this.rebuild()
        break
      case 'set-base-prefix': {
        const n = Number(params?.prefix)
        if (n >= 0 && n <= 30) this.config = { ...this.config, basePrefix: n }
        this.rebuild()
        break
      }
      case 'set-new-prefix': {
        const n = Number(params?.prefix)
        if (n >= 0 && n <= 31) this.config = { ...this.config, newPrefix: n }
        this.rebuild()
        break
      }
      case 'set-check':
        this.config = {
          ...this.config,
          checkA: clean(params?.a, this.config.checkA),
          checkB: clean(params?.b, this.config.checkB),
        }
        this.rebuild()
        break
      case 'borrow-too-much':
        this.config = { ...this.config, newPrefix: 31, error: '新前缀 /31:主机位仅 1 位,子网不再有传统意义上的可用主机范围(RFC 3021 点对点场景)' }
        this.rebuild()
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new SubnetCidrScene(),
}

export default sceneModule
