/**
 * Nginx 模型:master/worker + 事件驱动连接处理(纯函数,可测试)。
 * 对比模型:Apache prefork(每连接一个进程)—— 展示并发连接下的资源差。
 */

export interface NginxWorker {
  id: string
  /** 正在处理的连接 id(事件循环同时盯多个,active 是当前就绪的) */
  activeConnections: string[]
  requestsServed: number
}

export interface NginxState {
  masterAlive: boolean
  workers: NginxWorker[]
  /** 等待中的连接(事件已注册,不占执行资源) */
  waitingConnections: string[]
  /** 正在被处理的连接 */
  processing: { workerId: string; connectionId: string; target: 'static' | 'upstream' } | null
  /** upstream 后端(Tomcat) */
  upstream: { name: string; connections: number } | null
  totalConnections: number
  /** Apache 对照:每连接一进程 */
  apacheProcesses: number
  log: string[]
}

export function createNginxState(): NginxState {
  return {
    masterAlive: true,
    workers: [1, 2, 3, 4].map(i => ({ id: `worker-${i}`, activeConnections: [], requestsServed: 0 })),
    waitingConnections: [],
    processing: null,
    upstream: { name: 'tomcat:8080', connections: 0 },
    totalConnections: 0,
    apacheProcesses: 0,
    log: ['master 读取配置、绑定 80/443 端口,fork 4 个 worker(= CPU 核数)'],
  }
}

/** 新连接到达:分配给连接数最少的 worker,注册到 epoll(等待数据就绪) */
export function acceptConnection(s: NginxState, connId: string): NginxState {
  const worker = [...s.workers].sort((a, b) => a.activeConnections.length - b.activeConnections.length)[0]!
  return {
    ...s,
    workers: s.workers.map(w => (w.id === worker.id ? { ...w, activeConnections: [...w.activeConnections, connId] } : w)),
    waitingConnections: [...s.waitingConnections, connId],
    totalConnections: s.totalConnections + 1,
    log: [...s.log, `连接 ${connId} → worker ${worker.id.slice(-1)} 的 epoll 注册(等待数据就绪,不占线程)`],
  }
}

/** 连接数据就绪:事件循环唤醒处理(worker 单线程分时) */
export function processConnection(s: NginxState, connId: string, target: 'static' | 'upstream'): NginxState {
  const worker = s.workers.find(w => w.activeConnections.includes(connId))
  if (!worker) return { ...s, log: [...s.log, `连接 ${connId} 不存在`] }
  return {
    ...s,
    processing: { workerId: worker.id, connectionId: connId, target },
    workers: s.workers.map(w => (w.id === worker.id ? { ...w, requestsServed: w.requestsServed + 1 } : w)),
    upstream: target === 'upstream' && s.upstream ? { ...s.upstream, connections: s.upstream.connections + 1 } : s.upstream,
    log: [
      ...s.log,
      target === 'static'
        ? `worker ${worker.id.slice(-1)} 事件就绪 → 直接读静态文件返回(不经过上游)`
        : `worker ${worker.id.slice(-1)} 事件就绪 → proxy_pass 到 upstream(${s.upstream?.name})`,
    ],
  }
}

/** 连接处理完毕:释放(worker 继续服务其他连接) */
export function finishConnection(s: NginxState, connId: string): NginxState {
  return {
    ...s,
    workers: s.workers.map(w => ({ ...w, activeConnections: w.activeConnections.filter(c => c !== connId) })),
    waitingConnections: s.waitingConnections.filter(c => c !== connId),
    processing: null,
    log: [...s.log, `连接 ${connId} 完成:worker 继续服务其他连接(keep-alive 可复用)`],
  }
}

/** Apache 对照:每连接一个进程(prefork 教学估算) */
export function apacheProcessCount(s: NginxState): number {
  return s.totalConnections
}

/** worker 总连接数 */
export function totalWorkerConnections(s: NginxState): number {
  return s.workers.reduce((a, w) => a + w.activeConnections.length, 0)
}
