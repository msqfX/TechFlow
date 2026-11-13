import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-raft-consensus',
    slug: 'raft-consensus',
    title: 'Raft 共识算法',
    description:
      '用 5 节点动画理解 Raft:领导者选举(任期/选票/多数派)、日志复制与提交,以及 Leader 宕机后的重新选主 —— 分布式一致性最易读的入门。',
    category: 'cloud-native',
    difficulty: 'advanced',
    duration: 20,
    tags: ['Raft', '共识算法', '选主', '多数派', '分布式'],
    prerequisites: ['service-discovery'],
    relatedTutorials: ['service-discovery', 'mysql-architecture', 'tcp-handshake'],
    sceneType: 'raft-consensus',
    featured: true,
    order: 24,
  },
  objectives: [
    '理解共识问题:多个节点对「谁是主、日志顺序」达成一致',
    '掌握 Raft 三种角色(Leader/Follower/Candidate)与任期(term)单调递增',
    '逐步追踪选主流程:超时 → 拉票 → 多数派 → 当选;理解为什么需要多数派',
    '理解日志复制:Leader 收请求 → 复制 → 多数确认 → 提交(对照 TCP 的确认思想)',
  ],
  chapters: [
    {
      id: 'problem',
      title: '共识问题:一群节点如何像一个整体',
      body: `分布式系统里的一台机器会宕机、网络会分区分组丢失。要让一组节点对外表现得像「一台可靠的机器」,必须解决两个共识问题:

1. **谁是主**:集群需要一个 Leader 协调所有写请求(不然各写各的,数据就乱了);
2. **日志顺序**:写操作的顺序必须全体一致(先改余额再扣库存,顺序错=资损)。

Paxos 早在 1990 年就解决了它,但出了名的难懂。Raft(2013)把问题拆成**选主 + 日志复制**两个可教学的子问题,成为工业界事实标准(etcd、Consul、TiKV、Nacos Raft 模式)—— 「易于理解」本身就是 Raft 的设计目标。`,
    },
    {
      id: 'roles',
      title: '三种角色与任期(term)',
      body: `每个节点在任一时刻处于三种角色之一:

- **Follower**(跟随者):被动接收 Leader 的心跳,「躺平」状态;
- **Candidate**(候选者):Follower 超时没听到心跳 → 自荐当 Leader,发起拉票;
- **Leader**(领导者):唯一,处理所有客户端写请求,周期性发心跳维持权威。

**任期(term)是单调递增的逻辑时钟**:每次选举 term+1。任何节点发现更高的 term,立刻降级为 Follower —— 「term 大者为准」是 Raft 全局一致的裁判规则,与 TCP 教程里「旧报文靠序号识别」异曲同工。`,
    },
    {
      id: 'election',
      title: '选主:超时、拉票、多数派',
      body: `选主流程:

1. Follower 在**随机超时**(150~300ms,随机化避免同时起哄)内没收到心跳 → 转 **Candidate**,term+1,给自己投一票,并行向所有节点发 **RequestVote**;
2. 其他节点收到拉票:**term 比自己小 → 拒绝**;term 更大且**本轮还没投过票 → 投给它**;
3. Candidate 拿到**多数派**(5 节点中的 3 票)→ 当选 Leader,立刻广播心跳。

**为什么必须多数派?** 任何两个多数派集合**必有交集** —— 交集节点保证同一 term 只投过一票,因此**同一 term 最多产生一个 Leader**,不存在两个「合法主」。5 节点容忍 2 台故障,2n+1 容忍 n 台。`,
    },
    {
      id: 'replication',
      title: '日志复制与提交',
      body: `Leader 当选后处理写请求:

1. 客户端写请求到达 Leader → 追加到自己的**日志**(未提交状态);
2. Leader 并行把日志条目**复制**给所有 Follower(下一次心跳顺路携带);
3. Follower 追加到本地日志后回 **ACK**;
4. Leader 收到**多数派 ACK** → 提交(apply 到状态机),回复客户端成功;
5. 后续心跳告诉 Follower「这些已提交」,Follower 也 apply。

这套「**复制 → 多数确认 → 提交**」与 TCP 的「发送 → 确认 → 重传」思想同源:**用确认换可靠,用多数派换一致**。Leader 宕机也不怕:已提交的日志至少存在于多数派节点,新 Leader 必然拥有它们(选举安全性)—— 集群继续用新 Leader 服务。`,
    },
  ],
}

export default tutorial
