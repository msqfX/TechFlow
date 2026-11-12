import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-tcp-teardown',
    slug: 'tcp-teardown',
    title: 'TCP 四次挥手',
    description:
      '逐步观察 TCP 连接拆除过程:FIN/ACK 报文交互、双方状态机迁移,深入理解 TIME_WAIT 状态为什么必须等待 2MSL。',
    category: 'network',
    difficulty: 'intermediate',
    duration: 15,
    tags: ['TCP', '四次挥手', 'TIME_WAIT', '状态机', 'FIN'],
    prerequisites: ['tcp-handshake'],
    relatedTutorials: ['tcp-handshake', 'http-request-flow', 'tomcat-internals'],
    sceneType: 'tcp-teardown',
    featured: false,
    order: 4,
  },
  objectives: [
    '掌握四次挥手的报文顺序与每一跳的状态迁移',
    '理解 TCP 全双工导致「四次」而不是「三次」的原因',
    '深入理解 TIME_WAIT 为什么存在、为什么持续 2MSL',
    '能在生产语境下解读大量 TIME_WAIT / CLOSE_WAIT 的含义',
  ],
  chapters: [
    {
      id: 'why-four',
      title: '为什么是四次:全双工的独立关闭',
      body: `TCP 连接是**全双工**的:客户端 → 服务端和服务端 → 客户端是两条独立的数据流。任何一方都可以先关闭自己这一侧的发送方向,而另一个方向还可以继续传数据(称为**半关闭**,对应 socket API 的 shutdown 调用)。

所以完整关闭需要「每个方向各关一次、各确认一次」:主动方发 FIN,被动方回 ACK;被动方处理完剩余数据后再发 FIN,主动方回 ACK。这就是四次挥手。如果被动方收到 FIN 时已经没有数据要发,它可以(通过延迟确认等机制)把 ACK 和自己的 FIN 合并,看起来就像三次挥手。`,
    },
    {
      id: 'process',
      title: '四次挥手的完整过程',
      body: `设主动关闭方为客户端:

**第一次:FIN(客户端 → 服务端)**
FIN=1,seq=u。客户端进入 **FIN_WAIT_1**,表示「我这一侧不再发数据了」。

**第二次:ACK(服务端 → 客户端)**
ack=u+1。服务端进入 **CLOSE_WAIT**;客户端收到后进入 **FIN_WAIT_2**。此时客户端 → 服务端方向已关闭,服务端 → 客户端方向还可以继续发。

**第三次:FIN(服务端 → 客户端)**
服务端把剩余数据发完后,发 FIN=1,seq=w,进入 **LAST_ACK**。

**第四次:ACK(客户端 → 服务端)**
ack=w+1。客户端进入 **TIME_WAIT**,等待 2MSL 后进入 **CLOSED**;服务端收到 ACK 立即进入 **CLOSED**。

状态速记:主动方走 FIN_WAIT_1 → FIN_WAIT_2 → TIME_WAIT → CLOSED;被动方走 CLOSE_WAIT → LAST_ACK → CLOSED。`,
    },
    {
      id: 'time-wait',
      title: 'TIME_WAIT:为什么主动方要等 2MSL',
      body: `MSL(最大报文生存时间)是报文在网络中允许存活的最长时间,典型取 30 秒,2MSL 即约 1 分钟。TIME_WAIT 必须等待 2MSL 的两个原因:

1. **保证最后的 ACK 可达**:如果第四次 ACK 丢了,服务端会重传 FIN。主动方必须保持状态才能重发 ACK;等满 2MSL 期间即使重传也来得及响应。
2. **让本连接的旧报文自然消亡**:等满 2MSL 后,网络上这条连接的所有报文都已超过生存时间,防止它们污染之后**复用相同四元组**的新连接。

这也是为什么高并发短连接场景(如压测机)会出现海量 TIME_WAIT —— 主动关闭方必须「占着」四元组一分钟。调优手段包括长连接复用(keep-alive)、端口范围调大、以及内核提供的 tcp_tw_reuse 等选项(有条件限制)。`,
    },
    {
      id: 'production',
      title: '生产视角:CLOSE_WAIT 堆积与 RST',
      body: `两种「挥手异常」在生产中含义完全不同:

- **大量 TIME_WAIT** 出现在主动关闭方,通常说明本机创建了大量短连接。它本身是协议正确行为,一般通过连接复用解决。
- **大量 CLOSE_WAIT** 出现在被动关闭方:对方已经发 FIN 关闭了,本机迟迟不调用 close()(通常是代码忘记释放连接,如未关闭的数据库连接、HttpClient 泄漏)。这是 **bug 信号**,不是内核参数问题。

另外,如果挥手前连接异常(进程崩溃、防火墙断开),任何一方都可能发 **RST** 立即终止连接 —— RST 不进入任何优雅状态,占用资源立刻释放,但可能丢失在途数据。`,
    },
  ],
}

export default tutorial
