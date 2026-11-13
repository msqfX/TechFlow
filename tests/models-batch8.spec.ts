import { describe, expect, it } from 'vitest'
import {
  checkRbProperties,
  createRbState,
  rbFixupStep,
  rbHeight,
  rbInsert,
} from '@/tutorials/algorithm/red-black-tree/model'
import {
  createDijkstraState,
  dijkstraStep,
  pathTo,
} from '@/tutorials/algorithm/dijkstra/model'
import {
  buildImage,
  createDockerfileState,
  layerHash,
  sharedLayerCount,
} from '@/tutorials/cloud-native/docker-image/model'
import {
  apacheProcessCount,
  acceptConnection,
  createNginxState,
  finishConnection,
  processConnection,
  totalWorkerConnections,
} from '@/tutorials/middleware/nginx-working/model'
import {
  MQ_CAPACITY,
  createMqState,
  mqTick,
  scaleConsumer,
  syncTick,
} from '@/tutorials/middleware/message-queue/model'

describe('红黑树模型', () => {
  function insertAll(keys: number[]) {
    let s = createRbState()
    for (const k of keys) {
      s = rbInsert(s, k)
      let guard = 0
      while (s.fixupId !== null && guard < 20) {
        s = rbFixupStep(s)
        guard++
      }
    }
    return s
  }

  it('递增插入(BST 最坏序列):红黑树保持平衡', () => {
    const s = insertAll([10, 20, 30, 40, 50, 60, 70])
    const props = checkRbProperties(s)
    expect(props.rootBlack).toBe(true)
    expect(props.noRedRed).toBe(true)
    expect(props.equalBlackHeight).toBe(true)
    expect(props.ordered).toBe(true)
    // 高度被钉在 O(log n):7 节点 ≤ 2*log₂(8) = 6
    expect(rbHeight(s)).toBeLessThanOrEqual(6)
  })

  it('随机序列插入:五性质持续满足', () => {
    const s = insertAll([5, 3, 8, 1, 4, 9, 2, 6])
    const props = checkRbProperties(s)
    expect(props.rootBlack).toBe(true)
    expect(props.noRedRed).toBe(true)
    expect(props.equalBlackHeight).toBe(true)
    expect(props.ordered).toBe(true)
  })

  it('修复产生旋转与变色', () => {
    const s = insertAll([10, 20, 30]) // 30 插入触发 RR 旋转
    expect(s.rotations).toBeGreaterThanOrEqual(1)
    expect(s.recolors).toBeGreaterThanOrEqual(1)
  })

  it('空树插入单键:根涂黑', () => {
    let s = createRbState()
    s = rbInsert(s, 10)
    expect(s.fixupId).not.toBeNull()
    s = rbFixupStep(s)
    expect(s.nodes[s.rootId!]?.color).toBe('black')
    expect(s.fixupId).toBeNull()
  })
})

describe('Dijkstra 模型', () => {
  function runFull(start = 'A') {
    let s = createDijkstraState(start)
    let guard = 0
    while (!s.done && guard < 20) {
      s = dijkstraStep(s)
      guard++
    }
    return s
  }

  it('完整执行:全部节点确定,距离正确', () => {
    const s = runFull('A')
    expect(s.done).toBe(true)
    expect(s.dist['A']).toBe(0)
    // A→C=2;A→B=4;A→B→C=5 不如 A→C=2;A→C→D=10 vs A→B→D=9 → B→D
    expect(s.dist['C']).toBe(2)
    expect(s.dist['B']).toBe(3)
    expect(s.dist['D']).toBe(8) // A→C→B→D(2+1+5=8) < A→B→D(5)
  })

  it('路径回溯:前驱链正确', () => {
    const s = runFull('A')
    const path = pathTo(s, 'D')
    expect(path[0]).toBe('A')
    expect(path[path.length - 1]).toBe('D')
    // 总代价 = 9
    let total = 0
    for (let i = 1; i < path.length; i++) {
      const edge = TEACHING_EDGES().find(
        e => (e.from === path[i - 1] && e.to === path[i]) || (e.from === path[i] && e.to === path[i - 1]),
      )
      total += edge?.weight ?? 0
    }
    expect(total).toBe(8)
  })

  it('贪心不会回头:已确定节点不再更新', () => {
    let s = runFull('A')
    // settled 数量在 runFull 结束后不变
    const settledAfter = s.settled.length
    const s2 = dijkstraStep(s)
    expect(s2.settled.length).toBe(settledAfter)
  })
})

function TEACHING_EDGES() {
  return [
    { from: 'A', to: 'B', weight: 4 },
    { from: 'A', to: 'C', weight: 2 },
    { from: 'B', to: 'C', weight: 1 },
    { from: 'B', to: 'D', weight: 5 },
    { from: 'C', to: 'D', weight: 8 },
    { from: 'C', to: 'F', weight: 10 },
    { from: 'D', to: 'E', weight: 2 },
    { from: 'E', to: 'F', weight: 3 },
    { from: 'D', to: 'F', weight: 6 },
  ]
}

