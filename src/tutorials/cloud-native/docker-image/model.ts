/**
 * Docker 镜像模型:Dockerfile 指令 → 层(内容寻址;纯函数,可测试)。
 * 层 ID = 简化哈希(指令+参数);相同层自动复用(两镜像共享)。
 */

export interface ImageLayer {
  id: string
  /** 生成该层的 Dockerfile 指令 */
  directive: string
  sizeMB: number
  /** 是否为 FROM 基础层(可跨镜像共享) */
  shared: boolean
}

export interface ImageState {
  name: string
  layers: ImageLayer[]
}

export interface DockerfileState {
  images: ImageState[]
  /** 构建当前镜像的指令序列(含层 id 引用) */
  buildLog: string[]
  /** 缓存命中次数 */
  cacheHits: number
  totalSizeMB: number
  log: string[]
}

export function layerHash(directive: string, parentHash: string): string {
  let h = 0
  const str = parentHash + directive
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0
  }
  return 'sha256:' + h.toString(16).padStart(12, '0')
}

const BASE_LAYER: ImageLayer = {
  id: 'sha256:base00000001',
  directive: 'FROM debian:slim',
  sizeMB: 77,
  shared: true,
}

export function createDockerfileState(): DockerfileState {
  const base: ImageLayer = { ...BASE_LAYER }
  const app: ImageState = {
    name: 'my-app',
    layers: [base, { id: 'sha256:base00000002', directive: 'RUN apt-get install runtime', sizeMB: 120, shared: true }],
  }
  return {
    images: [app],
    buildLog: ['镜像 my-app 已存在:2 层(FROM debian:slim + RUN runtime)'],
    cacheHits: 0,
    totalSizeMB: base.sizeMB + 120,
    log: ['基础层 debian:slim 已在本机(全网共享同一份)'],
  }
}

/** 构建:逐条指令生成层;命中已有层 ID 则复用(缓存) */
export function buildImage(
  s: DockerfileState,
  name: string,
  directives: Array<{ cmd: string; sizeMB: number }>,
): DockerFileBuildResult {
  const images = s.images.map(img => ({ ...img, layers: [...img.layers] }))
  const existing = images.find(img => img.name === name)
  const layers: ImageLayer[] = []
  const buildLog: string[] = []
  let parentHash = 'sha256:base00000001'
  let cacheHits = 0
  // 基础层必然复用(全网共享)
  layers.push({ ...BASE_LAYER })
  buildLog.push(`FROM debian:slim → 复用基础层(内容寻址相同,Already exists)`)
  cacheHits += 1
  let total = BASE_LAYER.sizeMB
  for (const d of directives) {
    const id = layerHash(d.cmd, parentHash)
    // 在所有已知镜像层中找相同 ID(复用)
    const allKnown = images.flatMap(img => img.layers)
    const hit = allKnown.find(l => l.id === id)
    if (hit) {
      layers.push({ ...hit })
      buildLog.push(`${d.cmd} → 缓存命中,复用层(0 成本)`)
      cacheHits += 1
    } else {
      const layer: ImageLayer = { id, directive: d.cmd, sizeMB: d.sizeMB, shared: false }
      layers.push(layer)
      buildLog.push(`${d.cmd} → 新建层(${d.sizeMB}MB,ID=${id.slice(7, 19)}…)`)
    }
    total += d.sizeMB
    parentHash = id
  }
  if (existing) {
    existing.layers = layers
  } else {
    images.push({ name, layers })
  }
  return { images, buildLog, cacheHits, totalSizeMB: total, name }
}

export interface DockerFileBuildResult {
  images: ImageState[]
  buildLog: string[]
  cacheHits: number
  totalSizeMB: number
  name: string
}

/** 两个镜像共享层的统计(教学:层复用率) */
export function sharedLayerCount(s: DockerfileState): number {
  if (s.images.length < 2) return 0
  const a = s.images[0]
  const b = s.images[1]
  if (!a || !b) return 0
  const aIds = new Set(a.layers.map(l => l.id))
  return b.layers.filter(l => aIds.has(l.id)).length
}
