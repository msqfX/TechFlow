import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Connection } from '@/engine/components/Connection'
import type { SceneAction } from '@/engine/types/scene'

/** HTTP 请求全过程场景:阶段流水线 + 请求/响应报文动画 */

export type StageId = 'url' | 'dns' | 'tcp' | 'tls' | 'request' | 'server' | 'response' | 'parse' | 'render'

export interface HttpStage {
  id: StageId
  title: string
  status: 'pending' | 'active' | 'done'
  note: string
}

export interface HttpSceneState {
  protocol: 'http' | 'https'
  stages: HttpStage[]
  dnsIp: string | null
  statusCode: number | null
  /** 正在传输的报文:'request' | 'response' | null */
  inFlight: 'request' | 'response' | null
  log: string[]
}

interface HttpSceneConfig {
  url: string
  protocol: 'http' | 'https'
  statusCode: number
}

const VIEW = { width: 840, height: 600 }
const ROW_X = 60
const ROW_W = 400
const ROW_Y0 = 74
const ROW_H = 52
const ROW_GAP = 12

const DEFAULT_CONFIG: HttpSceneConfig = {
  url: 'www.example.com/index.html',
  protocol: 'https',
  statusCode: 200,
}

const IP = '93.184.216.34'

class HttpFlowScene extends BaseScene<HttpSceneState> {
  private config: HttpSceneConfig = { ...DEFAULT_CONFIG }

  private browserNode!: NetworkNode
  private serverNode!: NetworkNode
  private stageRows: Array<{ g: SVGGElement; box: SVGRectElement; title: SVGTextElement; note: SVGTextElement; status: SVGTextElement }> = []
  private requestPacket!: Packet
  private responsePacket!: Packet
  private statusChip: SVGTextElement | null = null
  private urlLabel: SVGTextElement | null = null

  constructor() {
    super({ id: 'http-flow', viewBox: VIEW, label: 'HTTP 请求全过程' })
  }

  private stageDefs(): Array<{ id: StageId; title: string; note: string }> {
    const https = this.config.protocol === 'https'
    const defs: Array<{ id: StageId; title: string; note: string }> = [
      { id: 'url', title: '1. URL 解析', note: this.config.url },
      { id: 'dns', title: '2. DNS 查询', note: `域名 → ${IP}` },
      { id: 'tcp', title: '3. TCP 三次握手', note: 'SYN → SYN+ACK → ACK(443/80 端口)' },
      ...(https ? [{ id: 'tls' as StageId, title: '4. TLS 握手', note: '证书验证 + 协商会话密钥' }] : []),
      { id: 'request', title: https ? '5. 发送 HTTP 请求' : '4. 发送 HTTP 请求', note: `GET /index.html${https ? '(TLS 加密)' : '(明文!)'}` },
      { id: 'server', title: https ? '6. 服务端处理' : '5. 服务端处理', note: '容器 → 应用 → 可能访问数据库' },
      { id: 'response', title: https ? '7. 返回 HTTP 响应' : '6. 返回 HTTP 响应', note: `状态码 ${this.config.statusCode} + HTML` },
      { id: 'parse', title: https ? '8. 解析 HTML' : '7. 解析 HTML', note: '构建 DOM / CSSOM,加载子资源' },
      { id: 'render', title: https ? '9. 页面渲染' : '8. 页面渲染', note: '布局 → 绘制 → 呈现' },
    ]
    return defs
  }

