import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-http-request-flow',
    slug: 'http-request-flow',
    title: 'HTTP 请求全过程',
    description:
      '从输入 URL 到页面渲染:URL 解析、DNS 查询、TCP 连接、TLS 握手、HTTP 请求响应、浏览器解析渲染,串起完整链路。',
    category: 'infrastructure',
    difficulty: 'intermediate',
    duration: 20,
    tags: ['HTTP', 'HTTPS', 'TLS', 'URL', '全链路'],
    prerequisites: ['dns-resolution', 'tcp-handshake'],
    relatedTutorials: ['dns-resolution', 'tcp-handshake', 'tcp-teardown', 'tomcat-internals'],
    sceneType: 'http-flow',
    featured: false,
    order: 7,
  },
  objectives: [
    '能把「输入 URL 回车」拆解成 DNS → TCP → TLS → HTTP → 渲染的完整阶段',
    '理解 URL 各部分与请求报文各部分的对应关系',
    '理解 HTTP 与 HTTPS 的差别,以及 TLS 握手在链路中的位置',
    '认识 HTTP/1.1、HTTP/2、HTTP/3 的演进要点',
  ],
  chapters: [
    {
      id: 'overview',
      title: '一次请求的十个阶段',
      body: `以访问 https://www.example.com/index.html 为例,完整链路是:

1. **URL 解析**:浏览器拆出协议(https)、主机(www.example.com)、路径(/index.html)、端口(默认 443);
2. **DNS 查询**:把域名解析成服务器 IP(含多级缓存检查);
3. **TCP 连接**:与目标 IP 完成三次握手(443 端口);
4. **TLS 握手**(HTTPS):协商加密参数、验证证书、生成会话密钥;
5. **发送 HTTP 请求**:构造请求报文发出;
6. **服务端处理**:Web 容器/应用处理请求,可能访问数据库;
7. **返回 HTTP 响应**:状态行、响应头、响应体(HTML);
8. **解析 HTML**:构建 DOM 与 CSSOM,加载引用的 CSS/JS/图片(回到第 5 步的子请求);
9. **渲染**:布局、绘制,页面呈现;
10. **连接处理**:HTTP/1.1 keep-alive 保持 TCP 连接复用,或一段时间后四次挥手关闭。

任何一步被卡住,都有对应的现象:DNS 慢 → 首字节迟迟不来;TCP/TLS 慢 → 连接建立耗时;响应体大 → 传输时间上升。`,
    },
    {
      id: 'http-message',
      title: 'HTTP 请求与响应报文',
      body: `HTTP 请求报文由三部分构成:

**请求行**:方法 + 路径 + 版本,如 GET /index.html HTTP/1.1
**请求头**:Host: www.example.com、User-Agent、Accept、Cookie 等
**请求体**:GET 通常没有;POST/PUT 携带数据

响应报文对应三部分:

**状态行**:HTTP/1.1 200 OK
**响应头**:Content-Type、Content-Length、Cache-Control、Set-Cookie 等
**响应体**:HTML/JSON/图片等数据

常用方法语义:GET 取资源(幂等),POST 创建/提交(不幂等),PUT 整体替换(幂等),DELETE 删除(幂等)。状态码分段:1xx 信息,2xx 成功,3xx 重定向,4xx 客户端错误(404 未找到,403 禁止),5xx 服务端错误(500 内部错误,502 网关上游故障,504 上游超时)。`,
    },
    {
      id: 'https',
      title: 'HTTPS = HTTP + TLS',
      body: `HTTP 明文传输,路径上的任何设备都能窃听、篡改内容。HTTPS 在 HTTP 与 TCP 之间插入 **TLS** 层,提供加密、完整性校验和身份认证。

TLS 握手的核心步骤(以 TLS 1.2 简化描述):

1. 客户端发送 ClientHello:支持的加密套件、随机数;
2. 服务端回 ServerHello + **证书**(含公钥,由 CA 签发);
3. 客户端**验证证书链**(系统内置的根 CA → 中间 CA → 站点证书,核对域名与有效期),生成预主密钥并用服务器公钥加密发送;
4. 双方用随机数 + 预主密钥推导出**对称会话密钥**,之后的 HTTP 数据全部用它对称加密。

TLS 1.3 把过程压缩到 1-RTT,更快也更安全。注意:**HTTPS 只改变传输层加密,不改变 HTTP 语义** —— 方法、状态码、报文结构完全一样。`,
    },
    {
      id: 'http-versions',
      title: 'HTTP 版本演进与缓存',
      body: `**HTTP/1.1**:长连接(keep-alive)避免每个请求都重建 TCP;但同一连接上请求必须排队(队头阻塞),浏览器用 6 个并发连接绕行。

**HTTP/2**:二进制分帧,一个 TCP 连接上**多路复用**多个流,消除 HTTP 层队头阻塞;头部压缩(HPACK)减少重复头部开销。但 TCP 层的队头阻塞仍在 —— 一个包丢失会阻塞所有流。

**HTTP/3**:把传输层换成 **QUIC**(基于 UDP),在传输层实现流隔离与可靠重传,彻底解决 TCP 队头阻塞,并把 TLS 1.3 内建进握手(0-RTT/1-RTT 建连)。

HTTP 缓存也是性能的关键:**强缓存**(Cache-Control: max-age,直接用本地副本不发请求)与**协商缓存**(ETag / Last-Modified,发请求问一句「变了没」,没变回 304 不传正文)。`,
    },
  ],
}

export default tutorial