describe('Docker 镜像模型', () => {
  it('layerHash:确定性且随内容变化', () => {
    const h1 = layerHash('RUN apt-get install runtime', 'sha256:base00000001')
    const h2 = layerHash('RUN apt-get install runtime', 'sha256:base00000001')
    expect(h1).toBe(h2)
    expect(h1).not.toBe(layerHash('RUN apt-get install runtime', 'sha256:base00000002'))
  })

  it('构建:Dockerfile 指令 → 层', () => {
    const r = buildImage(createDockerfileState(), 'new-app', [
      { cmd: 'COPY app.js /app/', sizeMB: 10 },
    ])
    // 基础层 + 新层
    const img = r.images.find(i => i.name === 'new-app')!
    expect(img.layers.length).toBe(2)
    expect(img.layers[0]?.directive).toBe('FROM debian:slim')
    expect(img.layers[1]?.directive).toBe('COPY app.js /app/')
  })

  it('内容寻址复用:相同指令命中缓存', () => {
    const s = createDockerfileState()
    // my-app 已有 RUN apt-get install runtime 层
    const r = buildImage(s, 'worker-app', [
      { cmd: 'RUN apt-get install runtime', sizeMB: 120 },
    ])
    expect(r.cacheHits).toBeGreaterThanOrEqual(1) // FROM 命中
    const img = r.images.find(i => i.name === 'worker-app')!
    // 该层 ID 与 my-app 的第二层相同 → 复用
    const runtime = img.layers.find(l => l.directive.includes('apt-get install runtime'))
    expect(runtime).toBeDefined()
  })

  it('两镜像共享基础层', () => {
    let s = createDockerfileState()
    const r = buildImage(s, 'worker-app', [
      { cmd: 'RUN apt-get install worker-deps', sizeMB: 60 },
      { cmd: 'COPY worker.js /app/', sizeMB: 8 },
    ])
    s = { ...s, images: r.images }
    expect(sharedLayerCount(s)).toBeGreaterThanOrEqual(1) // 至少共享基础层
  })
})

describe('Nginx 模型', () => {
  it('连接注册:分配给 epoll,Apache 对照线性增长', () => {
    let s = createNginxState()
    s = acceptConnection(s, 'conn-1')
    s = acceptConnection(s, 'conn-2')
    expect(totalWorkerConnections(s)).toBe(2)
    expect(apacheProcessCount(s)).toBe(2)
    // worker 数恒定
    expect(s.workers.length).toBe(4)
  })

  it('事件就绪处理:静态直接返回,动态走 upstream', () => {
    let s = createNginxState()
    s = acceptConnection(s, 'conn-1')
    s = processConnection(s, 'conn-1', 'static')
    expect(s.processing?.target).toBe('static')
    s = finishConnection(s, 'conn-1')
    expect(totalWorkerConnections(s)).toBe(0)
    s = acceptConnection(s, 'conn-2')
    s = processConnection(s, 'conn-2', 'upstream')
    expect(s.upstream?.connections).toBe(1)
  })

  it('连接完成:从 worker 释放', () => {
    let s = createNginxState()
    s = acceptConnection(s, 'conn-1')
    s = finishConnection(s, 'conn-1')
    expect(totalWorkerConnections(s)).toBe(0)
  })

  it('洪峰:10 连接,epoll 全部注册,worker 数不变', () => {
    let s = createNginxState()
    for (let i = 0; i < 10; i++) s = acceptConnection(s, `burst-${i}`)
    expect(totalWorkerConnections(s)).toBe(10)
    expect(s.workers.length).toBe(4) // worker 恒定
    expect(apacheProcessCount(s)).toBe(10) // Apache 对照:10 进程
  })
})

describe('消息队列模型', () => {
  it('同步模式:下游速率上限,超出全部失败', () => {
    let s = createMqState(10, 3)
    s = syncTick(s, 10)
    expect(s.dropped).toBe(7)
    expect(s.queue.length).toBe(0) // 同步无队列
  })

  it('MQ 削峰:生产 10 消费 3 → 积压 7', () => {
    let s = createMqState(10, 3)
    s = mqTick(s, 10)
    expect(s.queue.length).toBe(7)
    expect(s.dropped).toBe(0)
    expect(s.maxDepth).toBe(7)
  })

  it('消费追平:扩容后积压排空', () => {
    let s = createMqState(10, 3)
    s = mqTick(s, 10)
    expect(s.queue.length).toBe(7)
    s = scaleConsumer(s, 10)
    s = mqTick(s, 0) // 只消费不生产
    expect(s.queue.length).toBe(0)
  })

  it('队列满:溢出丢弃(内存型)', () => {
    let s = createMqState(10, 0)
    let guard = 0
    while (s.queue.length < MQ_CAPACITY && guard < 10) {
      s = mqTick(s, 10)
      guard++
    }
    // 队列已满,再来一个 tick:全部溢出丢弃
    s = mqTick(s, 10)
    expect(s.queue.length).toBe(MQ_CAPACITY)
    expect(s.dropped).toBe(10)
  })
})