  protected buildScene(renderer: SVGRenderer): void {
    this.urlLabel = renderer.el('text', {
      x: VIEW.width / 2,
      y: 36,
      'text-anchor': 'middle',
      class: 'tf-ip-decimal',
    }, renderer.layerLabels)

    this.browserNode = new NetworkNode(renderer, {
      id: 'browser', x: 620, y: 140, width: 130, height: 56, label: '浏览器', glyph: 'Browser',
    })
    this.serverNode = new NetworkNode(renderer, {
      id: 'server', x: 620, y: 460, width: 130, height: 56, label: 'Web 服务器', glyph: 'Server',
    })

    new Connection(renderer, {
      id: 'main-lane',
      from: { x: 620, y: 168 },
      to: { x: 620, y: 432 },
      arrow: false,
    })

    this.statusChip = renderer.el('text', {
      x: 740,
      y: 470,
      class: 'tf-subnet-result ok',
    }, renderer.layerLabels)

    this.stageRows = []
    for (let i = 0; i < 9; i++) {
      const g = renderer.el('g', {}, renderer.layerLabels)
      const box = renderer.el('rect', {
        x: ROW_X, y: ROW_Y0 + i * (ROW_H + ROW_GAP), width: ROW_W, height: ROW_H, rx: 9,
        class: 'tf-http-stage',
      }, g)
      const status = renderer.el('text', {
        x: ROW_X + 20, y: ROW_Y0 + i * (ROW_H + ROW_GAP) + 32, class: 'tf-http-status',
      }, g)
      const title = renderer.el('text', {
        x: ROW_X + 46, y: ROW_Y0 + i * (ROW_H + ROW_GAP) + 24, class: 'tf-http-title',
      }, g)
      const note = renderer.el('text', {
        x: ROW_X + 46, y: ROW_Y0 + i * (ROW_H + ROW_GAP) + 42, class: 'tf-subnet-mono',
      }, g)
      g.style.opacity = '0'
      this.stageRows.push({ g, box, title, note, status })
    }

    this.requestPacket = new Packet(renderer, { id: 'http-req', color: 'accent', shape: 'rect', width: 96, height: 26 })
    this.responsePacket = new Packet(renderer, { id: 'http-res', color: 'success', shape: 'rect', width: 96, height: 26 })
  }

