import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-process-thread',
    slug: 'process-thread',
    title: '进程与线程',
    description:
      '用单核调度动画理解进程与线程:地址空间隔离、线程共享堆与私有栈、时间片切换的上下文保存,以及竞态条件为什么会发生。',
    category: 'computer',
    difficulty: 'intermediate',
    duration: 18,
    tags: ['进程', '线程', '调度', '上下文切换', '竞态条件'],
    prerequisites: ['cpu-executes-program'],
    relatedTutorials: ['cpu-executes-program', 'tomcat-internals', 'jvm-memory-model'],
    sceneType: 'process-thread',
    featured: false,
    order: 2,
  },
  objectives: [
    '理解进程 = 资源分配单位(独立地址空间),线程 = 调度单位(共享地址空间)',
    '掌握单核时间片轮转与上下文切换保存/恢复的内容',
    '通过动画理解线程共享堆数据:一个线程的写入对另一个线程立即可见',
    '亲眼看到竞态条件(丢失更新)如何发生,以及加锁为什么有效',
  ],
  chapters: [
    {
      id: 'process',
      title: '进程:资源分配的基本单位',
      body: `**进程 = 一个正在运行的程序 + 它独占的资源**。操作系统给每个进程分配:

- **独立的虚拟地址空间**:进程 A 绝对读不到进程 B 的内存(隔离是安全的基石);
- 文件描述符、信号处理、IPC 通道等资源;
- 一份 PCB(进程控制块)记录它的状态。

进程之间通信必须走操作系统提供的通道(管道、共享内存、Socket),**没有共享内存的默认访问权** —— 这就是「浏览器崩溃不会拖垮整个系统」「一个服务 OOM 不影响同机其他服务」的原因。`,
    },
    {
      id: 'thread',
      title: '线程:调度的基本单位',
      body: `**线程 = 进程内的一条执行流**。同一个进程可以有多个线程,它们:

- **共享**:进程的地址空间 —— 堆上的对象、全局变量、打开的文件;
- **私有**:自己的栈(局部变量)、寄存器上下文、程序计数器。

「线程私有栈 + 共享堆」这个组合解释了大量工程现象:局部变量天然线程安全(在私有栈上);**堆上的共享数据不加保护就会被并发改坏**(竞态条件);Tomcat 的 Servlet 是单实例多线程,所以不能用实例字段存请求状态。`,
    },
    {
      id: 'schedule',
      title: '时间片轮转与上下文切换',
      body: `单核 CPU 同一时刻只能执行一条指令流,**「并发」是靠高速切换制造的假象**:

1. 线程 A 用完时间片(如 10ms)或被阻塞(等 IO/锁);
2. 操作系统执行**上下文切换**:把 A 的寄存器、PC 保存到它的 TCB,恢复 B 之前保存的寄存器与 PC;
3. CPU 从 B 上次暂停的位置继续执行。

切换本身有成本(微秒级 + 缓存污染),所以:**线程不是越多越好** —— 大量线程互相抢占,CPU 时间反而耗在切换上(线程池的存在意义)。`,
    },
    {
      id: 'race',
      title: '竞态条件:两条执行流踩同一块内存',
      body: `经典的丢失更新:两个线程同时执行 \`counter = counter + 1\`。这条语句在 CPU 层面是**三步**:读内存 → 加 1 → 写回内存。

如果线程 A 读完(counter=5)还没写回,线程 B 也读了(5)、加了、写回(6);然后 A 才写回它的结果(6)—— **两次自增,结果只加了一次**。

根因:「读-改-写」不是原子操作。修复思路:**加锁**(互斥量让三步变成临界区,同一时刻只有一个线程能进)、或使用原子的 CPU 指令(如 compare-and-swap)。动画里的挑战模式可以亲手制造这个丢失更新。`,
    },
  ],
}

export default tutorial
