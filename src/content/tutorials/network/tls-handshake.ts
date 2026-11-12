import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-tls-handshake',
    slug: 'tls-handshake',
    title: 'HTTPS/TLS 握手',
    description:
      '逐步观察 TLS 握手:ClientHello、证书链验证、密钥协商与 Finished,理解 HTTPS 如何在不安全信道上建立加密,以及证书告警是怎么来的。',
    category: 'network',
    difficulty: 'advanced',
    duration: 20,
    tags: ['TLS', 'HTTPS', '证书链', '密钥协商', 'CA'],
    prerequisites: ['http-request-flow', 'tcp-handshake'],
    relatedTutorials: ['http-request-flow', 'tcp-handshake', 'dns-resolution'],
    sceneType: 'tls-handshake',
    featured: false,
    order: 11,
  },
  objectives: [
    '掌握 TLS 握手的完整报文序列:ClientHello → ServerHello + Certificate → KeyExchange → Finished',
    '理解证书链验证的三个要点:签发链、域名匹配、有效期',
    '理解「非对称加密传材料、对称加密传数据」的设计原因',
    '能解释证书告警(过期/域名不匹配/自签名)各自的含义',
    '知道 TLS 1.3 相比 1.2 快在哪里',
  ],
  chapters: [
    {
      id: 'position',
      title: 'TLS 在协议栈中的位置',
      body: `HTTPS 不是独立协议,而是 **HTTP over TLS**:TLS 插在 HTTP 与 TCP 之间,给明文协议套上三层保障:

- **加密**(Confidentiality):路径上的设备看不到明文;
- **完整性**(Integrity):内容被篡改会被立刻发现;
- **身份认证**(Authentication):证书证明「这台服务器真的是 example.com」。

TLS 握手发生在 **TCP 三次握手之后、HTTP 报文之前** —— 先有可靠连接,再在其上协商加密。443 端口上的第一个字节就是 ClientHello。`,
    },
    {
      id: 'flow',
      title: 'TLS 1.2 握手的完整序列',
      body: `以浏览器访问 https://www.example.com 为例(简化自 RFC 5246):

**① ClientHello(客户端 → 服务端)**:客户端支持的 TLS 版本、加密套件列表、一个**客户端随机数**、SNI(告诉服务端要访问的域名 —— 同 IP 多站点靠它分流证书)。

**② ServerHello + Certificate(服务端 → 客户端)**:选定的套件、**服务端随机数**,以及**证书**(含站点公钥,由 CA 签发)。

**③ 证书链验证(客户端本地完成)**:系统内置的**根 CA** → **中间 CA** → **站点证书**,逐级验签;核对证书里的**域名**与访问的域名一致、**有效期**未过。

**④ Key Exchange(客户端 → 服务端)**:客户端生成**预主密钥**,用证书里的公钥(RSA)或 ECDHE 参数加密后发送。服务端用私钥解开。

**⑤ 密钥推导**:双方用「客户端随机数 + 服务端随机数 + 预主密钥」推导出相同的**会话密钥**。

**⑥ Finished**:双方各发一条用会话密钥加密的 Finished,校验整个握手未被篡改。此后所有 HTTP 报文都用会话密钥**对称加密**。`,
    },
    {
      id: 'asym-sym',
      title: '为什么用非对称传材料、对称传数据',
      body: `握手阶段用**非对称加密**(RSA/ECDHE),数据阶段用**对称加密**(AES-GCM/ChaCha20),是性能与安全的经典权衡:

- **非对称加密**解决了「不安全信道上如何安全地交换秘密」—— 公钥可以公开,私钥只有服务端有;但它比对称加密慢 100~1000 倍;
- **对称加密**极快,适合每个请求都要加解密的数据流;但密钥必须双方一致 —— 而密钥本身恰好用非对称加密送达。

所以:**用昂贵的非对称加密保护一小段「商量对称密钥」的通信,然后用便宜的对称密钥加密全部数据**。ECDHE 的好处还在于提供**前向安全**:每次连接生成独立的会话密钥,即使服务端私钥日后泄露,历史流量也无法解密。`,
    },
    {
      id: 'alerts',
      title: '证书告警是怎么来的',
      body: `浏览器验证证书失败时会拦截并告警,常见三类:

- **证书过期**:有效期(如 90 天)已过 —— 最常见的事故,现在主流 CA 用自动化续期(certbot)解决;
- **域名不匹配**:证书只覆盖 tool.msqf.cc,你访问的却是 techflow.msqf.cc —— 检查证书的 SAN 列表;
- **自签名/不受信的 CA**:签发链追不到系统内置的根 CA(内部系统常见)。

另外注意:**告警是「身份认证失败」,不代表传输被窃听** —— 但继续访问会失去「对面真的是那台服务器」的保证,中间人攻击恰好利用这一点诱导用户点击「继续访问」。右侧挑战模式可以模拟这三类故障。`,
    },
  ],
}

export default tutorial