  protected buildSteps() {
    const https = this.config.protocol === 'https'
    const code = this.config.statusCode
    const stageTitles = this.stageDefs()

    const steps: SceneStep[] = [
      {
        id: 'url',
        title: '输入 URL 并解析',
        description: '拆出协议、主机、路径、端口。',
        explanation: `浏览器先解析 \`${this.config.url}\`:协议 ${https ? '**https**(默认 443 端口)' : '**http**(默认 80 端口)'},主机 www.example.com,路径 /index.html。URL 决定了后续每一步:DNS 查询的目标、连接的端口、要不要 TLS。当前模式:**${https ? 'HTTPS' : 'HTTP(明文,可在右侧切换对比)'}**。`,
        duration: 1200,
        action: 'url',
      },
      {
        id: 'dns',
        title: 'DNS 查询拿到 IP',
        description: `www.example.com → ${IP}`,
        explanation: `走完 DNS 缓存/递归/迭代流程(详见 DNS 教程),浏览器拿到服务器 IP **${IP}**。URL 里如果没有显式端口,浏览器按协议默认端口连接:${https ? '443' : '80'}。`,
        duration: 1300,
        action: 'dns',
      },
      {
        id: 'tcp',
        title: 'TCP 三次握手',
        description: '与目标 IP 建立可靠连接。',
        explanation: `与 ${IP}:${https ? '443' : '80'} 完成 SYN → SYN+ACK → ACK。连接建立后才有「发送 HTTP 请求」的通道。HTTP/1.1 默认 keep-alive:这个连接稍后会被后续请求复用,避免重复握手。`,
        duration: 1300,
        action: 'tcp',
      },
      {
        id: 'tls',
        title: https ? 'TLS 握手(HTTPS)' : 'TLS 握手(已跳过)',
        description: https ? '验证证书 + 协商加密密钥(1~2 个 RTT)。' : 'HTTP 模式没有这一步。',
        explanation: https
          ? '客户端验证**证书链**(系统根 CA → 中间 CA → 站点证书,核对域名与有效期),双方用非对称加密交换材料、推导出**对称会话密钥**;之后所有 HTTP 报文都用它加密。TLS 1.3 只要 1-RTT。注意 HTTPS 不改变 HTTP 语义,只是在传输层加了密。'
          : '**当前是 HTTP 模式**:没有 TLS,请求和响应全部**明文**传输,路径上的任何设备都能窃听或篡改。右侧实验面板可切换到 HTTPS 对比。',
        duration: 1500,
        action: 'tls',
      },
      {
        id: 'request',
        title: '发送 HTTP 请求',
        description: '请求行 + 请求头(+ 请求体)。',
        explanation: `浏览器构造请求报文:**请求行** \`GET /index.html HTTP/1.1\` + **请求头**(Host、User-Agent、Accept、Cookie…)。GET 没有请求体。若请求头把一个字节一个字节送进 TCP 连接,HTTP/2 会把它变成二进制帧多路复用。`,
        duration: 1300,
        action: 'request',
      },
      {
        id: 'server',
        title: '服务端处理请求',
        description: 'Web 容器 → 应用逻辑 → 数据层。',
        explanation:
          '请求到达服务器(如 Tomcat)后:连接器解析 HTTP → 匹配应用与 Servlet → 执行业务逻辑(可能查数据库、调缓存)→ 生成响应。处理耗时长会占用工作线程,大量慢请求会耗尽线程池(详见 Tomcat 教程)。',
        duration: 1300,
        action: 'server',
      },
      {
        id: 'response',
        title: '返回 HTTP 响应',
        description: `状态行 + 响应头 + HTML。本次:${code}。`,
        explanation: code === 200
          ? '响应:**200 OK** + 响应头(Content-Type、Cache-Control…) + 响应体(HTML)。状态码 2xx 成功,3xx 重定向,4xx 客户端错误,5xx 服务端错误 —— 前端排查问题首先要看它。'
          : `本次响应状态码是 **${code}**(${code >= 500 ? '服务端错误:应用崩溃、上游超时或依赖故障,页面内容不会正常返回' : '客户端错误:资源不存在或无权限访问'})。浏览器会按状态码决定展示错误页还是重定向。可在右侧实验面板切换状态码观察。`,
        duration: 1300,
        action: 'response',
      },
      {
        id: 'parse',
        title: '浏览器解析 HTML',
        description: '边解析边构建 DOM 与 CSSOM,并发起子资源请求。',
        explanation:
          '浏览器逐字节解析 HTML 构建 **DOM**,解析 CSS 构建 **CSSOM**;遇到 <link>/<script>/<img> 会发起**新的 HTTP 请求**(回到第 5 步的子流程)。JS 可能阻塞解析,这就是 script 放到 body 底部或加 defer/async 的原因。',
        duration: 1300,
        action: 'parse',
      },
      {
        id: 'render',
        title: '渲染页面',
        description: '布局(Layout)→ 绘制(Paint)→ 呈现。',
        explanation:
          'DOM + CSSOM 合成渲染树 → 计算几何位置(**布局**)→ 绘制到图层 → 合成显示。首屏出现的时间(FCP/LCP)就是这条链路的终点。之后 keep-alive 连接保持复用;若一段时间无请求,TCP 连接会经历四次挥手关闭。',
        duration: 1300,
        action: 'render',
      },
    ]

    const transitions: StepTransition<HttpSceneState>[] = stageTitles.map((def, i) => s => {
      const stages = s.stages.map((st, j) => ({
        ...st,
        status: j < i ? ('done' as const) : j === i ? ('active' as const) : ('pending' as const),
        note: j === i ? def.note : st.note,
      }))
      const base: HttpSceneState = { ...s, stages }
      switch (def.id) {
        case 'dns':
          return { ...base, dnsIp: IP, log: [...s.log, `DNS 解析:${this.config.url.split('/')[0]} → ${IP}`] }
        case 'request':
          return { ...base, inFlight: 'request', log: [...s.log, `发送请求:GET /index.html ${https ? '(加密)' : '(明文)'}`] }
        case 'server':
          return { ...base, log: [...s.log, '服务端处理:容器 → 应用 → 数据层'] }
        case 'response':
          return { ...base, inFlight: 'response', statusCode: code, log: [...s.log, `响应:${code} + HTML`] }
        case 'tls':
          return { ...base, log: [...s.log, https ? 'TLS 握手:证书验证通过,会话密钥协商完成' : 'HTTP 模式:跳过 TLS'] }
        default:
          return { ...base, inFlight: null, log: [...s.log, stageTitles[i]!.title] }
      }
    })

    return { steps, transitions }
  }

  protected buildInitialState(): HttpSceneState {
    const defs = this.stageDefs()
    return {
      protocol: this.config.protocol,
      stages: defs.map(d => ({ id: d.id, title: d.title, status: 'pending', note: d.note })),
      dnsIp: null,
      statusCode: null,
      inFlight: null,
      log: [`模式:${this.config.protocol.toUpperCase()} · 目标 ${this.config.url}`],
    }
  }

