import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-tcp-reliable',
    slug: 'tcp-reliable',
    title: 'TCP 可靠传输',
    description:
      '用滑动窗口动画理解 TCP 可靠性:批量发送、累计确认、报文丢失与重复 ACK、快速重传,以及超时重传与拥塞控制的关系。',
    category: 'network',
    difficulty: 'advanced',
    duration: 22,
    tags: ['TCP', '滑动窗口', '累计确认', '快速重传', '拥塞控制'],
    prerequisites: ['tcp-handshake', 'tcp-teardown'],
    relatedTutorials: ['tcp-handshake', 'tcp-teardown', 'http-request-flow'],
    sceneType: 'tcp-reliable',
    featured: false,
    order: 12,
  },
  objectives: [
    '理解滑动窗口:批量发送不必逐个等待,窗口随 ACK 滑动',
    '掌握累计确认的语义:ACK n =「n 之前的全部收到,期望下一个是 n」',
    '理解报文丢失的两种检测:重复 ACK 触发快速重传、超时触发 RTO 重传',
    '知道拥塞控制的四个阶段(慢启动/拥塞避免/快恢复/快重传)如何调节窗口',
  ],
  chapters: [
    {
      id: 'window',
      title: '滑动窗口:停等问题到流水线',
      body: `如果每发一个报文就停下来等 ACK,吞吐量会低得不可用(一个 RTT 才发一个)。TCP 的解法是**滑动窗口**:

- 发送方维持一个窗口(比如 4 个报文),**窗口内的报文可以一口气全部发出**,不必等确认;
- 每收到一个 **ACK**,窗口左缘向右滑动一格,窗口内空出的位置允许发送新报文;
- 窗口左缘(sendBase)= 已确认的最大连续序号 + 1;窗口右缘 = sendBase + 窗口大小。

窗口大小同时受两个因素约束:**接收方通告的接收窗口(rwnd)** 和 **发送方的拥塞窗口(cwnd)** —— 取小者。本教程聚焦可靠传输机制,窗口当作固定值 4。`,
    },
    {
      id: 'ack',
      title: '累计确认的语义',
      body: `TCP 的 ACK 是**累计确认**:「ACK n」的含义不是「确认第 n 个报文」,而是:

**「序号 n 之前的所有字节都已收到,我期望的下一个字节是 n」**

这个语义带来一个重要现象:如果报文 3 丢了,但 4、5、6 都到了(接收方会缓存乱序报文),接收方每次收到新报文都会**重复发送 ACK 3** —— 「我还是缺 3」。发送方连续收到 **3 个重复 ACK**,就能在**超时之前**判断「3 大概率丢了」,立即重传 —— 这就是**快速重传**。`,
    },
    {
      id: 'retransmit',
      title: '两条重传路径:快速重传与超时',
      body: `报文丢失的两种检测与应对:

**快速重传(Fast Retransmit)**:收到 3 个重复 ACK → 立即重传丢失报文,不等超时。反应快(一个 RTT 内),配合**快速恢复**窗口只减半不归零。

**超时重传(RTO)**:定时器到期仍没等到确认 → 重传。RTO 基于 RTT 动态估计(通常 1s 起,指数退避)。超时更「重」:说明网络严重拥塞,重传后窗口大幅收缩。

此外接收方对**乱序到达**的报文(如 3 丢失后先到的 4、5)会缓存,配合 **SACK(选择性确认)** 告诉发送方「我已有哪些」—— 重传可以更精准,不用像老式 GBN(回退 N)那样把后面全部重发。本站动画以 Go-Back-N 式教学模型呈现核心机制,SACK 细节做了简化。`,
    },
    {
      id: 'congestion',
      title: '窗口为什么变化:拥塞控制一句话',
      body: `可靠传输回答「丢了怎么办」,拥塞控制回答「发多快合适」。经典 TCP(Reno)把 cwnd 的调节画成四个阶段:

- **慢启动**:连接初期 cwnd 从小值指数增长(每个 RTT 翻倍);
- **拥塞避免**:cwnd 达到阈值后线性 +1(谨慎试探);
- **快重传/快恢复**:3 个重复 ACK → 重传 + cwnd 减半继续(轻度拥塞);
- **超时** → cwnd 归 1 重新慢启动(重度拥塞)。

把「可靠传输」(本教程)与「拥塞控制」叠在一起,就是完整的 TCP 发送端行为:窗口尺寸由接收方与网络共同决定,丢了就退,稳了就进。`,
    },
  ],
}

export default tutorial
