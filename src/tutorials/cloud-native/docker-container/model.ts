/**
 * Docker 容器模型(概念模拟,纯函数,可测试)。
 * 三件套:Namespace(视图隔离)/ Cgroups(资源限额)/ UnionFS(镜像分层)。
 * 每个隔离维度可独立开关 —— 关掉即演示「不隔离会怎样」。
 */

export type NamespaceKind = 'PID' | 'NET' | 'MNT' | 'UTS' | 'IPC' | 'USER'

export const NAMESPACE_KINDS: Array<{ kind: NamespaceKind; label: string; effect: string }> = [
  { kind: 'PID', label: 'PID 隔离', effect: '容器内自己的进程编号(自己是 1 号),看不到宿主机其他进程' },
  { kind: 'NET', label: '网络隔离', effect: '独立网卡/IP/端口空间 —— 两个容器都能监听 8080' },
  { kind: 'MNT', label: '挂载隔离', effect: '独立的文件系统视图(自己的 rootfs)' },
  { kind: 'UTS', label: '主机名隔离', effect: '容器有自己的 hostname' },
  { kind: 'IPC', label: 'IPC 隔离', effect: '进程间通信对象互不可见' },
  { kind: 'USER', label: '用户隔离', effect: '容器内 root ≠ 宿主机 root' },
]

export interface ContainerInstance {
  id: string
  name: string
  namespaces: Record<NamespaceKind, boolean>
  /** 内存限额 MB(null = 无限制) */
  memLimitMB: number | null
  cpuPercent: number | null
  /** 可写层已写入 MB */
  writableMB: number
  status: 'running' | 'stopped' | 'oom-killed'
}

export interface DockerState {
  hostKernelShared: true
  containers: ContainerInstance[]
  imageLayers: string[]
  /** 隔离维度演示开关(全局,教学对照) */
  namespaceEnabled: Record<NamespaceKind, boolean>
  cgroupEnabled: boolean
  /** 宿主机视角可见的进程数 */
  hostVisibleProcesses: number
  selectedContainer: string | null
  log: string[]
}

export const IMAGE_LAYERS = ['基础层 debian:slim(77MB)', '依赖层 runtime + libs(120MB)', '应用层 app.jar(45MB)']
export const HOST_TOTAL_PROCESSES = 148

export function createDockerState(): DockerState {
  const namespaces = Object.fromEntries(NAMESPACE_KINDS.map(k => [k.kind, true])) as Record<NamespaceKind, boolean>
  return {
    hostKernelShared: true,
    containers: [],
    imageLayers: [...IMAGE_LAYERS],
    namespaceEnabled: namespaces,
    cgroupEnabled: true,
    hostVisibleProcesses: HOST_TOTAL_PROCESSES,
    selectedContainer: null,
    log: ['宿主机视角:容器 = 被隔离(Namespace)+ 限额(Cgroups)的普通进程;共享同一内核'],
  }
}

let dcSeq = 0

/** docker run:创建容器(隔离视图 + 可写层 + 限额) */
export function dockerRun(s: DockerState, name: string): DockerState {
  dcSeq += 1
  const id = `c-${dcSeq}`
  const container: ContainerInstance = {
    id,
    name,
    namespaces: { ...s.namespaceEnabled },
    memLimitMB: s.cgroupEnabled ? 512 : null,
    cpuPercent: s.cgroupEnabled ? 100 : null,
    writableMB: 0,
    status: 'running',
  }
  return {
    ...s,
    containers: [...s.containers, container],
    selectedContainer: id,
    log: [
      ...s.log,
      `docker run ${name}:创建可写层(空)、应用 Namespace 隔离(${NAMESPACE_KINDS.filter(k => s.namespaceEnabled[k.kind]).length}/6 维度)、设置 Cgroups 限额(内存 512MB / CPU 100%)`,
    ],
  }
}

/** 容器内写文件:CoW 复制到可写层 */
export function writeFile(s: DockerState, containerId: string, mb: number): DockerState {
  const containers = s.containers.map(c => {
    if (c.id !== containerId) return c
    if (c.status !== 'running') return c
    const over = c.memLimitMB !== null && c.writableMB + mb > c.memLimitMB
    return { ...c, writableMB: c.writableMB + mb, status: over ? ('oom-killed' as const) : c.status }
  })
  const target = containers.find(c => c.id === containerId)!
  return {
    ...s,
    containers,
    log: [...s.log, target.status === 'oom-killed' ? `⚠ 容器 ${target.name} 可写层/内存超限 → OOM Killed(对照 Cgroups 限额)` : `容器内写 ${mb}MB:写时复制(CoW)到可写层 —— 容器销毁即丢,持久数据请挂 Volume`],
  }
}

/** 切换隔离维度(教学对照):关掉会看到什么 */
export function toggleNamespace(s: DockerState, kind: NamespaceKind): DockerState {
  const enabled = !s.namespaceEnabled[kind]
  const meta = NAMESPACE_KINDS.find(k => k.kind === kind)!
  const consequence: Record<NamespaceKind, string> = {
    PID: '两个容器的进程在宿主机进程表里混在一起,互相可见(不再隔离)',
    NET: '端口冲突:两个容器都想监听 8080,第二个启动失败',
    MNT: '文件系统互踩:容器 A 能改容器 B 的 /etc 配置',
    UTS: 'hostname 共享:无法区分两台「机器」',
    IPC: '容器间可以互相发信号/共享内存(安全隐患)',
    USER: '容器内 root = 宿主机 root(提权风险极大)',
  }
  return {
    ...s,
    namespaceEnabled: { ...s.namespaceEnabled, [kind]: enabled },
    log: [...s.log, enabled ? `开启 ${meta.label}:✓ ${meta.effect}` : `关闭 ${meta.label}:✗ ${consequence[kind]}`],
  }
}

/** Cgroups 开关对照 */
export function toggleCgroups(s: DockerState): DockerState {
  const enabled = !s.cgroupEnabled
  return {
    ...s,
    cgroupEnabled: enabled,
    containers: s.containers.map(c => ({
      ...c,
      memLimitMB: enabled ? 512 : null,
      cpuPercent: enabled ? 100 : null,
    })),
    log: [...s.log, enabled ? '开启 Cgroups:容器内存/CPU 被限额(超限 OOM)' : '关闭 Cgroups:容器可以吃光宿主机资源 —— 经典事故形态'],
  }
}

/** 停止容器:可写层丢弃 */
export function stopContainer(s: DockerState, containerId: string): DockerState {
  const target = s.containers.find(c => c.id === containerId)
  const containers = s.containers.map(c => (c.id === containerId ? { ...c, status: 'stopped' as const, writableMB: 0 } : c))
  return {
    ...s,
    containers,
    log: [...s.log, `停止 ${target?.name}:可写层丢弃(数据蒸发!)—— 持久化必须挂 Volume`],
  }
}

/** 宿主机可见进程数(教学:Namespace 关掉 PID 后互相可见) */
export function hostProcessCount(s: DockerState): number {
  const pidOn = s.namespaceEnabled.PID
  const containerProcs = s.containers.filter(c => c.status === 'running').length
  return pidOn ? HOST_TOTAL_PROCESSES : HOST_TOTAL_PROCESSES + containerProcs
}
