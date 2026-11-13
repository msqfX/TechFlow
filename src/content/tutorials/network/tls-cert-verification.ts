import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-tls-cert-verification',
    slug: 'tls-cert-verification',
    title: 'HTTPS 证书验证',
    description:
      '拆开一张 X.509 证书,逐级走完验签、域名匹配、有效期与吊销检查,理解浏览器绿色锁背后的完整判定逻辑,以及通配符证书的匹配边界。',
    category: 'network',
    difficulty: 'advanced',
    duration: 18,
    tags: ['证书', 'X.509', '证书链', 'SAN', '通配符', 'OCSP'],
    prerequisites: ['tls-handshake'],
    relatedTutorials: ['tls-handshake', 'http-request-flow', 'cdn-working'],
    sceneType: 'tls-cert',
    featured: false,
    order: 14,
  },
  objectives: [
    '认识 X.509 证书的关键字段:Subject、Issuer、SAN、有效期、公钥、签名',
    '掌握证书链逐级验签的过程:用上级公钥验证下级签名,根 CA 是信任锚点',
    '掌握域名匹配规则:SAN 精确匹配与通配符(*.example.com)的一级子域边界',
    '理解有效期窗口与吊销检查(OCSP):证书可能在到期前失效',
    '能把验证失败的类别对应到浏览器告警与决策',
  ],
  chapters: [
    {
      id: 'anatomy',
      title: '证书里有什么:X.509 字段巡礼',
      body: `浏览器验证的「证书」是 **X.509** 格式的结构化文件,验证逻辑涉及的字段:

- **Subject(CN)**:证书持有者,如 www.example.com;
- **Issuer**:签发者(根 CA / 中间 CA 的名字);
- **SAN(Subject Alternative Name)**:证书**实际生效的域名列表** —— 现代浏览器只看 SAN,不看 CN;
- **有效期**:notBefore / notAfter 两个时间戳;
- **公钥**:站点密钥对里的公开部分(TLS 握手用);
- **签名**:由签发者的私钥对本证书内容的签名(验签的靶子);
- **序列号**:CA 内唯一,吊销查询(OCSP)用它定位。

可以在浏览器地址栏点开锁图标 → 查看证书,亲眼看到这些字段。`,
    },
    {
      id: 'chain',
      title: '验签:从根到叶的信任链',
      body: `操作系统/浏览器内置了一批**受信任的根 CA 证书**(信任锚点)。站点证书的验证链通常三级:

**根 CA(内置)→ 中间 CA → 站点证书**

验签的原理:**用上级证书的公钥,验证下级证书上的签名**。根 CA 的公钥就在你机器里,不需要网络;中间 CA 的证书由服务端在握手时一并下发。

为什么要中间 CA 这一层?根 CA 的私钥极度宝贵(离线保管),日常签发业务交给中间 CA:即使中间 CA 出事(如被攻破),可以吊销/更换中间证书而**不动根**。`,
    },
    {
      id: 'hostname',
      title: '域名匹配:SAN 与通配符的边界',
      body: `验证的第二关:**访问的域名必须出现在证书的 SAN 列表里**。

- **精确匹配**:证书 SAN 写了 www.example.com,就只覆盖它;
- **通配符**:\`*.example.com\` 匹配**一级子域**(a.example.com、b.example.com 都行),但**不匹配二级子域**(a.b.example.com ✗),也不匹配裸域 example.com(要覆盖裸域需同时写入两个 SAN);
- 通配符只允许出现在最左一段:\`www.*.example.com\` 是无效证书。

多域名证书很常见:一张证书的 SAN 同时写 example.com、www.example.com、tool.msqf.cc、techflow.msqf.cc —— 本站就是这种(SAN 四个域名)。`,
    },
    {
      id: 'time-revoke',
      title: '有效期与吊销:证书会「提前死亡」',
      body: `**有效期窗口**:当前时间必须落在 notBefore ≤ now ≤ notAfter 内。主流 CA 签发的证书已缩短到 90 天左右 —— 强制自动化续期(certbot),避免「过期忘了换」的经典事故。

**吊销检查(OCSP)**:证书在有效期内也可能提前失效 —— 私钥泄露、签发失误、中间 CA 出事。浏览器向 CA 的 OCSP 服务查询证书序列号的状态:

- **good**:有效;
- **revoked**:已吊销 → 验证失败;
- **unknown / 查询超时**:软失败(多数浏览器选择放行,避免 OCSP 慢导致打不开 —— 安全与可用的权衡;OCSP Stapling 由服务端代查并随握手附上结果,更快更隐私)。

⚠ 教学简化:真实验签还包括签名算法强度、密钥用途扩展(X.509 v3 扩展)等检查,本教程聚焦主干逻辑。`,
    },
    {
      id: 'alerts',
      title: '验证失败 → 浏览器告警的映射',
      body: `验证的四个检查(链、域名、时间、吊销)任何一项失败,浏览器都会**拦截并告警**:

| 失败项 | 典型告警 | 常见原因 |
|---|---|---|
| 证书链 | 「不受信任的连接」 | 自签名证书、私有 CA |
| 域名 | 「证书与域名不符」 | SAN 漏配、访问了未覆盖的子域 |
| 有效期 | 「证书已过期」 | 忘记续期(最常见事故) |
| 吊销 | 「证书已被吊销」 | 私钥泄露、CA 出事 |

「继续访问」意味着放弃**身份认证** —— 中间人攻击恰恰利用这一步诱导用户。配置了 HSTS 的站点连「继续访问」都不会提供。本站的证书就是一张多域名(SAN×4)+ 自动续期(certbot)的 Let's Encrypt 证书,右侧实验面板可以亲手制造每一种失败。`,
    },
  ],
}

export default tutorial
