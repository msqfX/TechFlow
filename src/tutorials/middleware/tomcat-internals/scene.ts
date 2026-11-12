import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Packet } from '@/engine/components/Packet'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'

/** Tomcat 工作原理场景:组件树 + 请求路径 + 线程池 */

type ComponentId = 'connector' | 'engine' | 'host' | 'context' | 'wrapper' | 'servlet'

export interface TomcatState {
  active: ComponentId | null
  threadPool: { max: number; active: number; queue: number; queueMax: number; rejected: number }
  url: string
  slow: boolean
  log: string[]
}

interface TomcatSceneConfig {
  url: string
  slow: boolean
  maxThreads: number
  queueMax: number
}

const VIEW = { width: 840, height: 660 }

const COMPONENTS: Array<{ id: ComponentId; title: string; note: string; x: number; y: number; w: number; h: number }> = [
  { id: 'connector', title: 'Connector(NIO)', note: 'Acceptor + Poller:接收连接、解析 HTTP', x: 60, y: 210, w: 330, h: 92 },
  { id: 'engine', title: 'Engine', note: 'Servlet 引擎:分发请求', x: 440, y: 210, w: 340, h: 92 },
  { id: 'host', title: 'Host(虚拟主机)', note: '按请求头 Host 匹配', x: 440, y: 330, w: 340, h: 62 },
  { id: 'context', title: 'Context(Web 应用)', note: '按 URL 前缀匹配应用', x: 440, y: 418, w: 340, h: 62 },
  { id: 'wrapper', title: 'Wrapper', note: '按 Servlet 映射匹配', x: 440, y: 506, w: 340, h: 62 },
  { id: 'servlet', title: 'Servlet', note: 'init → service → destroy', x: 440, y: 594, w: 340, h: 56 },
]

const POOL_POS = { x: 60, y: 340 }

const DEFAULT_CONFIG: TomcatSceneConfig = { url: '/app1/orders', slow: false, maxThreads: 4, queueMax: 2 }

class TomcatScene extends BaseScene<TomcatState> {
  private config: TomcatSceneConfig = { ...DEFAULT_CONFIG }

  private boxes: Partial<Record<ComponentId, SVGRectElement>> = {}
  private poolSquares: SVGRectElement[] = []
  private queueBar: SVGRectElement | null = null
  private rejectedChip: SVGTextElement | null = null
  private urlChip: SVGTextElement | null = null
  private requestPacket!: Packet
  private live: TomcatState | null = null

