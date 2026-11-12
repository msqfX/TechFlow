import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import type { SceneAction } from '@/engine/types/scene'
import {
  broadcastAddress,
  ipToBits,
  ipToString,
  isPrivate,
  networkAddress,
  parseIPv4,
  prefixToMask,
  usableRange,
} from './model'
import type { IPv4 } from './model'

/** IP 地址原理场景:32 位二进制位图 + 网络位/主机位高亮 + 地址计算 */

interface IpSceneState {
  ip: IPv4
  prefix: number
  showBits: boolean
  highlight: 'none' | 'network' | 'host'
  showCalc: boolean
}

interface IpSceneConfig {
  ip: string
  prefix: number
  error?: string
}

const VIEW = { width: 820, height: 470 }
const CELL = 22
const GAP = 2
const GROUP_GAP = 22
const X0 = 34
const BITS_Y = 150

const DEFAULT_CONFIG: IpSceneConfig = { ip: '192.168.1.100', prefix: 24 }

class IpAddressScene extends BaseScene<IpSceneState> {
  private config: IpSceneConfig = { ...DEFAULT_CONFIG }

  private ipText: SVGTextElement | null = null
  private maskText: SVGTextElement | null = null
  private cellRects: SVGRectElement[] = []
  private cellTexts: SVGTextElement[] = []
  private octetLabels: SVGTextElement[] = []
  private divider: SVGLineElement | null = null
  private calcEls: SVGGElement[] = []
  private errorBanner: SVGGElement | null = null
  private errorText: SVGTextElement | null = null

  constructor() {
    super({ id: 'ip-address', viewBox: VIEW, label: 'IPv4 地址二进制结构可视化' })
  }

  /* ---------- 视觉 ---------- */

  protected buildScene(renderer: SVGRenderer): void {
    this.ipText = renderer.el('text', {
      x: VIEW.width / 2,
      y: 52,
      'text-anchor': 'middle',
      class: 'tf-ip-decimal',
    })
    this.maskText = renderer.el('text', {
      x: VIEW.width / 2,
      y: 84,
      'text-anchor': 'middle',
      class: 'tf-label--mono',
    })

    this.cellRects = []
    this.cellTexts = []
    this.octetLabels = []

    for (let o = 0; o < 4; o++) {
      const gx = X0 + o * (8 * (CELL + GAP) + GROUP_GAP)
      const label = renderer.el('text', {
        x: gx + 4 * (CELL + GAP) - GAP,
        y: BITS_Y - 16,
        'text-anchor': 'middle',
        class: 'tf-label--mono',
      }, renderer.layerNodes)
      this.octetLabels.push(label)

      for (let b = 0; b < 8; b++) {
        const x = gx + b * (CELL + GAP)
        const rect = renderer.el('rect', {
          x,
          y: BITS_Y,
          width: CELL,
          height: 30,
          rx: 4,
          class: 'tf-bit-cell',
        }, renderer.layerNodes)
        const text = renderer.el('text', {
          x: x + CELL / 2,
          y: BITS_Y + 20,
          'text-anchor': 'middle',
          class: 'tf-bit-text',
        }, renderer.layerNodes)
        this.cellRects.push(rect)
        this.cellTexts.push(text)
      }
    }

    this.divider = renderer.el('line', {
      class: 'tf-ip-divider',
    }, renderer.layerNodes)

    // 三个计算结果卡
    const cardY = 268
    const cards = [
      { x: X0, title: '网络地址(主机位全 0)' },
      { x: X0 + 252, title: '广播地址(主机位全 1)' },
      { x: X0 + 504, title: '可用主机范围' },
    ]
    this.calcEls = cards.map(c => {
      const g = renderer.el('g', { class: 'tf-ip-calc' }, renderer.layerLabels)
      renderer.el('rect', { x: c.x, y: cardY, width: 234, height: 108, rx: 10, class: 'tf-ip-card' }, g)
      renderer.el('text', { x: c.x + 14, y: cardY + 26, class: 'tf-label--muted' }, g).textContent = c.title
      renderer.el('text', { x: c.x + 14, y: cardY + 62, class: 'tf-ip-card-value' }, g)
      renderer.el('text', { x: c.x + 14, y: cardY + 90, class: 'tf-label--mono' }, g)
      g.style.opacity = '0'
      return g
    })

    // 错误横幅(挑战模式:非法输入)
    this.errorBanner = renderer.el('g', { class: 'tf-ip-error' }, renderer.layerOverlay)
    renderer.el('rect', { x: X0, y: 216, width: 752, height: 36, rx: 8, class: 'tf-ip-error-bg' }, this.errorBanner)
    this.errorText = renderer.el('text', { x: X0 + 16, y: 239, class: 'tf-ip-error-text' }, this.errorBanner)
    this.errorBanner.style.display = 'none'
  }

