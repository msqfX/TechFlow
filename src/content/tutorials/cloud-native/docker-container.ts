import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-docker-container',
    slug: 'docker-container',
    title: 'Docker 容器原理',
    description:
      '在宿主机视角理解容器:Namespace 隔离视图、Cgroups 限额、联合文件系统分层 —— 容器不是虚拟机,是被隔离和限制的普通进程。',
    category: 'cloud-native',
    difficulty: 'intermediate',
    duration: 16,
    tags: ['Docker', '容器', 'Namespace', 'Cgroups', '镜像分层'],
    prerequisites: ['process-thread'],
    relatedTutorials: ['service-discovery', 'raft-consensus', 'jvm-memory-model'],
    sceneType: 'docker-container',
    featured: true,
    order: 26,
  },
  objectives: [
    '破除误解:容器不是虚拟机 —— 它是宿主机上一个被隔离和限制的普通进程',
    '掌握 Namespace 的作用:让进程「看不到」宿主机的其他进程/网络/挂载',
    '掌握 Cgroups 的作用:限制进程组的 CPU/内存用量',
    '理解镜像分层与可写层(UnionFS):容器销毁即丢数据',
  ],
  chapters: [
    {
      id: 'not-vm',
      title: '容器不是虚拟机',
      body: `**虚拟机**:Hypervisor 在硬件上虚拟出完整的计算机(CPU/内存/磁盘),每个 VM 跑一个**完整客户操作系统** —— 重(GB 级)、启动慢(分钟级)。

**容器**:宿主机上就是一个**普通进程**(或进程组),靠内核三件套给它「变魔术」:

- **Namespace**:隔离**视图** —— 让它以为自己是 1 号进程、独占网络、有自己的文件系统挂载;
- **Cgroups**:限制**用量** —— CPU 用多少、内存超了就 OOM 杀掉;
- **UnionFS(联合文件系统)**:堆叠**镜像层** —— 只读层共享 + 顶部可写层。

因为**共享宿主机内核**,容器镜像只有 MB 级、启动毫秒级 —— 「轻」是它区别于 VM 的本质。`,
    },
    {
      id: 'namespace',
      title: 'Namespace:视图隔离的六面墙',
      body: `Linux Namespace 让进程「看到」一个独立的世界,常用六类:

- **PID**:容器内自己的进程从 1 开始编号(容器内看不到宿主机其他进程);
- **NET**:独立的网络栈 —— 自己的网卡、IP、端口空间(所以两个容器都能监听 8080);
- **MNT**:独立的挂载点/文件系统视图(rootfs 不同);
- **UTS**:独立的主机名;
- **IPC**:隔离进程间通信;**USER**:容器内 root ≠ 宿主机 root。

本质只是内核对象的**视图过滤**:进程在内核里还是那些进程,只是每个 namespace 提供了一副「只能看见自己人」的眼镜。`,
    },
    {
      id: 'cgroups',
      title: 'Cgroups:限额与计量',
      body: `Namespace 只解决「看不见」,**Cgroups(control groups)** 解决「用不超」:

- **CPU**:限制容器最多用几个核(如 --cpus=1.5,按配额分时);
- **内存**:超出限额触发 OOM Killer 杀掉容器内进程 —— 容器 OOM 的直接原因;
- **IO/网络带宽**等同样可限。

这也是「容器里 JVM 内存参数为什么总配错」的根源:老版本 JVM 看到的是**宿主机的总内存**而非容器限额,堆配大了就被 OOM 杀 —— Java 10+ 的 UseContainerSupport 才正确感知 cgroups。`,
    },
    {
      id: 'layers',
      title: '镜像分层与可写层',
      body: `镜像由**只读层**堆叠(基础层 + 依赖层 + 应用层),容器启动时在顶部挂一个**可写层**(container layer):

- 同一镜像的多个容器**共享只读层** —— 拉一次镜像全机复用,这就是镜像小的原因;
- 容器内写文件 → **写时复制(CoW)**:从只读层复制到可写层再改;
- **容器销毁,可写层即丢** —— 所以数据库文件、日志必须挂 **Volume**(宿主机目录/云盘),容器只放无状态应用;
- \`docker commit\` 能把可写层固化成新镜像,但工程上应该用 **Dockerfile 重建**(可重复、可审计)。`,
    },
  ],
}

export default tutorial
