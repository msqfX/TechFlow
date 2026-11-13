import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-service-discovery',
    slug: 'service-discovery',
    title: '服务注册与发现',
    description:
      '在注册中心动画里观察微服务的生命线:服务注册、心跳保活、超时剔除、订阅推送与客户端负载均衡 —— 理解调用方为什么永远拿得到可用实例。',
    category: 'cloud-native',
    difficulty: 'intermediate',
    duration: 15,
    tags: ['注册中心', '服务发现', '心跳', '微服务', '负载均衡'],
    prerequisites: ['dns-resolution'],
    relatedTutorials: ['raft-consensus', 'dns-resolution', 'cdn-working'],
    sceneType: 'service-discovery',
    featured: false,
    order: 25,
  },
  objectives: [
    '理解微服务动态扩缩容下「硬编码地址」为何不可行,注册中心解决什么',
    '掌握服务生命周期:注册 → 心跳保活 → 超时剔除',
    '理解订阅推送与客户端缓存:调用方为什么不需要每次都问注册中心',
    '了解注册中心的一致性取舍(AP 的 Eureka vs CP 的 ZooKeeper/Consul)',
  ],
  chapters: [
    {
      id: 'why',
      title: '为什么需要注册中心',
      body: `单体时代调用另一个模块是进程内函数调用;微服务化后,被调方是**另一台机器上的进程**,首先要知道「它在哪里(IP:端口)」。

硬编码地址的三个死穴:实例**动态扩缩容**(高峰加机器、低谷缩容)、**宕机换机**(IP 随时变)、多实例**负载分摊**(一个地址打不满也扛不住)。

**注册中心**(Nacos、Eureka、Consul、etcd)就是服务地址的「实时电话簿」:服务启动时上报地址(注册),调用方按名字查询(发现),注册中心用**心跳**保证电话簿里只有活着的号码。对照《DNS》:DNS 面向公网通用域名、变更分钟级传播;注册中心面向集群内部、秒级实时 —— 它是「应用层的 DNS」。`,
    },
    {
      id: 'lifecycle',
      title: '服务实例的生命周期:注册、心跳、剔除',
      body: `一个服务实例的三段人生:

1. **注册**:启动完成后向注册中心上报「服务名 + IP:端口 + 元数据(权重/版本)」;
2. **心跳保活**:周期性(如每 5 秒)发送心跳证明「我还活着」;
3. **超时剔除**:注册中心超过阈值(如 15 秒)没收到心跳 → **摘除该实例**并推送变更。

优雅停机的服务会**主动注销**(发 deregister 请求)而非等超时 —— 这也是「发布一个新版本,流量为什么能平滑切走」的机制底座:新实例注册、旧实例注销,注册中心的列表实时反映拓扑。`,
    },
    {
      id: 'subscribe',
      title: '订阅与客户端负载均衡',
      body: `调用方(consumer)的工作方式:

1. **订阅**:向注册中心订阅某服务名的实例列表(如 order-service 的 3 个实例);
2. **本地缓存**:列表缓存在 consumer 内存 —— 调用时**不再询问注册中心**(注册中心不会成为调用瓶颈);
3. **变更推送**:实例上下线时注册中心**推送**最新列表,consumer 更新缓存;
4. **客户端负载均衡**:调用时 consumer 从缓存列表里**自己挑一个**(轮询/加权/一致性哈希)—— 对照 Nginx 那种「服务端负载均衡」:选择权在调用方手里(Ribbon/Dubbo 都是这个模式)。

妙处:注册中心**短暂宕机**也不影响调用 —— 各 consumer 手里的缓存列表还能用(只是可能过期),这就是「有损服务」的设计思想。`,
    },
    {
      id: 'cp-ap',
      title: 'CAP 取舍:AP 还是 CP',
      body: `注册中心自身也是分布式系统,面临一致性(C)与可用性(A)的取舍:

- **AP 型**(Eureka、Nacos 的临时实例模式):网络分区时各节点继续提供服务(可能拿到稍旧列表),保证「注册中心可用」。微服务场景多数选 AP —— 实例列表旧几秒可以容忍,注册中心全挂了才致命;
- **CP 型**(ZooKeeper、Consul、etcd):分区时少数派拒绝服务,保证列表强一致。适合配置管理、选主这类「宁可不可用也不能错」的场景(Raft 教程正是 CP 的基石)。

没有标准答案:**数据错了会出事故 → CP;暂时旧一点无所谓 → AP**。注册中心恰好是「暂时旧一点无所谓」的典型。`,
    },
  ],
}

export default tutorial
