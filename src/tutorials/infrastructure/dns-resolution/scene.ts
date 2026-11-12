import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Connection } from '@/engine/components/Connection'
import type { SceneAction } from '@/engine/types/scene'

/** DNS 解析场景:递归 + 迭代查询、三级缓存、故障模拟 */

type DnsNodeId = 'browser' | 'local' | 'root' | 'tld' | 'auth' | 'target'

export interface DnsPacket {
  id: string
  from: DnsNodeId
  to: DnsNodeId
  kind: 'query' | 'response'
  label: string
  lost: boolean
}

export interface DnsSceneState {
  domain: string
  caches: { browser: string | null; os: string | null; local: string | null }
  packets: DnsPacket[]
  active: DnsNodeId | null
  /** 命中的缓存层 */
  hit: 'none' | 'browser' | 'os' | 'local'
  failure: 'none' | 'nxdomain' | 'timeout'
  result: string | null
  ttl: number
  log: string[]
}

interface DnsSceneConfig {
  domain: string
  scenario: 'normal' | 'cached' | 'nxdomain' | 'timeout'
  ttl: number
}

const VIEW = { width: 840, height: 560 }

const NODE_POS: Record<DnsNodeId, { x: number; y: number }> = {
  browser: { x: 110, y: 400 },
  local: { x: 370, y: 400 },
  root: { x: 370, y: 130 },
  tld: { x: 600, y: 130 },
  auth: { x: 750, y: 130 },
  target: { x: 640, y: 400 },
}

const DEFAULT_CONFIG: DnsSceneConfig = {
  domain: 'www.example.com',
  scenario: 'normal',
  ttl: 300,
}

let pktSeq = 0
function makePkt(from: DnsNodeId, to: DnsNodeId, kind: DnsPacket['kind'], label: string, lost = false): DnsPacket {
  pktSeq += 1
  return { id: `dns-pkt-${pktSeq}`, from, to, kind, label, lost }
}

class DnsResolutionScene extends BaseScene<DnsSceneState> {
  private config: DnsSceneConfig = { ...DEFAULT_CONFIG }

  private nodes: Partial<Record<DnsNodeId, NetworkNode>> = {}
  private cacheChips: Array<{ el: SVGGElement; title: string; value: SVGTextElement }> = []
  private failBanner: SVGGElement | null = null
  private failText: SVGTextElement | null = null
  private slots: Packet[] = []

