import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-nginx-working',
    slug: 'nginx-working',
    title: 'Nginx 工作原理',
    description:
      '跟随一条请求穿过 Nginx:master/worker 进程模型、epoll 事件驱动、反向代理与 upstream —— 对照 Tomcat 理解「为什么 Nginx 能扛十万并发连接」。',
    category: 'middleware',
    difficulty: 'intermediate',
    duration: 16,
    tags: ['Nginx', '反向代理', 'epoll', 'master-worker', '负载均衡'],
    prerequisites: ['tomcat-internals'],
    relatedTutorials: ['tomcat-internals', 'mysql-architecture', 'service-discovery'],
    sceneType: 'nginx-working',
    featured: false,
    order: 26,
  },
  objectives: [
    '掌握 master/worker 进程模型:master 管配置与端口,worker 干活',
    '理解事件驱动(epoll):worker 单线程也能扛数万连接的原因',
    '掌握反向代理与 upstream 负载均衡的机制,以及正向代理的区别',
    '理解本站部署里 Nginx 的四个职责:静态托管/路由回退/压缩/安全头',
  ],
  chapters: [
    {
      id: 'process-model',
      title: 'master / worker 进程模型',
      body: `Nginx 启动后是 **1 个 master + N 个 worker**(N 通常 = CPU 核数):

- **master**:读配置、绑定端口、fork worker、平滑重启(reload 时新 worker 接管,旧 worker 处理完存量连接再退出 —— 不丢请求);
- **worker**:干活的进程。多个 worker 通过**共享端口**竞争接受连接(内核层避免惊群),互相独立、互不加锁(除个别共享资源)。

worker 挂了 master 自动拉起新的 —— 这就是 Nginx 高稳定性的进程级保险。本站服务器上 \`docker compose restart\` 后秒级恢复,底层就是这套模型。`,
    },
    {
      id: 'epoll',
      title: '事件驱动:worker 如何扛数万连接',
      body: `关键差异在**连接处理模型**:

- **Apache 传统模式(prefork)**:每连接一个进程/线程 —— 1 万连接 = 1 万进程,内存与调度爆炸;
- **Nginx worker**:**单线程 + 事件循环(epoll)** —— 一个 worker 同时监控数万连接,谁的数据**就绪**就处理谁,等待中的连接不占任何执行资源。

这与 Tomcat NIO 连接器的 Poller 思想同源(见 Tomcat 教程),但 Nginx 更极致:**整条请求处理都是异步非阻塞的**(静态文件直接回、动态内容代理给上游后 worker 继续服务其他连接)。`,
    },
    {
      id: 'proxy',
      title: '反向代理与 upstream',
      body: `**反向代理**:客户端不知道真实后端,请求先到 Nginx,由它转发给上游(upstream)并把响应带回来 —— TLS 终止、静态/动态分流、压缩、限流都在这一层做。

**upstream 负载均衡**策略:轮询(默认)、权重、ip_hash(会话保持)、least_conn。与注册中心式**客户端负载均衡**(见服务发现教程)的区别:Nginx 是**服务端**负载均衡 —— 选路发生在中间代理,改配置即可上下线后端(配合健康检查)。

**正向代理** наоборот:代理站在**客户端**一侧,替用户访问外部(隐藏客户端);反向代理站在**服务端**一侧,替服务接客(隐藏服务端)。`,
    },
    {
      id: 'our-deploy',
      title: '本站部署里的 Nginx',
      body: `本站 techflow.msqf.cc 的 Nginx 配置就是这四件事的实例:

1. **静态托管**:root 指向 /data/app/techflow,构建产物直出;
2. **路由回退**:\`try_files $uri $uri/index.html /index.html\` —— 预渲染页优先,未预渲染路径回退 SPA;
3. **缓存策略**:带哈希的 /assets/ 强缓存一年,HTML no-cache;
4. **安全头 + TLS**:HSTS、X-Frame-Options、Let's Encrypt 证书(与 tool.msqf.cc 共用一张 SAN 证书)。

gzip 压缩在 http 层全局开启 —— 15KB 的 gzip JS 包就是它压出来的。`,
    },
  ],
}

export default tutorial