  protected render(state: HttpSceneState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const tl = opts.timeline
    if (this.urlLabel) {
      this.urlLabel.textContent = `${state.protocol === 'https' ? 'https' : 'http'}://${state.stages[1]?.status !== 'pending' ? state.dnsIp ?? 'DNS…' : 'DNS…' }/${'…'}`
    }

    this.browserNode.setStatus(state.inFlight === 'request' ? 'active' : 'idle')
    this.serverNode.setStatus(state.inFlight === 'response' ? 'processing' : state.stages[6]?.status === 'done' ? 'success' : 'idle')
    if (this.statusChip) {
      const code = state.statusCode
      this.statusChip.textContent = code ? `${code}` : ''
      this.statusChip.setAttribute('class', `tf-subnet-result ${code && code >= 400 ? 'bad' : 'ok'}`)
    }

    // 阶段行
    for (let i = 0; i < this.stageRows.length; i++) {
      const row = this.stageRows[i]
      if (!row) continue
      const stage = state.stages[i]
      if (!stage) {
        row.g.style.opacity = '0'
        continue
      }
      row.title.textContent = stage.title
      row.note.textContent = stage.note
      row.status.textContent = stage.status === 'done' ? '✓' : stage.status === 'active' ? '●' : ''
      row.box.setAttribute('class', `tf-http-stage ${stage.status === 'active' ? 'is-active' : stage.status === 'done' ? 'is-done' : ''}`)
      row.status.setAttribute('class', `tf-http-status ${stage.status === 'active' ? 'is-active' : stage.status === 'done' ? 'is-done' : ''}`)
      const target = '1'
      if (tl) tl.to(row.g, { opacity: target, duration: 0.25 }, 0)
      else row.g.style.opacity = target
    }

    // 请求/响应报文
    const renderPacket = (packet: Packet, kind: 'request' | 'response') => {
      const active = state.inFlight === kind
      if (!active && !(kind === 'response' && state.statusCode !== null && state.stages[8]?.status === 'done')) {
        packet.show(false)
        return
      }
      const from = kind === 'request' ? { x: 620, y: 180 } : { x: 620, y: 420 }
      const to = kind === 'request' ? { x: 620, y: 420 } : { x: 620, y: 180 }
      if (tl && active) {
        packet.placeAt(from.x, from.y)
        packet.show(true)
        tl.to(packet.group, { x: to.x - from.x, y: to.y - from.y, duration: 0.8, ease: 'power1.inOut' }, 0)
      } else {
        packet.placeAt(to.x, to.y)
        packet.show(true)
      }
    }
    renderPacket(this.requestPacket, 'request')
    renderPacket(this.responsePacket, 'response')
  }

  protected snapshotData(state: HttpSceneState, completedSteps: number): Record<string, unknown> {
    const active = state.stages.find(s => s.status === 'active')
    return {
      rows: [
        { label: '协议', value: state.protocol.toUpperCase(), tone: state.protocol === 'https' ? 'success' : 'danger' },
        { label: '目标', value: `${this.config.url}` },
        { label: '服务器 IP', value: state.dnsIp ?? '未解析' },
        { label: '当前阶段', value: active ? active.title : '未开始', tone: 'accent' },
        { label: '阶段进度', value: `${state.stages.filter(s => s.status === 'done').length} / ${state.stages.length}` },
        { label: '在途报文', value: state.inFlight ?? '无' },
        { label: '状态码', value: state.statusCode ? String(state.statusCode) : '—', tone: state.statusCode && state.statusCode >= 400 ? 'danger' : state.statusCode ? 'success' : 'default' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'use-https', label: '切换为 HTTPS 模式' },
      {
        name: 'use-http',
        label: '切换为 HTTP(明文)模式',
        description: '对比观察:跳过 TLS,所有报文明文。',
        danger: true,
      },
      {
        name: 'server-error',
        label: '模拟服务端 500 错误',
        description: '挑战:观察错误响应与页面表现。',
        danger: true,
      },
      { name: 'ok-response', label: '恢复正常 200 响应' },
    ]
  }

  performAction(name: string): void {
    switch (name) {
      case 'use-https':
        this.config.protocol = 'https'
        this.rebuild()
        break
      case 'use-http':
        this.config.protocol = 'http'
        this.rebuild()
        break
      case 'server-error':
        this.config.statusCode = 500
        this.rebuild()
        break
      case 'ok-response':
        this.config.statusCode = 200
        this.rebuild()
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new HttpFlowScene(),
}

export default sceneModule
