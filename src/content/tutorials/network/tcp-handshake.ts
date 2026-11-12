import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-tcp-handshake',
    slug: 'tcp-handshake',
    title: 'TCP 三次握手',
    description:
      '用时序动画逐步观察 TCP 建立连接的过程:SYN、SYN+ACK、ACK 报文的序列号变化,以及客户端与服务端 TCP 状态机的迁移。',
    category: 'network',
    difficulty: 'intermediate',
    duration: 15,
    tags: ['TCP', '三次握手', 'SYN', '状态机', '序列号'],
    prerequisites: ['ip-address'],
    relatedTutorials: ['tcp-teardown', 'http-request-flow', 'dns-resolution'],
    sceneType: 'tcp-handshake',
    featured: true,
    order: 3,
  },
  objectives: [
    '掌握三次握手的完整报文交互与每一步 Seq/Ack 的变化规律',
    '跟踪客户端与服务端 TCP 状态机的迁移(SYN_SENT、SYN_RCVD、ESTABLISHED)',
    '理解初始序列号 ISN 的作用,以及「确认号 = 期望的下一个字节序号」',
    '能解释为什么两次握手不安全,而三次才足够',
  ],
  chapters: [
    {
      id: 'why',
      title: '为什么需要握手',
      body: `TCP 是**可靠的双向字节流**协议。通信前双方必须完成三件事,握手正是为此设计的:

1. **交换初始序列号(ISN)**:TCP 每个方向的数据流都用自己的序列号编号,双方要把自己从哪个序号开始告诉对方;
2. **确认双向能力**:证明「我发你能收」「你发我能收」两条通路都可用;
3. **协商参数**:MSS、窗口缩放、SACK 等选项随 SYN 报文传递。

握手次数由「可靠 + 双向 + 防历史连接」共同决定,少一次都有缺陷。`,
    },
    {
      id: 'process',
      title: '三次握手的完整过程',
      body: `假设客户端初始序列号 ISN 为 x,服务端为 y:

**第一次:SYN(客户端 → 服务端)**
SYN=1,seq=x。客户端进入 **SYN_SENT**。这个报文的含义是:「我的数据流从序号 x 开始,请注意」。

**第二次:SYN+ACK(服务端 → 客户端)**
SYN=1,ACK=1,seq=y,ack=x+1。服务端进入 **SYN_RCVD**。确认号 x+1 的含义是「你序号 x 之前的(其实只有这一个 SYN)我都收到了,请从 x+1 开始发数据」。

**第三次:ACK(客户端 → 服务端)**
ACK=1,ack=y+1。客户端发送后立即进入 **ESTABLISHED**;服务端收到 ACK 后也进入 **ESTABLISHED**。

关键规律:**确认号 = 对方已收到的最后一个字节序号 + 1 = 我期望收到的下一个序号**。SYN 虽然不携带数据,但它占用一个序号。`,
    },
    {
      id: 'why-three',
      title: '为什么不能是两次',
      body: `考虑经典问题:客户端发出的一个**旧的、迟到的 SYN**(网络中滞留后到达)如果服务端只回一次 SYN+ACK 就建立连接,就会创建一个「对方早已放弃」的无效连接,白白占用资源。

三次握手下,服务端的 SYN+ACK 需要**客户端再确认一次**。对于历史连接,客户端能通过 ack 值识别出这不是自己当前想要的连接,回复 RST 终止;只有当前连接的第三次 ACK 才会让双方进入 ESTABLISHED。

从信息论角度:两次只能证明「客户端 → 服务端」可达 + 服务端 → 客户端「发了」,但服务端无法确认「自己发的 SYN+ACK 客户端收到了」。第三次 ACK 补上了这个闭环。`,
    },
    {
      id: 'isn',
      title: '初始序列号 ISN 与 SYN 攻击',
      body: `ISN 不是从 0 开始,而是随时间变化的伪随机数。原因有二:

- **防混淆**:旧连接的迟到报文不会因为序号恰好落入新连接的窗口而被误收;
- **防伪造**:攻击者难以猜到 ISN,无法轻易伪造合法报文注入连接。

三次握手的代价是:服务端在收到 SYN 后、收到第三次 ACK 前,要为这个**半连接**分配资源(处于 SYN_RCVD)。攻击者伪造海量 SYN 且不回第三次 ACK,就会耗尽服务端半连接队列 —— 这就是经典的 **SYN Flood** 攻击。现代内核用 SYN Cookie(不保存半连接状态,把状态编码进 ISN)等手段缓解。`,
    },
  ],
}

export default tutorial
