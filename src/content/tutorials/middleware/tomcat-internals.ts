import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-tomcat-internals',
    slug: 'tomcat-internals',
    title: 'Tomcat 工作原理',
    description:
      '跟随一个 HTTP 请求穿过 Tomcat 的 Connector、Engine、Host、Context、Wrapper 直至 Servlet,理解线程池与请求队列的运作。',
    category: 'middleware',
    difficulty: 'advanced',
    duration: 25,
    tags: ['Tomcat', 'Servlet', 'Connector', '线程池', '请求处理'],
    prerequisites: ['http-request-flow', 'jvm-memory-model'],
    relatedTutorials: ['http-request-flow', 'jvm-memory-model', 'cpu-executes-program'],
    sceneType: 'tomcat',
    featured: false,
    order: 9,
  },
  objectives: [
    '掌握 Tomcat 的组件层级:Server → Service → Connector + Engine → Host → Context → Wrapper → Servlet',
    '理解 Connector 如何接收连接、解析 HTTP 并把请求交给容器',
    '理解请求如何按 Host/Context/Wrapper 逐级匹配到目标 Servlet',
    '理解线程池参数(maxThreads、acceptCount)与请求排队、拒绝的关系',
  ],
  chapters: [
    {
      id: 'architecture',
      title: '整体架构:连接器与容器',
      body: `Tomcat 的顶层结构是一棵清晰的组件树:

**Server**(整个 JVM 实例)
 └─ **Service**(把连接器和引擎打包)
     ├─ **Connector**(NIO 连接器,监听 8080 等端口)
     └─ **Engine**(Servlet 引擎,处理业务逻辑)
         └─ **Host**(虚拟主机,按域名区分,如 localhost)
             └─ **Context**(一个 Web 应用,按路径区分,如 /app)
                 └─ **Wrapper**(一个 Servlet)
                     └─ **Servlet**(你的代码)

Connector 负责「网络进来的事」:监听端口、收 TCP 连接、解析 HTTP 报文、生成 Request/Response 对象。Engine 及以下容器负责「应用逻辑的事」:决定这个请求属于哪个应用、哪个 Servlet。二者通过 Request/Response 对象解耦。`,
    },
    {
      id: 'connector',
      title: 'Connector:接收连接与线程池',
      body: `以默认的 NIO 连接器为例,请求进入时的关键角色:

- **Acceptor**:专门线程阻塞在 accept() 上,接收新的 TCP 连接,放入轮询器队列;
- **Poller**:用多路复用(Selector)监听大量连接的可读事件,检测到请求数据就绪后再处理 —— 这是单个连接器支撑上万并发的关键;
- **线程池(Executor)**:就绪的请求被包装成任务,交给工作线程池执行解析与业务处理。

两个最常调的参数:

- **maxThreads**:工作线程数上限(默认 200)。每个进行中的请求占一个线程;
- **acceptCount**:操作系统的 TCP 等待队列长度(默认 100)。当线程池满且队列满时,新连接被拒绝。

当请求处理很慢(如慢 SQL),工作线程被占满,新请求开始在队列里排队;队列也满时出现连接拒绝 —— 这就是「线程池耗尽」故障的完整链路。`,
    },
    {
      id: 'container',
      title: '容器的逐级匹配:Engine → Host → Context → Wrapper',
      body: `请求进入 Engine 后,沿着管道(Pipeline)经过一组 Valve(阀门)逐级处理,核心是三次匹配:

1. **Host 匹配**:按请求头的 Host 字段(如 www.example.com)找到虚拟主机;找不到用默认 Host(通常 localhost);
2. **Context 匹配**:按 URL 路径前缀找 Web 应用,如 /app1/orders 匹配 /app1 这个 Context;
3. **Wrapper 匹配**:按 web.xml 或注解里的 Servlet 映射(如 /orders/* → OrderServlet)找到目标 Servlet。

匹配到 Wrapper 后,Tomcat 检查该 Servlet 是否已实例化:没有则执行加载与 **init()**;然后创建 FilterChain,依次经过应用配置的过滤器,最终调用 Servlet 的 **service()** 方法;service() 按请求方法分发到 doGet()/doPost() 等。响应沿原路返回,经过 Filter 链逆序、Connector 写回网络。`,
    },
    {
      id: 'servlet',
      title: 'Servlet 生命周期与并发模型',
      body: `一个 Servlet 在容器中的一生:

- **init()**:首次请求(或 load-on-startup)时调用一次,完成初始化;
- **service()**:每次请求都会调用,**同一个 Servlet 实例被所有请求线程共享** —— 这是理解 Servlet 并发的关键;
- **destroy()**:应用卸载/关闭时调用一次,释放资源。

因为单实例多线程,**Servlet 里不要用实例字段保存请求相关的可变状态**,否则会出现线程安全问题(典型的计数器 bug)。需要状态时用局部变量(线程栈私有)或外部存储。

这也解释了 Tomcat 的资源模型:内存中只有一份 Servlet 实例,却同时有 maxThreads 个线程在不同请求间流转;线程栈、请求对象、业务对象(堆)共同构成真实负载。排查 500 错误、OOM、线程池耗尽时,把「连接器线程 → Filter → Servlet → 业务对象」这条链路在脑子里走一遍,是定位问题的基本功。`,
    },
  ],
}

export default tutorial
