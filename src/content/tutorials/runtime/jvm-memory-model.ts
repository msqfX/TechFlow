import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-jvm-memory-model',
    slug: 'jvm-memory-model',
    title: 'JVM 内存模型',
    description:
      '区分 JVM 运行时数据区与 Java 内存模型(JMM):跟随一个对象从栈帧创建到堆分配、引用变更、GC 回收的全过程。',
    category: 'runtime',
    difficulty: 'intermediate',
    duration: 20,
    tags: ['JVM', '堆', '栈', 'GC', '运行时数据区'],
    prerequisites: ['cpu-executes-program'],
    relatedTutorials: ['cpu-executes-program', 'tomcat-internals'],
    sceneType: 'jvm-memory',
    featured: true,
    order: 10,
  },
  objectives: [
    '分清「JVM 运行时数据区」与「Java 内存模型 JMM」两个容易混淆的概念',
    '掌握线程私有区(程序计数器、虚拟机栈、本地方法栈)与共享区(堆、方法区/元空间)的划分',
    '跟踪一个对象的完整生命周期:栈帧创建 → 堆分配 → 引用持有 → 失去引用 → GC 回收',
    '理解 GC 的基本判定思路(可达性分析)与分代回收的设计动机',
  ],
  chapters: [
    {
      id: 'clarify',
      title: '先分清两个「内存模型」',
      body: `社区讨论里「JVM 内存模型」常被混用,其实指两个东西:

- **JVM 运行时数据区**(本教程内容):JVM 规范定义的内存分区 —— 程序计数器、虚拟机栈、本地方法栈、堆、方法区(Java 8 后由元空间实现)。它回答「内存被划分成哪几块、分别放什么」。
- **Java 内存模型(JMM, JSR-133)**:关于**多线程并发**的规范 —— volatile、synchronized、final 的语义,happens-before 规则,工作内存与主内存的抽象。它回答「一个线程的写操作何时对另一个线程可见」。

两者层次完全不同:前者是内存布局,后者是并发可见性契约。本教程只讲前者,涉及并发可见性时请参考 JMM 专门资料。`,
    },
    {
      id: 'areas',
      title: '运行时数据区的划分',
      body: `JVM 运行时数据区分为**线程私有**与**线程共享**两类:

**线程私有(随线程创建销毁):**
- **程序计数器**:当前线程执行的字节码行号指示器,唯一不会 OOM 的区域;
- **虚拟机栈**:每调用一个方法就压入一个**栈帧**(局部变量表、操作数栈、动态链接、方法返回地址);栈深度超限抛 StackOverflowError,扩展失败抛 OOM;
- **本地方法栈**:为 native 方法服务。

**线程共享(随 JVM 存活):**
- **堆(Heap)**:几乎所有对象实例的分配地,GC 的主战场;通常分为新生代(Eden + 两个 Survivor)与老年代;
- **方法区**:存储类元信息、常量、静态变量;HotSpot 在 Java 8 之后用**元空间(Metaspace)**实现,使用本地内存。

变量引用在栈,对象本体在堆 —— 「Student s = new Student()」中,s(引用)在栈帧的局部变量表里,Student 实例在堆上。`,
    },
    {
      id: 'object-lifecycle',
      title: '一个对象的生命周期',
      body: `跟踪这段代码:main 方法里的 new Student():

**① 创建栈帧**:main 压栈,局部变量表分配一个槽位 s;
**② 堆分配**:JVM 在堆上为新对象分配内存(优先在线程私有的 TLAB 中分配,避免并发竞争);对象头记录类型指针、GC 年龄等信息;
**③ 建立引用**:栈帧局部变量 s 指向堆中的对象;
**④ 使用**:通过引用读写对象的字段(编译为字节码的 getfield/putfield);
**⑤ 失去引用**:s 被覆盖或栈帧出栈后,堆中的对象变成**不可达**;
**⑥ GC 回收**:垃圾收集器发现对象不可达后,在合适的时机回收它占用的内存。

关键洞察:**引用在栈上,对象在堆上,GC 只关心堆里的对象还有没有人引用**。这就是「内存泄漏」在 Java 里的形态 —— 对象明明不再需要,却被静态集合、缓存、监听器等无意间持有引用,GC 无法回收。`,
    },
    {
      id: 'gc',
      title: 'GC 的判定与分代回收(教学模型)',
      body: `**如何判定对象可回收?** 主流 JVM 使用**可达性分析**:从一组 **GC Roots**(栈帧局部变量、静态变量、JNI 引用等)出发遍历引用链,遍历不到的对象即可回收。这样天然解决「互相引用但都已孤立」的循环引用问题(与早期引用计数的差异)。

**为什么要分代?** 经验规律是「绝大多数对象朝生夕死,少数对象长期存活」:

- 对象优先在 **Eden** 分配;Eden 满触发 **Minor GC**(教学上可理解为「清理新生代不可达对象」);
- 存活对象在 Survivor 区之间往复,年龄达标后晋升**老年代**;
- 老年代满了触发 Major/Full GC,代价更高。

> 教学简化声明:本站动画使用简化的教学 GC 模型(可达性分析 + 分代搬运),用于建立正确的思维框架;真实的 HotSpot 收集器(Serial、Parallel、G1、ZGC)在并发标记、写屏障、Region 布局等实现上复杂得多,请以官方文档为准。`,
    },
  ],
}

export default tutorial
