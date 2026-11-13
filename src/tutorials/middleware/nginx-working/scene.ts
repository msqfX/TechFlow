import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Label } from '@/engine/components/Label'
import { Connection } from '@/engine/components/Connection'
import type { SceneAction } from '@/engine/types/scene'
import {
  apacheProcessCount,
  acceptConnection,
  createNginxState,
  finishConnection,
  processConnection,
  totalWorkerConnections,
} from './model'
import type { NginxState } from './model'

/** Nginx 场景:master/worker + epoll 连接池 + upstream 代理 + Apache 对照 */

const VIEW = { width: 840, height: 620 }
const NGINX_BOX = { x: 80, y: 130, w: 400, h: 250 }
const CLIENT = { x: 280, y: 60 }
const UPSTREAM = { x: 280, y: 540 }
const WORKER_X = [120, 230, 340]
const WORKER_Y = 200

class NginxScene extends BaseScene<NginxState> {
  private masterNode!: NetworkNode
  private clientNode!: NetworkNode
  private upstreamNode!: NetworkNode
  private workerNodes: NetworkNode[] = []
  private connChips = new Map<string, SVGTextElement>()
  private apacheChip: SVGTextElement | null = null
  private nginxChip: SVGTextElement | null = null
  private slots: Packet[] = []
  private live: NginxState | null = null
  private connCounter = 0

