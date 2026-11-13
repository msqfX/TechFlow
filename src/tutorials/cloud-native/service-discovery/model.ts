/**
 * 服务注册与发现模型(纯函数,可测试)。
 * 注册中心维护服务名 → 实例列表;心跳超时剔除;consumer 订阅缓存。
 */

export interface ServiceInstance {
  id: string
  name: string
  addr: string
  /** 心跳计数:每次 tick 未续约则 +1,达到阈值剔除 */
  missedBeats: number
  healthy: boolean
}

export interface RegistryState {
  /** 服务名 → 实例列表 */
  services: Record<string, ServiceInstance[]>
  /** 变更版本号(consumer 缓存对照) */
  version: number
  /** consumer 本地缓存的列表(服务名 → 实例地址) */
  consumerCache: Record<string, string[]>
  /** 最近事件 */
  lastEvent: string | null
  log: string[]
}

export const HEARTBEAT_THRESHOLD = 3

let sdSeq = 0
function makeInstance(name: string, addr: string): ServiceInstance {
  sdSeq += 1
  return { id: `inst-${sdSeq}`, name, addr, missedBeats: 0, healthy: true }
}

export function createRegistryState(): RegistryState {
  return {
    services: {},
    version: 1,
    consumerCache: {},
    lastEvent: null,
    log: ['注册中心就绪;心跳缺失 3 个周期即剔除实例'],
  }
}

/** 服务实例注册 */
export function register(s: RegistryState, name: string, addr: string): RegistryState {
  const inst = makeInstance(name, addr)
  const list = s.services[name] ?? []
  const version = s.version + 1
  return {
    ...s,
    services: { ...s.services, [name]: [...list, inst] },
    version,
    lastEvent: `REGISTER ${name}@${addr}`,
    consumerCache: {},
    log: [...s.log, `注册:${name} 上线实例 ${addr}(服务 ${name} 现有 ${list.length + 1} 个实例),推送变更 v${version}`],
  }
}

/** 心跳续约:重置该实例的丢失计数 */
export function heartbeat(s: RegistryState, name: string, addr: string): RegistryState {
  const found = (s.services[name] ?? []).some(i => i.addr === addr)
  if (!found) {
    return { ...s, log: [...s.log, `心跳被拒:${name}@${addr} 未注册(可能已被剔除)`] }
  }
  const services = {
    ...s.services,
    [name]: (s.services[name] ?? []).map(i => (i.addr === addr ? { ...i, missedBeats: 0, healthy: true } : i)),
  }
  return { ...s, services, log: [...s.log, `心跳:${name}@${addr} 续约成功(保活计数归零)`] }
}

/** 时钟推进:所有实例 missedBeats+1,达到阈值的剔除并推送变更 */
export function tick(s: RegistryState): RegistryState {
  let removed: Array<{ name: string; addr: string }> = []
  const services: Record<string, ServiceInstance[]> = {}
  for (const [name, list] of Object.entries(s.services)) {
    const kept: ServiceInstance[] = []
    for (const inst of list) {
      const missed = inst.missedBeats + 1
      if (missed >= HEARTBEAT_THRESHOLD) {
        removed.push({ name, addr: inst.addr })
      } else {
        kept.push({ ...inst, missedBeats: missed, healthy: missed === 0 })
      }
    }
    if (kept.length > 0) services[name] = kept
  }
  const version = removed.length > 0 ? s.version + 1 : s.version
  return {
    ...s,
    services,
    version,
    lastEvent: removed.length ? `DEREGISTER ${removed.map(r => `${r.name}@${r.addr}`).join(', ')}` : s.lastEvent,
    log: removed.length
      ? [...s.log, `心跳超时:剔除 ${removed.map(r => `${r.name}@${r.addr}`).join(', ')}(缺失心跳 ${HEARTBEAT_THRESHOLD} 个周期),推送变更 v${version}`]
      : [...s.log, `tick:所有实例心跳正常(${Object.values(services).reduce((a, l) => a + l.length, 0)} 个实例存活)`],
  }
}

/** consumer 发现:拉取服务实例地址列表并更新本地缓存 */
export function discover(s: RegistryState, name: string): RegistryState {
  const addrs = (s.services[name] ?? []).map(i => i.addr)
  return {
    ...s,
    consumerCache: { ...s.consumerCache, [name]: addrs },
    log: [
      ...s.log,
      addrs.length
        ? `发现 ${name}:拉取实例列表 [${addrs.join(', ')}] 并缓存到本地(调用时客户端负载均衡挑一个)`
        : `发现 ${name}:实例列表为空 —— 调用将失败(服务全下线)`,
    ],
  }
}

/** 某服务的实例数 */
export function instanceCount(s: RegistryState, name: string): number {
  return (s.services[name] ?? []).length
}