  constructor() {
    super({ id: 'dns-resolution', viewBox: VIEW, label: 'DNS 域名解析拓扑' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    const mk = (id: DnsNodeId, label: string, glyph: string, w = 120) => {
      const pos = NODE_POS[id]
      this.nodes[id] = new NetworkNode(renderer, {
        id, x: pos.x, y: pos.y, width: w, height: 54, label, glyph, shape: 'rect',
      })
    }
    mk('browser', '浏览器', '你', 110)
    mk('local', '本地 DNS', 'LDNS', 130)
    mk('root', '根域名服务器', 'ROOT', 130)
    mk('tld', '.com TLD', 'TLD', 130)
    mk('auth', '权威 DNS', 'AUTH', 130)
    mk('target', '目标服务器', 'HTTP', 130)

    const conn = (a: DnsNodeId, b: DnsNodeId, dashed = false, label?: string) => {
      const pa = NODE_POS[a]
      const pb = NODE_POS[b]
      new Connection(renderer, {
        id: `${a}-${b}`,
        from: { x: pa.x, y: pa.y },
        to: { x: pb.x, y: pb.y },
        dashed,
        label,
        arrowColor: 'muted',
      })
    }
    conn('browser', 'local', false, '递归查询')
    conn('local', 'root', true, '迭代①')
    conn('local', 'tld', true, '迭代②')
    conn('local', 'auth', true, '迭代③')
    conn('browser', 'target', true)

    // 缓存芯片(浏览器缓存 / OS 缓存与 hosts)
    const chipTitles = ['浏览器缓存', 'OS 缓存 / hosts']
    this.cacheChips = chipTitles.map((title, i) => {
      const g = renderer.el('g', {}, renderer.layerLabels)
      renderer.el('rect', { x: 44, y: 460 + i * 40, width: 190, height: 30, rx: 8, class: 'tf-label-pill-bg' }, g)
      renderer.el('text', { x: 56, y: 480 + i * 40, class: 'tf-label--muted' }, g).textContent = title
      const value = renderer.el('text', { x: 226, y: 480 + i * 40, 'text-anchor': 'end', class: 'tf-subnet-mono' }, g)
      value.textContent = '空'
      return { el: g, title, value }
    })

    // 本地 DNS 缓存芯片
    const localChip = renderer.el('g', {}, renderer.layerLabels)
    renderer.el('rect', { x: 280, y: 460, width: 220, height: 30, rx: 8, class: 'tf-label-pill-bg' }, localChip)
    renderer.el('text', { x: 292, y: 480, class: 'tf-label--muted' }, localChip).textContent = '本地 DNS 缓存'
    const localValue = renderer.el('text', { x: 488, y: 480, 'text-anchor': 'end', class: 'tf-subnet-mono' }, localChip)
    localValue.textContent = '空'
    this.cacheChips.push({ el: localChip, title: 'local', value: localValue })

    // 故障横幅
    this.failBanner = renderer.el('g', {}, renderer.layerOverlay)
    renderer.el('rect', { x: 60, y: 40, width: 500, height: 40, rx: 9, class: 'tf-ip-error-bg' }, this.failBanner)
    this.failText = renderer.el('text', { x: 78, y: 66, class: 'tf-ip-error-text' }, this.failBanner)
    this.failBanner.style.display = 'none'

    // 报文槽位(最多 14)
    this.slots = []
    for (let i = 0; i < 14; i++) {
      this.slots.push(new Packet(renderer, { id: `dns-slot-${i}`, color: 'accent', shape: 'rect', width: 66, height: 22 }))
    }
  }

  protected buildSteps() {
    const domain = this.config.domain
    const ip = '93.184.216.34'
    const ttl = this.config.ttl
    const scenario = this.config.scenario

    if (scenario === 'cached') {
      const steps: SceneStep[] = [
        {
          id: 'cached-input',
          title: '再次访问同一域名',
          description: '解析过的域名,各级缓存里已经有答案。',
          explanation: `这是**第二次访问** \`${domain}\`:浏览器缓存、OS 缓存、本地 DNS 缓存中都保存着上次的答案(IP=${ip},TTL=${ttl}s)。整个过程**没有任何网络查询** —— 这是 DNS 对性能的第一贡献。`,
          duration: 1200,
          action: 'cached-input',
        },
        {
          id: 'hit',
          title: '浏览器缓存直接命中',
          description: '第 1 层缓存就命中,解析结束。',
          explanation:
            '缓存检查顺序:浏览器缓存 → OS 缓存/hosts → 本地 DNS 缓存。**命中即结束**,不命中才向下一层走。TTL 是权威服务器给记录设定的「保鲜期」,期间缓存可以直接回答;TTL 过期后必须重新解析。改 hosts 文件可以优先于一切缓存,这是本地调试的常用手段。',
          duration: 1300,
          action: 'hit',
        },
        {
          id: 'connect',
          title: '直接使用缓存的 IP 建立连接',
          description: '拿到 IP,后续进入 TCP 握手。',
          explanation: `浏览器拿到 \`${ip}\` 后立即开始 TCP 三次握手(详见 TCP 握手教程)。这就是为什么第二次打开同一个网站的首屏往往明显更快 —— 除了资源缓存,DNS 缓存也省掉了一整轮解析。`,
          duration: 1200,
          action: 'connect',
        },
      ]
      const transitions: StepTransition<DnsSceneState>[] = [
        s => ({ ...s, hit: 'browser', caches: { browser: ip, os: ip, local: ip }, active: 'browser', log: [`浏览器缓存命中:${domain} → ${ip}(剩余 TTL ${ttl}s)`] }),
        s => ({ ...s, hit: 'browser', log: [...s.log, '第 1 层缓存命中,无需查询任何 DNS 服务器'] }),
        s => ({ ...s, active: 'target', result: ip, log: [...s.log, `使用 ${ip} 发起 TCP 连接(见 TCP 教程)`] }),
      ]
      return { steps, transitions }
    }

    const steps: SceneStep[] = [
      {
        id: 'input',
        title: '用户输入域名',
        description: `浏览器要访问 ${domain},先要拿到它的 IP。`,
        explanation: `HTTP 请求必须发往一个 **IP 地址**,而用户输入的是域名。浏览器首先要完成 \`${domain}\` 的解析。注意一个常见误区:**浏览器并不是每次都去问 DNS 服务器**,它先查自己手里的缓存。`,
        duration: 1200,
        action: 'input',
      },
      {
        id: 'cache-browser',
        title: '检查浏览器缓存',
        description: '进程内的 DNS 缓存,本次会话内有效。',
        explanation:
          '浏览器(如 Chrome)内部维护一份 DNS 缓存,TTL 较短。刚才的 scenario 中没有命中 → 继续向下。**命中的话整个解析到这里就结束了**(切换到右侧「缓存命中」场景可以看到)。',
        duration: 1100,
        action: 'cache-browser',
      },
      {
        id: 'cache-os',
        title: '检查操作系统缓存与 hosts',
        description: 'getaddrinfo 层面:系统缓存 + hosts 文件。',
        explanation:
          '下一步是操作系统的解析器缓存(getaddrinfo)。**hosts 文件**也在这里生效 —— 它的优先级高于一切 DNS 查询,可以直接改写解析结果,是把域名指向本机做调试的标准做法。',
        duration: 1100,
        action: 'cache-os',
      },
      {
        id: 'ask-local',
        title: '请求本地 DNS(递归查询)',
        description: '客户端 → 本地 DNS:必须给最终答案。',
        explanation: `本机把域名交给配置的本地 DNS(运营商的,或 8.8.8.8 / 114.114.114.114)。这是**递归查询**:本地 DNS 负责把最终答案(或错误)交回来,客户端不再操心中间过程。责任转移完成。`,
        duration: 1400,
        action: 'ask-local',
      },
      {
        id: 'local-cache',
        title: '本地 DNS 检查自己的缓存',
        description: '大部分真实请求在这里直接命中。',
        explanation:
          '本地 DNS 服务器的缓存服务了成千上万的用户,热门域名命中率极高 —— **绝大多数解析请求根本不会走到根服务器**。本次模拟未命中,开始迭代查询。',
        duration: 1100,
        action: 'local-cache',
      },
      {
        id: 'ask-root',
        title: '迭代①:询问根域名服务器',
        description: '根 DNS 不知道答案,但知道谁管 .com。',
        explanation: `本地 DNS 向**根域名服务器**发起**迭代查询**。根服务器不保存具体域名记录,它回答的是「**.com 顶级域由这些 TLD 服务器负责**」—— 一次"指路"。全球 13 组根服务器(Anycast 部署了上千节点)是整个体系的入口。`,
        duration: 1500,
        action: 'ask-root',
      },
      {
        id: 'ask-tld',
        title: '迭代②:询问 .com TLD 服务器',
        description: 'TLD 告诉本地 DNS:example.com 的权威服务器在哪。',
        explanation:
          'TLD 服务器管理 .com 下所有注册域的**委托关系**。它同样不存最终 IP,而是回答「example.com 的权威 DNS 服务器是这些」。逐级委托的设计让任何一台服务器都只需要知道自己下一层的事。',
        duration: 1400,
        action: 'ask-tld',
      },
      {
        id: 'ask-auth',
        title: '迭代③:询问权威 DNS',
        description: '权威服务器给出最终记录。',
        explanation: `权威服务器保存着 \`${domain}\` 的 **A 记录**,它给出最终答案:${ip},并附带 **TTL=${ttl}s**(缓存保鲜期)。至此迭代查询结束,本地 DNS 拿到了完整答案。`,
        duration: 1500,
        action: 'ask-auth',
      },
      {
        id: 'answer',
        title: '本地 DNS 返回结果并写入缓存',
        description: '答案沿递归链路返回客户端。',
        explanation: `本地 DNS 把 ${ip} 返回给操作系统/浏览器,同时**按 TTL 把记录写进自己的缓存** —— 下一个问同样域名的用户就能直接命中。缓存命中率是 DNS 服务器的核心性能指标。`,
        duration: 1300,
        action: 'answer',
      },
      {
        id: 'connect',
        title: '浏览器发起 TCP 连接',
        description: '拿到 IP,解析完成,开始下一步。',
        explanation: `浏览器终于拿到了 \`${ip}\`,接下来才是熟悉的流程:TCP 三次握手 →(HTTPS 则 TLS 握手)→ HTTP 请求。DNS 只解决了「去哪找」的问题;完整链路见《HTTP 请求全过程》教程。`,
        duration: 1200,
        action: 'connect',
      },
    ]

    let transitions: StepTransition<DnsSceneState>[]
    if (scenario === 'nxdomain') {
      transitions = [
        s => ({ ...s, active: 'browser' }),
        s => ({ ...s, log: [...s.log, '浏览器缓存未命中'] }),
        s => ({ ...s, log: [...s.log, 'OS 缓存与 hosts 均未命中'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('browser', 'local', 'query', `? ${domain}`)], active: 'local', log: [...s.log, '递归查询:浏览器 → 本地 DNS'] }),
        s => ({ ...s, log: [...s.log, '本地 DNS 缓存未命中,开始迭代'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'root', 'query', `? ${domain}`)], log: [...s.log, '迭代①:询问根服务器'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'tld', 'query', `? ${domain}`)], log: [...s.log, '迭代②:询问 .com TLD'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'auth', 'query', `? ${domain}`)], log: [...s.log, '迭代③:询问权威服务器'] }),
        s => ({ ...s, failure: 'nxdomain', active: 'auth', log: [...s.log, `权威服务器回答:NXDOMAIN —— 域名不存在(检查拼写)`] }),
        s => ({ ...s, log: [...s.log, '解析失败:浏览器显示无法访问该站点'] }),
      ]
    } else if (scenario === 'timeout') {
      transitions = [
        s => ({ ...s, active: 'browser' }),
        s => ({ ...s, log: [...s.log, '浏览器缓存未命中'] }),
        s => ({ ...s, log: [...s.log, 'OS 缓存与 hosts 均未命中'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('browser', 'local', 'query', `? ${domain}`)], active: 'local', log: [...s.log, '递归查询:浏览器 → 本地 DNS'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'root', 'query', `? ${domain}`, true)], failure: 'timeout', log: [...s.log, '迭代①:询问根服务器 —— 报文丢失,无响应!'] }),
        s => ({ ...s, log: [...s.log, '本地 DNS 超时,指数退避后重试(1s → 2s → 4s…)'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'root', 'query', `? ${domain}`)], log: [...s.log, '重试成功,继续迭代流程'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'tld', 'query', `? ${domain}`)], log: [...s.log, '迭代②:询问 TLD'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'auth', 'query', `? ${domain}`)], log: [...s.log, '迭代③:询问权威服务器'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'auth', 'response', ip, false), makePkt('local', 'browser', 'response', `${ip} TTL=${ttl}`)], caches: { browser: ip, os: ip, local: ip }, result: ip, log: [...s.log, `解析成功:${ip}(TTL=${ttl}s),但这一次明显更慢`] }),
      ]
    } else {
      transitions = [
        s => ({ ...s, active: 'browser' }),
        s => ({ ...s, log: [...s.log, '浏览器缓存未命中'] }),
        s => ({ ...s, log: [...s.log, 'OS 缓存与 hosts 均未命中'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('browser', 'local', 'query', `? ${domain}`)], active: 'local', log: [...s.log, '递归查询:浏览器 → 本地 DNS'] }),
        s => ({ ...s, log: [...s.log, '本地 DNS 缓存未命中,开始迭代查询'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'root', 'query', `? ${domain}`), makePkt('local', 'root', 'response', '→ 问 .com TLD')], log: [...s.log, '迭代①:根服务器指路 .com TLD'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'tld', 'query', `? ${domain}`), makePkt('local', 'tld', 'response', '→ 权威 DNS')], log: [...s.log, '迭代②:TLD 指路权威服务器'] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'auth', 'query', `? ${domain}`), makePkt('local', 'auth', 'response', `${ip} TTL=${ttl}`)], log: [...s.log, `迭代③:权威服务器返回 ${ip}(TTL=${ttl}s)`] }),
        s => ({ ...s, packets: [...s.packets, makePkt('local', 'browser', 'response', `${ip} TTL=${ttl}`)], caches: { browser: ip, os: ip, local: ip }, result: ip, log: [...s.log, '答案沿递归链路返回,各级缓存写入'] }),
        s => ({ ...s, active: 'target', log: [...s.log, `浏览器使用 ${ip} 发起 TCP 连接`] }),
      ]
    }

    return { steps, transitions }
  }

  protected buildInitialState(): DnsSceneState {
    const preset = this.config.scenario === 'cached'
      ? { browser: '93.184.216.34', os: '93.184.216.34', local: '93.184.216.34' }
      : { browser: null, os: null, local: null }
    return {
      domain: this.config.domain,
      caches: preset,
      packets: [],
      active: null,
      hit: 'none',
      failure: 'none',
      result: null,
      ttl: this.config.ttl,
      log: [`域名:${this.config.domain} · 场景:${this.scenarioLabel()}`],
    }
  }

  private scenarioLabel(): string {
    return {
      normal: '完整解析(未命中)',
      cached: '缓存命中',
      nxdomain: 'NXDOMAIN(域名不存在)',
      timeout: '根服务器超时',
    }[this.config.scenario]
  }

  protected render(state: DnsSceneState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const tl = opts.timeline

    for (const id of ['browser', 'local', 'root', 'tld', 'auth', 'target'] as DnsNodeId[]) {
      const node = this.nodes[id]
      if (!node) continue
      const active = state.active === id
      const dim = state.hit === 'browser' && ['root', 'tld', 'auth'].includes(id) && state.active !== 'target'
      if (active) node.setStatus('active')
      else if (dim) node.setStatus('dim')
      else node.setStatus('idle')
    }

    // 缓存芯片
    const chipValues = [state.caches.browser, state.caches.os, state.caches.local]
    this.cacheChips.forEach((chip, i) => {
      const v = chipValues[i]
      chip.value.textContent = v ? `${v} · TTL ${state.ttl}s` : '空'
      chip.value.setAttribute('class', `tf-subnet-mono ${v ? 'ok' : ''}`)
    })

    // 报文
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (!slot) continue
      const pkt = state.packets[i]
      if (!pkt) {
        slot.show(false)
        continue
      }
      const a = NODE_POS[pkt.from]
      const b = NODE_POS[pkt.to]
      const settled = !opts.animate || i < state.packets.length - 1 || tl === null
      const color = pkt.lost ? 'danger' : pkt.kind === 'response' ? 'success' : 'accent'
      slot.options.color = color
      const body = slot.group.querySelector('.tf-packet-body-rect') as SVGRectElement | null
      if (body) body.setAttribute('class', `tf-packet-body-rect tf-packet-body--${color}`)
      // 双包(查询+应答)走同一条链路:用微小偏移区分
      const off = pkt.kind === 'response' ? 22 : 0
      const ax = a.x - (pkt.from === 'auth' ? 0 : 0)
      const bx = b.x
      const from = { x: ax, y: a.y + off + 26 }
      const to = { x: bx, y: b.y + off + 26 }
      if (tl && !settled) {
        slot.placeAt(from.x, from.y)
        slot.show(!pkt.lost || true)
        if (pkt.lost) {
          tl.to(slot.group, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, duration: 0.6 }, 0)
          tl.to(slot.group, { opacity: 0.6, duration: 0.3 }, 0.45)
        } else {
          tl.to(slot.group, { x: to.x, y: to.y, duration: 0.75, ease: 'power1.inOut' }, 0)
        }
      } else {
        slot.placeAt(pkt.lost ? (from.x + to.x) / 2 : to.x, pkt.lost ? (from.y + to.y) / 2 : to.y)
        slot.show(true)
      }
    }

    // 故障横幅
    if (this.failBanner && this.failText) {
      if (state.failure === 'nxdomain') {
        this.failText.textContent = `NXDOMAIN:权威服务器明确回答 ${state.domain} 不存在 —— 检查域名拼写`
        this.failBanner.style.display = 'block'
      } else if (state.failure === 'timeout') {
        this.failText.textContent = `查询超时:根服务器无响应,本地 DNS 将指数退避重试`
        this.failBanner.style.display = 'block'
      } else {
        this.failBanner.style.display = 'none'
      }
    }
  }

  protected snapshotData(state: DnsSceneState, completedSteps: number): Record<string, unknown> {
    return {
      rows: [
        { label: '查询域名', value: state.domain, tone: 'accent' },
        { label: '场景', value: this.scenarioLabel() },
        { label: '浏览器缓存', value: state.caches.browser ?? '空', tone: state.caches.browser ? 'success' : 'default' },
        { label: 'OS 缓存/hosts', value: state.caches.os ?? '空', tone: state.caches.os ? 'success' : 'default' },
        { label: '本地 DNS 缓存', value: state.caches.local ?? '空', tone: state.caches.local ? 'success' : 'default' },
        { label: '缓存命中层', value: state.hit === 'none' ? '未命中' : state.hit === 'browser' ? '浏览器' : state.hit === 'os' ? '操作系统' : '本地 DNS' },
        { label: '解析结果', value: state.result ?? (state.failure === 'nxdomain' ? 'NXDOMAIN' : '查询中…'), tone: state.failure === 'nxdomain' ? 'danger' : state.result ? 'success' : 'default' },
        { label: 'TTL', value: `${state.ttl}s` },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-domain',
        label: '修改域名',
        description: '换一个域名观察解析流程。',
        params: [{ name: 'domain', label: '域名', type: 'text', placeholder: 'www.example.com' }],
      },
      {
        name: 'scenario-normal',
        label: '完整解析(缓存全空)',
      },
      {
        name: 'scenario-cached',
        label: '模拟缓存命中',
        description: '第二次访问:一级缓存直接命中。',
      },
      {
        name: 'scenario-nxdomain',
        label: '模拟 NXDOMAIN',
        description: '挑战:域名不存在,看权威服务器如何回答。',
        danger: true,
      },
      {
        name: 'scenario-timeout',
        label: '模拟 DNS 超时',
        description: '挑战:根服务器无响应,观察重试机制。',
        danger: true,
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    switch (name) {
      case 'set-domain': {
        const domain = String(params?.domain ?? '').trim()
        if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
          this.config.domain = domain
          this.rebuild()
        }
        break
      }
      case 'scenario-normal':
        this.config.scenario = 'normal'
        this.rebuild()
        break
      case 'scenario-cached':
        this.config.scenario = 'cached'
        this.rebuild()
        break
      case 'scenario-nxdomain':
        this.config.scenario = 'nxdomain'
        this.rebuild()
        break
      case 'scenario-timeout':
        this.config.scenario = 'timeout'
        this.rebuild()
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new DnsResolutionScene(),
}

export default sceneModule