  constructor() {
    super({ id: 'nginx-working', viewBox: VIEW, label: 'Nginx master-worker 与事件驱动' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // Nginx 框
    renderer.el('rect', { x: NGINX_BOX.x, y: NGINX_BOX.y, width: NGINX_BOX.w, height: NGINX_BOX.h, rx: 14, class: 'tf-cpu-block' }, renderer.layerBg)
    renderer.el('text', { x: NGINX_BOX.x + 16, y: NGINX_BOX.y + 24, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      'Nginx(1 master + N worker)'

    this.masterNode = new NetworkNode(renderer, {
      id: 'master', x: NGINX_BOX.x + NGINX_BOX.w / 2, y: NGINX_BOX.y + 52, width: 150, height: 46, label: 'master', glyph: 'MASTER',
    })

    this.workerNodes = WORKER_X.map((x, i) =>
      new NetworkNode(renderer, {
        id: `worker-${i + 1}`, x, y: WORKER_Y, width: 96, height: 44, label: `worker ${i + 1}`, glyph: `W${i + 1}`,
      }),
    )
    // master → workers
    WORKER_X.forEach((_, i) => {
      new Connection(renderer, {
        id: `mw-${i}`,
        from: { x: NGINX_BOX.x + NGINX_BOX.w / 2, y: NGINX_BOX.y + 70 },
        to: { x: WORKER_X[i]!, y: WORKER_Y - 24 },
        dashed: true, arrow: false,
      })
    })

    this.clientNode = new NetworkNode(renderer, {
      id: 'client', x: CLIENT.x, y: CLIENT.y, width: 140, height: 46, label: '客户端', glyph: 'CLIENT',
    })
    this.upstreamNode = new NetworkNode(renderer, {
      id: 'upstream', x: UPSTREAM.x, y: UPSTREAM.y, width: 170, height: 54, label: 'upstream(Tomcat)', glyph: 'TOMCAT',
    })

    new Connection(renderer, { id: 'client-nginx', from: { x: CLIENT.x, y: CLIENT.y + 23 }, to: { x: CLIENT.x, y: NGINX_BOX.y + 4 }, arrow: true })
    new Connection(renderer, { id: 'nginx-up', from: { x: UPSTREAM.x, y: UPSTREAM.y - 27 }, to: { x: UPSTREAM.x, y: NGINX_BOX.y + NGINX_BOX.h }, arrow: true, label: 'proxy_pass' })

    new Label(renderer, { x: 560, y: 174, text: 'Apache 对照(prefork):', kind: 'accent', anchor: 'start' })
    this.apacheChip = renderer.el('text', { x: 560, y: 200, class: 'tf-subnet-mono' }, renderer.layerLabels)
    new Label(renderer, { x: 560, y: 230, text: '每连接 1 进程 — 1 万连接', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 560, y: 254, text: '= 1 万进程,内存爆炸', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 560, y: 300, text: 'Nginx:epoll 事件循环', kind: 'accent', anchor: 'start' })
    new Label(renderer, { x: 560, y: 326, text: '等待中的连接不占资源', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 560, y: 350, text: '单 worker 扛数万连接', kind: 'mono', anchor: 'start' })

    this.connChips = new Map()
    this.slots = []
    for (let i = 0; i < 8; i++) {
      this.slots.push(new Packet(renderer, { id: `ng-slot-${i}`, color: 'accent', shape: 'rect', width: 64, height: 20 }))
    }
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'master',
        title: 'master 启动:绑定端口,fork workers',
        description: '1 master + 4 workers(= CPU 核数)。',
        explanation: `master 只做管理:**读配置、绑定端口、fork worker、平滑重启**(reload 时新 worker 接管,旧 worker 处理完存量连接再退 —— 不丢请求);worker 挂了 master 自动拉起 —— 进程级保险。`,
        duration: 1300,
        action: 'master',
      },
      {
        id: 'conn1',
        title: '连接 1 到达:epoll 注册',
        description: '分配给连接最少的 worker,等待数据就绪。',
        explanation: `连接到达后**注册到该 worker 的 epoll**(事件循环):连接在等待数据期间**不占任何执行资源** —— 这是 Nginx 与 Apache prefork(每连接一进程)的本质差异,也是单 worker 能扛数万连接的原因。`,
        duration: 1400,
        action: 'conn1',
      },
      {
        id: 'conn2',
        title: '更多连接涌入',
        description: '连接 2、3、4 分配到不同 worker。',
        explanation: `每条连接独立注册到各 worker 的 epoll —— **谁的数据就绪就处理谁**。等待中的连接零成本;对比右侧 Apache 对照:同样的连接数,prefork 需要等量的进程/内存。`,
        duration: 1300,
        action: 'conn2',
      },
      {
        id: 'static',
        title: '静态请求:worker 直接回文件',
        description: '事件就绪 → 读静态文件 → 返回(不经上游)。',
        explanation: `连接 1 的请求数据就绪,worker **单线程分时处理**:读静态文件直接返回。整个处理过程异步非阻塞 —— 处理期间该连接暂挂,worker 转身服务其他就绪连接。本站 techflow.msqf.cc 的静态资源正是这条路径。`,
        duration: 1400,
        action: 'static',
      },
      {
        id: 'proxy',
        title: '动态请求:proxy_pass 到 upstream',
        description: '转发给 Tomcat,响应由 Nginx 带回。',
        explanation: `动态请求走 **proxy_pass** 转发给 upstream(Tomcat)。Nginx 在这里完成:TLS 终止、静态/动态分流、upstream 负载均衡(轮询/权重/ip_hash)。对照《Tomcat》:Tomcat 的 NIO Poller 收到的是 Nginx 转发来的连接。`,
        duration: 1400,
        action: 'proxy',
      },
      {
        id: 'scale',
        title: '连接数对照:千级 vs 万级',
        description: 'Apache 进程数线性暴涨;Nginx worker 数恒定。',
        explanation: `右侧对照:同样的连接数,Apache prefork 的进程数 = 连接数(内存与调度爆炸);Nginx 的 worker 数恒定 = CPU 核数,连接数只是 epoll 里的一个条目。这就是「Nginx 扛 10 万并发连接」的机制底座。`,
        duration: 1400,
        action: 'scale',
      },
    ]

    const transitions: StepTransition<NginxState>[] = [
      () => createNginxState(),
      s0 => acceptConnection(s0, 'conn-1'),
      s0 => acceptConnection(acceptConnection(acceptConnection(s0, 'conn-2'), 'conn-3'), 'conn-4'),
      s0 => finishConnection(processConnection(s0, 'conn-1', 'static'), 'conn-1'),
      s0 => finishConnection(processConnection(s0, 'conn-2', 'upstream'), 'conn-2'),
      s0 => ({ ...s0, log: [...s0.log, `对照:Apache 进程数 = ${apacheProcessCount(s0)}(线性);Nginx worker 恒为 ${s0.workers.length}`] }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): NginxState {
    return createNginxState()
  }

  private effectiveState(stepState: NginxState): NginxState {
    return this.live ?? stepState
  }

  protected render(stepState: NginxState, _opts: RenderOptions & { timeline: import('@/engine/types/animation').GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)

    // worker 状态(有连接 = active)
    this.workerNodes.forEach((w, i) => {
      const worker = state.workers[i]
      w?.setStatus(worker && worker.activeConnections.length > 0 ? 'active' : 'idle')
    })
    this.masterNode.setStatus(state.masterAlive ? 'idle' : 'error')
    this.clientNode.setStatus(state.waitingConnections.length ? 'active' : 'idle')
    this.upstreamNode.setStatus(state.upstream && state.upstream.connections > 0 ? 'processing' : 'idle')

    // 每连接芯片(等待中的连接显示在 worker 下方)
    for (const [connId, chip] of this.connChips.entries()) {
      const stillWaiting = state.waitingConnections.includes(connId)
      chip.textContent = stillWaiting ? connId : ''
      chip.style.opacity = stillWaiting ? '1' : '0'
    }

    if (this.apacheChip) {
      this.apacheChip.textContent = `进程数 = ${apacheProcessCount(state)}(随连接线性)`
    }
    if (this.nginxChip) {
      this.nginxChip.textContent = `Nginx worker 数恒定:${state.workers.length},连接 ${totalWorkerConnections(state)} 条在 epoll`
    }

    // 处理中的请求包
    const processing = state.processing
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (!slot) continue
      const show = processing && i === 0
      if (!show) {
        slot.show(false)
        continue
      }
      const y = processing.target === 'upstream' ? 480 : 150
      slot.placeAt(processing.target === 'upstream' ? UPSTREAM.x - 60 : CLIENT.x + 60, y)
      slot.show(true)
    }
  }

  protected snapshotData(stepState: NginxState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    return {
      rows: [
        { label: 'master', value: state.masterAlive ? '存活(fork/平滑重启)' : '宕机', tone: state.masterAlive ? 'success' : 'danger' },
        { label: 'worker 数', value: `${state.workers.length}(= CPU 核数)` },
        { label: 'epoll 连接', value: `${totalWorkerConnections(state)} 条在册`, tone: 'accent' },
        { label: '等待中', value: `${state.waitingConnections.length} 条(不占资源)` },
        { label: '已服务请求', value: String(state.workers.reduce((a, w) => a + w.requestsServed, 0)) },
        { label: 'upstream', value: state.upstream ? `${state.upstream.name}(连接 ${state.upstream.connections})` : '—' },
        { label: 'Apache 对照', value: `进程数 ${apacheProcessCount(state)}(每连接一进程)`, tone: 'warning' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'conn', label: '新连接到达(注册 epoll)' },
      { name: 'process-static', label: '静态请求就绪(直接回文件)' },
      { name: 'process-proxy', label: '动态请求就绪(proxy_pass)', description: '转发给 upstream(Tomcat)。' },
      { name: 'burst', label: '洪峰:10 条连接涌入', description: '观察 epoll 注册 vs Apache 进程数对照。' },
      { name: 'drain', label: '处理并释放全部连接' },
    ]
  }

  performAction(name: string): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: NginxState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'conn': {
        this.connCounter += 1
        apply(acceptConnection(base(), `conn-${this.connCounter}`))
        break
      }
      case 'process-static': {
        const waiting = base().waitingConnections[0]
        if (waiting) apply(finishConnection(processConnection(base(), waiting, 'static'), waiting))
        break
      }
      case 'process-proxy': {
        const waiting = base().waitingConnections[0]
        if (waiting) apply(finishConnection(processConnection(base(), waiting, 'upstream'), waiting))
        break
      }
      case 'burst': {
        let st = base()
        for (let i = 0; i < 10; i++) st = acceptConnection(st, `burst-${i}`)
        apply(st)
        break
      }
      case 'drain': {
        let st = base()
        for (const c of [...st.waitingConnections]) st = finishConnection(st, c)
        apply(st)
        break
      }
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new NginxScene(),
}

export default sceneModule