  constructor() {
    super({ id: 'tomcat', viewBox: VIEW, label: 'Tomcat 组件架构与请求处理' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    renderer.el('rect', { x: 44, y: 40, width: 750, height: 44, rx: 10, class: 'tf-cpu-block' }, renderer.layerLabels)
    renderer.el('text', { x: 60, y: 68, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      'Server(整个 JVM 实例) → Service(打包 Connector + Engine)'
    renderer.el('line', { x1: 60, y1: 160, x2: 780, y2: 160, class: 'tf-link', stroke: 'var(--border-1)' }, renderer.layerLinks)
    renderer.el('text', { x: 410, y: 186, 'text-anchor': 'middle', class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      'Connector 负责「网络进来的事」;Engine 及以下容器负责「应用逻辑的事」'

    for (const comp of COMPONENTS) {
      const box = renderer.el('rect', {
        x: comp.x, y: comp.y, width: comp.w, height: comp.h, rx: 10, class: 'tf-http-stage',
      }, renderer.layerNodes)
      this.boxes[comp.id] = box
      renderer.el('text', { x: comp.x + 16, y: comp.y + 26, class: 'tf-http-title' }, renderer.layerLabels).textContent = comp.title
      renderer.el('text', { x: comp.x + 16, y: comp.y + comp.h - 14, class: 'tf-subnet-mono' }, renderer.layerLabels).textContent = comp.note
    }
    // 容器层级连线
    const chain: ComponentId[] = ['engine', 'host', 'context', 'wrapper', 'servlet']
    chain.forEach((id, i) => {
      const a = COMPONENTS.find(c => c.id === id)!
      const b = COMPONENTS.find(c => c.id === chain[i + 1])
      if (!b) return
      new Label(renderer, { x: 420, y: (a.y + a.h + b.y) / 2 + 4, text: '│', kind: 'mono' })
    })
    new Label(renderer, { x: 350, y: 262, text: 'Request / Response 解耦两个世界', kind: 'mono' })

    // 线程池
    const poolTitle = renderer.el('text', { x: POOL_POS.x, y: POOL_POS.y - 14, class: 'tf-label--accent' }, renderer.layerLabels)
    poolTitle.textContent = '工作线程池(Executor)'
    this.poolSquares = []
    for (let i = 0; i < 8; i++) {
      const sq = renderer.el('rect', {
        x: POOL_POS.x + i * 42, y: POOL_POS.y, width: 34, height: 34, rx: 7, class: 'tf-pool-thread',
      }, renderer.layerNodes)
      this.poolSquares.push(sq)
    }
    renderer.el('text', { x: POOL_POS.x, y: POOL_POS.y + 62, class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      '等待队列(acceptCount):'
    this.queueBar = renderer.el('rect', { x: POOL_POS.x + 150, y: POOL_POS.y + 46, width: 180, height: 22, rx: 6, class: 'tf-tw-bar' }, renderer.layerNodes)
    this.rejectedChip = renderer.el('text', { x: POOL_POS.x + 350, y: POOL_POS.y + 62, class: 'tf-subnet-result bad' }, renderer.layerLabels)
    this.urlChip = renderer.el('text', { x: POOL_POS.x, y: POOL_POS.y + 106, class: 'tf-subnet-mono' }, renderer.layerLabels)

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '请求自上而下穿过容器层级,响应原路返回', kind: 'muted' })

    this.requestPacket = new Packet(renderer, { id: 'tomcat-req', color: 'accent', shape: 'rect', width: 88, height: 24 })
  }

  protected buildSteps() {
    const url = this.config.url
    const max = this.config.maxThreads
    const steps: SceneStep[] = [
      {
        id: 'overview',
        title: 'Tomcat 组件树',
        description: 'Server → Service → Connector + Engine → Host → Context → Wrapper → Servlet。',
        explanation:
          'Tomcat 的骨架是**一棵组件树**:Connector 管「网络进来的事」(监听端口、解析 HTTP、生成 Request/Response 对象);Engine 及以下管「应用逻辑的事」(决定请求属于哪个应用、哪个 Servlet)。两者通过 Request/Response 对象解耦 —— 理解这棵树,排查 404/500 时才知道去哪一层找问题。',
        duration: 1500,
        action: 'overview',
      },
      {
        id: 'accept',
        title: '请求到达 Connector',
        description: 'Acceptor accept() 拿到 TCP 连接。',
        explanation: `客户端发起 \`GET ${url}\`:操作系统完成 TCP 握手后,**Acceptor 线程**阻塞在 accept() 上拿到连接,放入 Poller 的事件队列。此刻还没有任何应用代码被调用。`,
        duration: 1300,
        action: 'accept',
      },
      {
        id: 'poller',
        title: 'Poller 多路复用 → 线程池',
        description: '检测到请求数据就绪,交给工作线程。',
        explanation: `**Poller** 用 Selector 同时监听成千上万个连接;只有「请求数据已就绪」的连接才会被包装成任务,交给**工作线程池**。这是 NIO 连接器能支撑上万并发连接的关键:等待数据的连接不占工作线程。工作线程从池中取出(空闲线程 −1,当前 ${max} 个上限)。`,
        duration: 1400,
        action: 'poller',
      },
      {
        id: 'engine',
        title: '请求进入 Engine',
        description: 'Request 对象沿着管道(Pipeline)流动。',
        explanation: '工作线程解析完 HTTP 报文,生成 Request/Response 对象交给 **Engine**。Engine 内部是一串 Valve(阀门)组成的 Pipeline —— 类似 Filter,但属于 Tomcat 自身的处理链。',
        duration: 1300,
        action: 'engine',
      },
      {
        id: 'host',
        title: 'Host 匹配:按域名找虚拟主机',
        description: '请求头 Host: www.example.com → 匹配虚拟主机。',
        explanation: 'Engine 按请求头的 **Host 字段**选择虚拟主机(一台 Tomcat 可以服务多个域名)。没有匹配项就用默认 Host(通常 localhost)。同一台物理机部署多个站点的原理就在这一步。',
        duration: 1200,
        action: 'host',
      },
      {
        id: 'context',
        title: 'Context 匹配:按路径前缀找应用',
        description: `${url} → 匹配应用 /app1。`,
        explanation: `Host 内按 **URL 路径前缀**找 Web 应用(Context):\`${url}\` 命中 /app1。一个 Host 可以部署多个应用;路径前缀最长者胜出。404 的第一层排查就在这里 —— 路径前缀写错或应用没有部署。`,
        duration: 1300,
        action: 'context',
      },
      {
        id: 'wrapper',
        title: 'Wrapper 匹配:定位 Servlet',
        description: '/orders/* 映射到 OrderServlet。',
        explanation: 'Context 内按 web.xml / 注解的 **Servlet 映射**找 Wrapper(/orders/* → OrderServlet)。找不到映射同样 404。找到后创建 **FilterChain**,请求将依次穿过应用配置的过滤器,最终到达 Servlet。',
        duration: 1300,
        action: 'wrapper',
      },
      {
        id: 'service',
        title: 'Servlet 执行 service()',
        description: '单实例多线程:所有请求共享同一个 Servlet 对象。',
        explanation: `首次调用会执行 **init()**;之后每个请求都调用同一实例的 **service()**,按方法分发到 doGet()/doPost()。因为**单实例多线程**,Servlet 里绝不能用实例字段保存请求状态(典型的并发 bug)。${this.config.slow ? '当前处于「慢 Servlet」模式:业务处理耗时,线程被长期占用。' : ''}`,
        duration: this.config.slow ? 2600 : 1400,
        action: 'service',
      },
      {
        id: 'response',
        title: '响应返回,线程归还',
        description: '响应沿 Filter 链逆序 → Connector → 网络。',
        explanation: 'service() 写完 Response 后,响应沿 Filter 链**逆序**穿回、由 Connector 写回网络;工作线程归还线程池,等待下一个请求。Servlet 实例**不销毁**,继续服务后续请求(destroy() 只在应用停止时调用)。',
        duration: 1300,
        action: 'response',
      },
      {
        id: 'pool-notes',
        title: '线程池与队列的边界',
        description: 'maxThreads + acceptCount 决定容量上限。',
        explanation: `整个链路的资源模型:每个进行中的请求占用**一个工作线程**(默认上限 200);线程耗尽后新请求在操作系统的 TCP 队列里排队(**acceptCount**,默认 100);队列也满 → 新连接被拒绝。慢 SQL、慢下游会把线程长期占住,最后表现为「接口全部超时」—— 排查时先把线程栈 dump 出来看线程都在等什么。右侧挑战模式可以模拟线程池耗尽。`,
        duration: 1500,
        action: 'pool-notes',
      },
    ]

    const transitions: StepTransition<TomcatState>[] = [
      s => ({ ...s, active: null, log: [...s.log, `配置:url=${url},maxThreads=${max}`] }),
      s => ({ ...s, active: 'connector', log: [...s.log, 'Acceptor 接收 TCP 连接'] }),
      s => ({ ...s, active: 'connector', threadPool: { ...s.threadPool, active: Math.min(max, s.threadPool.active + 1) }, log: [...s.log, 'Poller 就绪 → 线程池分配工作线程'] }),
      s => ({ ...s, active: 'engine', log: [...s.log, 'Request 对象进入 Engine 的 Pipeline'] }),
      s => ({ ...s, active: 'host', log: [...s.log, 'Host 匹配:localhost(默认虚拟主机)'] }),
      s => ({ ...s, active: 'context', log: [...s.log, `Context 匹配:${url.split('/')[1] ? '/' + url.split('/')[1] : '/'}(Web 应用)`] }),
      s => ({ ...s, active: 'wrapper', log: [...s.log, 'Wrapper 匹配 Servlet,构建 FilterChain'] }),
      s => ({ ...s, active: 'servlet', log: [...s.log, `Servlet service() 执行${this.config.slow ? '(慢业务,线程被占用)' : ''}`] }),
      s => ({ ...s, active: null, threadPool: { ...s.threadPool, active: Math.max(0, s.threadPool.active - 1) }, log: [...s.log, '响应写回网络,线程归还线程池'] }),
      s => ({ ...s, log: [...s.log, `容量边界:maxThreads=${max} + acceptCount=${s.threadPool.queueMax}`] }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): TomcatState {
    return {
      active: null,
      threadPool: { max: this.config.maxThreads, active: 0, queue: 0, queueMax: this.config.queueMax, rejected: 0 },
      url: this.config.url,
      slow: this.config.slow,
      log: ['Tomcat 启动完成,监听 8080'],
    }
  }

  private effectiveState(stepState: TomcatState): TomcatState {
    return this.live ?? stepState
  }

  protected render(stepState: TomcatState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    for (const comp of COMPONENTS) {
      const box = this.boxes[comp.id]
      if (!box) continue
      box.setAttribute('class', `tf-http-stage ${state.active === comp.id ? 'is-active' : ''}`)
    }

    // 线程方块
    this.poolSquares.forEach((sq, i) => {
      sq.setAttribute('class', `tf-pool-thread ${i < state.threadPool.active ? 'is-busy' : ''}`)
    })
    if (this.queueBar) {
      const qWidth = 180 * Math.min(1, state.threadPool.queue / Math.max(1, state.threadPool.queueMax))
      if (tl) {
        tl.to(this.queueBar, { attr: { width: qWidth }, duration: 0.4 }, 0)
      } else {
        this.queueBar.setAttribute('width', String(qWidth))
      }
    }
    if (this.rejectedChip) {
      this.rejectedChip.textContent = state.threadPool.rejected > 0 ? `${state.threadPool.rejected} 个连接被拒绝` : ''
    }
    if (this.urlChip) {
      this.urlChip.textContent = `请求:${state.url}${state.slow ? '(慢业务模式)' : ''}`
    }

    // 请求包沿组件链移动
    const order: Array<ComponentId | null> = ['connector', 'engine', 'host', 'context', 'wrapper', 'servlet']
    const idx = state.active ? order.indexOf(state.active) : -1
    if (idx >= 0) {
      const comp = COMPONENTS.find(c => c.id === state.active)!
      const target = { x: comp.x + comp.w / 2, y: comp.y + comp.h / 2 }
      if (tl) {
        const start = { x: 220, y: 256 }
        this.requestPacket.placeAt(start.x, start.y)
        this.requestPacket.show(true)
        tl.to(this.requestPacket.group, { x: target.x - start.x, y: target.y - start.y, duration: 0.6, ease: 'power1.inOut' }, 0)
      } else {
        this.requestPacket.placeAt(target.x, target.y)
        this.requestPacket.show(true)
      }
    } else {
      this.requestPacket.show(false)
    }
  }

  protected snapshotData(stepState: TomcatState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const comps = COMPONENTS.find(c => c.id === state.active)
    return {
      rows: [
        { label: '当前组件', value: comps ? comps.title : '(空闲)', tone: 'accent' },
        { label: '请求 URL', value: state.url },
        { label: '匹配 Context', value: `/${state.url.split('/')[1] ?? ''}` },
        { label: '线程池', value: `${state.threadPool.active} / ${state.threadPool.max} 忙`, tone: state.threadPool.active >= state.threadPool.max ? 'danger' : 'success' },
        { label: '等待队列', value: `${state.threadPool.queue} / ${state.threadPool.queueMax}`, tone: state.threadPool.queue >= state.threadPool.queueMax ? 'warning' : 'default' },
        { label: '拒绝连接', value: String(state.threadPool.rejected), tone: state.threadPool.rejected > 0 ? 'danger' : 'default' },
        { label: '慢业务模式', value: state.slow ? '开启' : '关闭', tone: state.slow ? 'warning' : 'default' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-url',
        label: '修改请求 URL',
        description: '观察 Host/Context/Wrapper 的匹配过程。',
        params: [{ name: 'url', label: 'URL 路径', type: 'text', placeholder: '/app1/orders' }],
      },
      { name: 'toggle-slow', label: '切换慢业务模式', description: 'Servlet 处理耗时,线程被长期占用。' },
      {
        name: 'flood',
        label: '模拟线程池耗尽',
        description: '挑战:瞬间涌入 7 个请求,观察队列与拒绝。',
        danger: true,
      },
      { name: 'reset-pool', label: '复位线程池' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    switch (name) {
      case 'set-url': {
        const url = String(params?.url ?? '').trim()
        if (/^\/[a-z0-9/_-]*$/i.test(url)) {
          this.config.url = url
          this.rebuild()
        }
        break
      }
      case 'toggle-slow':
        this.config.slow = !this.config.slow
        this.rebuild()
        break
      case 'flood': {
        const base = this.effectiveState(this.states.current)
        const { max, queueMax } = base.threadPool
        const inflight = 7
        const active = Math.min(max, inflight)
        const queue = Math.min(queueMax, Math.max(0, inflight - max))
        const rejected = Math.max(0, inflight - max - queue)
        this.live = {
          ...base,
          threadPool: { ...base.threadPool, active, queue, rejected },
          log: [
            ...base.log,
            `故障模拟:瞬间 7 个请求 → ${active} 个占用线程,${queue} 个排队,${rejected} 个被拒绝(连接拒绝)`,
          ],
        }
        this.render(this.live, { animate: false, timeline: null, fromIndex: 0 })
        this.events.emit('data', this.getState())
        break
      }
      case 'reset-pool':
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
  create: () => new TomcatScene(),
}

export default sceneModule
