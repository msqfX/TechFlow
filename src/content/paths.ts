import type { LearningPath } from '@/types/content'

/** 学习路线(docs §3.2 F) */
export const learningPaths: LearningPath[] = [
  {
    slug: 'network',
    title: '计算机网络学习路线',
    description: '从分层模型到 TCP/UDP,再到 DNS 与 HTTP,自底向上看懂网络通信。',
    icon: 'network',
    durationWeeks: 6,
    tags: ['TCP/IP', 'DNS', 'HTTP'],
    steps: [
      {
        title: '1. 理解 IP 地址与子网',
        description: '先掌握 IPv4 的二进制结构,学会计算网络地址、广播地址与可用范围。',
        tutorial: 'ip-address',
      },
      {
        title: '2. 子网掩码与 CIDR',
        description: '理解 CIDR 前缀如何划分网络位与主机位,动手做子网划分。',
        tutorial: 'subnet-cidr',
      },
      {
        title: '3. 交换机与 MAC 地址',
        description: '理解以太网帧如何在局域网内被交换机学习与转发。',
        tutorial: 'switch-working',
      },
      {
        title: '4. TCP 三次握手',
        description: '用状态机视角理解连接建立过程中的 Seq/Ack 变化。',
        tutorial: 'tcp-handshake',
      },
      {
        title: '5. TCP 四次挥手',
        description: '理解连接拆除与 TIME_WAIT 的意义。',
        tutorial: 'tcp-teardown',
      },
      {
        title: '6. DNS 域名解析',
        description: '理解递归查询与迭代查询,以及各级 DNS 缓存。',
        tutorial: 'dns-resolution',
      },
      {
        title: '7. HTTP 请求全过程',
        description: '把 DNS、TCP、TLS、HTTP 串成一条完整链路。',
        tutorial: 'http-request-flow',
      },
    ],
  },
  {
    slug: 'java-backend',
    title: 'Java 后端开发原理路线',
    description: '从 JVM 内存模型到 Tomcat 请求处理,理解 Java 服务端的运行机制。',
    icon: 'braces',
    durationWeeks: 5,
    tags: ['JVM', 'Tomcat', 'Java'],
    steps: [
      {
        title: '1. JVM 内存模型',
        description: '理解堆、栈、方法区等运行时数据区以及对象的分配过程。',
        tutorial: 'jvm-memory-model',
      },
      {
        title: '2. CPU 如何执行程序',
        description: '回到最底层,理解取指、解码、执行的完整循环。',
        tutorial: 'cpu-executes-program',
      },
      {
        title: '3. Tomcat 工作原理',
        description: '理解请求从 Connector 到 Servlet 的完整处理链路。',
        tutorial: 'tomcat-internals',
      },
      {
        title: '4. HTTP 请求全过程',
        description: '理解一个 HTTP 请求从浏览器到服务器的完整旅程。',
        tutorial: 'http-request-flow',
      },
    ],
  },
  {
    slug: 'go-internals',
    title: 'Go 语言底层原理路线',
    description: '从计算机基础到 Go 运行时,理解 goroutine 调度与内存分配。',
    icon: 'cpu',
    durationWeeks: 4,
    tags: ['Go', '运行时', '调度'],
    steps: [
      {
        title: '1. CPU 如何执行程序',
        description: '理解指令周期,是理解任何运行时的前提。',
        tutorial: 'cpu-executes-program',
      },
      {
        title: '2. 计算机网络基础',
        description: '理解 TCP 与 DNS,为理解 Go 网络编程打基础。',
        tutorial: 'tcp-handshake',
      },
      {
        title: '3. Go GMP 调度模型(规划中)',
        description: '理解 G、M、P 三者的协作与调度循环。',
      },
      {
        title: '4. Go 内存分配与 GC(规划中)',
        description: '理解逃逸分析、mcache 与三色标记。',
      },
    ],
  },
  {
    slug: 'cloud-native',
    title: '云原生学习路线',
    description: '从容器原理到 Kubernetes 调度,理解云原生基础设施。',
    icon: 'cloud',
    durationWeeks: 6,
    tags: ['Docker', 'Kubernetes'],
    steps: [
      {
        title: '1. 计算机网络基础',
        description: '容器网络的前提是理解 IP、路由与 NAT。',
        tutorial: 'ip-address',
      },
      {
        title: '2. Linux 进程与命名空间(规划中)',
        description: '理解容器就是被隔离和限制的进程。',
      },
      {
        title: '3. Kubernetes 架构(规划中)',
        description: '理解 Control Plane 与 Node 的组件协作。',
      },
      {
        title: '4. Pod 调度与 Service(规划中)',
        description: '理解调度决策与服务发现的机制。',
      },
    ],
  },
  {
    slug: 'database',
    title: '数据库原理路线',
    description: '从索引结构到事务日志,理解 MySQL 为什么又快又可靠。',
    icon: 'database',
    durationWeeks: 5,
    tags: ['MySQL', '索引', '事务'],
    steps: [
      {
        title: '1. B+Tree 索引(规划中)',
        description: '理解为什么数据库选择 B+Tree 而不是二叉树或哈希表。',
      },
      {
        title: '2. 数据结构与算法基础',
        description: '补齐树、排序、哈希等基础知识。',
      },
      {
        title: '3. MySQL 查询执行过程(规划中)',
        description: '理解一条 SQL 从解析到返回的完整路径。',
      },
      {
        title: '4. 事务与 MVCC(规划中)',
        description: '理解隔离级别与多版本并发控制。',
      },
    ],
  },
]

export function getLearningPath(slug: string): LearningPath | undefined {
  return learningPaths.find(p => p.slug === slug)
}