  /* ---------- 步骤 ---------- */

  protected buildSteps() {
    const prefix = this.config.prefix
    const steps: SceneStep[] = [
      {
        id: 'decimal',
        title: '点分十进制地址',
        description: `地址 ${this.config.ip} 在计算机眼中并不是「四段数字」。`,
        explanation: `我们习惯用**点分十进制**书写 IPv4 地址(如 \`${this.config.ip}\`),但这只是给人看的形式。它的本质是 **32 个比特**,被切成 4 个字节,每个字节再转成十进制展示。此刻下方位图还是暗的 —— CPU 看到的就是接下来要展开的那一串 0 和 1。`,
        duration: 1200,
        action: 'decimal',
      },
      {
        id: 'binary',
        title: '展开为 32 位二进制',
        description: '把 4 个字节展开成 32 个比特。',
        explanation:
          '每个十进制数(0~255)对应 8 位二进制。比如 192 = `11000000`。这 32 个比特才是路由器真正参与运算的内容 —— 子网掩码、路由聚合都是在比特层面做按位与。',
        duration: 1200,
        action: 'binary',
      },
      {
        id: 'prefix',
        title: `应用 CIDR 前缀 /${prefix}`,
        description: `前 ${prefix} 位是网络位(蓝色)。`,
        explanation: `\`/${prefix}\` 表示从左数前 **${prefix} 位是网络位**,它决定这个地址属于哪个网段。写成十进制就是子网掩码 \`${
          ipToString(prefixToMask(prefix))
        }\`。掩码里连续的 1 对应网络位,连续的 0 对应主机位 —— 注意 1 必须连续,像 255.0.255.0 这样的掩码是非法的。`,
        duration: 1400,
        action: 'prefix',
      },
      {
        id: 'host',
        title: '剩下的主机位',
        description: `后 ${32 - prefix} 位是主机位(紫色)。`,
        explanation: `主机位共 **${32 - prefix} 位**,用来区分同一网段里的不同设备。同一个网段的设备:网络位完全相同,主机位各不相同。设备判断「目标是否与我同网段」时,会把双方 IP 分别与自己的掩码做按位与,再比较结果。`,
        duration: 1200,
        action: 'host',
      },
      {
        id: 'network-address',
        title: '计算网络地址',
        description: '主机位全部置 0,得到网段的「门牌号」。',
        explanation:
          '把主机位**全部置 0** 就得到**网络地址**,它代表整个网段本身,不能分配给任何设备。路由表里的目的网段写的就是它,例如 `192.168.1.0/24`。',
        duration: 1200,
        action: 'network-address',
      },
      {
        id: 'broadcast',
        title: '计算广播地址',
        description: '主机位全部置 1。',
        explanation:
          '把主机位**全部置 1** 得到**广播地址**。发往这个地址的数据,网段内所有设备都会接收处理(如 ARP 请求)。它同样不可分配 —— 这就是可用地址要「减 2」的原因。',
        duration: 1200,
        action: 'broadcast',
      },
      {
        id: 'range',
        title: '可用主机范围',
        description: '夹在网络地址和广播地址之间的地址才可用。',
        explanation: `可用地址数量 = 2^(主机位数) − 2。当前 /${prefix} 有 ${32 - prefix} 位主机位,可用 **${
          usableRange(this.ipOf(), prefix).count
        }** 个。注意:这个「减 2」公式只适用于主机位 ≥ 2 的普通前缀。`,
        duration: 1200,
        action: 'range',
      },
      {
        id: 'special',
        title: '特殊前缀:/31 与 /32',
        description: '不能套用「减 2」公式的两个特例。',
        explanation:
          '**/31**(主机位 1 位)按公式可用地址为 0,但 RFC 3021 规定在点对点链路上两个地址都可用,常用于路由器互联。**/32** 表示单个主机本身,用于回环地址或精确主机路由。本实验把前缀切到 /31 /32 可以看到它们不再显示「网络+广播」的传统结构。',
        duration: 1400,
        action: 'special',
      },
    ]

    const transitions: StepTransition<IpSceneState>[] = [
      s => ({ ...s, showBits: false, highlight: 'none', showCalc: false }),
      s => ({ ...s, showBits: true }),
      s => ({ ...s, prefix, highlight: 'network' }),
      s => ({ ...s, highlight: 'host' }),
      s => ({ ...s, showCalc: true, highlight: 'network' }),
      s => ({ ...s, showCalc: true, highlight: 'host' }),
      s => ({ ...s, showCalc: true }),
      s => ({ ...s, prefix: 31, showCalc: true, highlight: 'host' }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): IpSceneState {
    const parsed = this.parse()
    return {
      ip: parsed.ok ? parsed.value : { octets: [192, 168, 1, 100] },
      prefix: this.config.prefix,
      showBits: false,
      highlight: 'none',
      showCalc: false,
    }
  }

  /* ---------- 渲染 ---------- */

  private ipOf(): IPv4 {
    const parsed = this.parse()
    return parsed.ok ? parsed.value : { octets: [0, 0, 0, 0] }
  }

  private parse() {
    return parseIPv4(this.config.ip)
  }

  protected render(state: IpSceneState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const ip = state.ip
    const bits = ipToBits(ip)
    const tl = opts.timeline

    if (this.ipText) this.ipText.textContent = `${ipToString(ip)}/${state.prefix}`
    if (this.maskText) {
      this.maskText.textContent =
        state.prefix >= 31
          ? `掩码无传统意义(/${state.prefix} 特殊前缀)`
          : `子网掩码 ${ipToString(prefixToMask(state.prefix))}  ·  CIDR /${state.prefix}`
    }

    for (let o = 0; o < 4; o++) {
      const label = this.octetLabels[o]
      if (label) label.textContent = String(ip.octets[o])
    }

    // 位元格:0/1 + 网络位/主机位配色
    const isNet = (i: number) => i < state.prefix
    for (let i = 0; i < 32; i++) {
      const rect = this.cellRects[i]
      const text = this.cellTexts[i]
      if (!rect || !text) continue
      text.textContent = state.showBits ? (bits[i] ?? '') : ''
      const cls = ['tf-bit-cell']
      if (state.showBits) cls.push('tf-bit-cell--on')
      if (state.showBits && (state.highlight === 'network' || state.highlight === 'host')) {
        cls.push(isNet(i) ? 'tf-bit-cell--net' : 'tf-bit-cell--host')
      }
      rect.setAttribute('class', cls.join(' '))
    }

    // 分隔线:网络位与主机位的分界
    if (this.divider) {
      if (state.prefix >= 32 || !state.showBits) {
        this.divider.style.opacity = '0'
      } else {
        const lastNet = state.prefix - 1
        const gx = X0 + Math.floor(lastNet / 8) * (8 * (CELL + GAP) + GROUP_GAP)
        const x = gx + (lastNet % 8) * (CELL + GAP) + CELL + 1
        this.divider.setAttribute('x1', String(x))
        this.divider.setAttribute('x2', String(x))
        this.divider.setAttribute('y1', String(BITS_Y - 6))
        this.divider.setAttribute('y2', String(BITS_Y + 36))
        this.divider.style.opacity = '1'
      }
    }

    // 计算卡片
    const net = networkAddress(ip, state.prefix)
    const bc = broadcastAddress(ip, state.prefix)
    const range = usableRange(ip, state.prefix)
    const values = [
      `${ipToString(net)}`,
      state.prefix >= 31 ? '(特殊前缀,见下方说明)' : `${ipToString(bc)}`,
      state.prefix >= 31 ? `可用 ${range.count} 个` : `${range.first} ~ ${range.last}(${range.count} 个)`,
    ]
    const notes = [
      state.prefix >= 31 ? '主机位全 0 的规则不适用于 /31、/32' : `网络位 ${state.prefix} 位`,
      state.prefix >= 31 ? range.note ?? '' : `主机位 ${32 - state.prefix} 位`,
      range.note ?? '可用数量 = 2^主机位 − 2',
    ]
    this.calcEls.forEach((g, idx) => {
      const target = state.showCalc ? '1' : '0'
      const valueEl = g.children[2] as SVGTextElement | undefined
      const noteEl = g.children[3] as SVGTextElement | undefined
      if (valueEl) valueEl.textContent = values[idx] ?? ''
      if (noteEl) noteEl.textContent = notes[idx] ?? ''
      if (tl) {
        tl.to(g, { opacity: target, duration: 0.35 }, 0)
      } else {
        g.style.opacity = target
      }
    })

    // 错误横幅
    if (this.errorBanner && this.errorText) {
      if (this.config.error) {
        this.errorText.textContent = `非法地址:${this.config.error}`
        this.errorBanner.style.display = 'block'
      } else {
        this.errorBanner.style.display = 'none'
      }
    }
  }

  /* ---------- 快照 ---------- */

  protected snapshotData(state: IpSceneState, completedSteps: number): Record<string, unknown> {
    const ip = state.ip
    const range = usableRange(ip, state.prefix)
    const bits = ipToBits(ip)
    return {
      rows: [
        { label: 'IP 地址', value: `${ipToString(ip)}/${state.prefix}`, tone: 'accent' },
        {
          label: '子网掩码',
          value: state.prefix >= 31 ? `/${state.prefix}(特殊)` : ipToString(prefixToMask(state.prefix)),
        },
        {
          label: '二进制',
          value: (bits.match(/.{8}/g) ?? []).join(' '),
        },
        { label: '网络地址', value: ipToString(networkAddress(ip, state.prefix)) },
        {
          label: '广播地址',
          value: state.prefix >= 31 ? '(特殊前缀)' : ipToString(broadcastAddress(ip, state.prefix)),
        },
        { label: '可用范围', value: range.note ? `${range.first} ~ ${range.last}` : `${range.first} ~ ${range.last}` },
        { label: '可用数量', value: `${range.count} 个` },
        { label: '地址类型', value: isPrivate(ip) ? '私有地址(RFC 1918)' : '公有地址' },
        { label: '校验', value: this.config.error ? this.config.error : '通过', tone: this.config.error ? 'danger' : 'success' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
      ],
    }
  }

  /* ---------- 实验模式 ---------- */

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-ip',
        label: '修改 IP 地址',
        description: '输入任意 IPv4 地址,观察二进制与计算结果变化。',
        params: [{ name: 'ip', label: 'IPv4 地址', type: 'text', placeholder: '如 172.16.8.9' }],
      },
      {
        name: 'set-prefix',
        label: '修改 CIDR 前缀',
        description: '切换网络位/主机位的分界。',
        params: [
          {
            name: 'prefix',
            label: '前缀长度',
            type: 'select',
            options: [8, 16, 20, 24, 26, 28, 30, 31, 32].map(n => ({ value: String(n), label: `/${n}` })),
          },
        ],
      },
      { name: 'random-ip', label: '随机一个地址', description: '生成随机合法 IPv4 地址(私有段)。' },
      {
        name: 'break-ip',
        label: '输入一个非法地址',
        description: '挑战:观察合法性校验如何拦截错误输入。',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    switch (name) {
      case 'set-ip': {
        const raw = String(params?.ip ?? '')
        const parsed = parseIPv4(raw)
        if (!parsed.ok) {
          this.config = { ...this.config, error: parsed.error }
        } else {
          this.config = { ip: ipToString(parsed.value), prefix: this.config.prefix }
        }
        this.rebuild()
        break
      }
      case 'set-prefix': {
        const n = Number(params?.prefix)
        if (Number.isInteger(n) && n >= 0 && n <= 32) {
          this.config = { ip: this.config.ip, prefix: n }
          this.rebuild()
        }
        break
      }
      case 'random-ip': {
        const r = () => 1 + Math.floor(Math.random() * 253)
        const ip: IPv4 = { octets: [192, 168, r(), r()] }
        this.config = { ip: ipToString(ip), prefix: this.config.prefix }
        this.rebuild()
        break
      }
      case 'break-ip': {
        this.config = { ...this.config, ip: '256.10.88.1', error: '256 超出 0~255 范围' }
        this.rebuild()
        break
      }
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new IpAddressScene(),
}

export default sceneModule
