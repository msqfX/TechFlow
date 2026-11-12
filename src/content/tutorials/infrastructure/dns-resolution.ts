import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-dns-resolution',
    slug: 'dns-resolution',
    title: 'DNS 域名解析',
    description:
      '跟随一个域名解析请求穿越浏览器缓存、本地 DNS、根服务器、顶级域与权威服务器,分清递归查询与迭代查询,理解缓存与 TTL。',
    category: 'infrastructure',
    difficulty: 'intermediate',
    duration: 18,
    tags: ['DNS', '递归查询', '迭代查询', '缓存', 'TTL'],
    prerequisites: ['ip-address'],
    relatedTutorials: ['http-request-flow', 'tcp-handshake', 'ip-address'],
    sceneType: 'dns-resolution',
    featured: true,
    order: 6,
  },
  objectives: [
    '理解 DNS 的层级结构:根域名服务器、顶级域服务器、权威域名服务器',
    '分清递归查询(客户端 → 本地 DNS)与迭代查询(本地 DNS → 各级服务器)',
    '理解浏览器缓存、系统缓存、本地 DNS 缓存与 TTL 的关系',
    '认识 NXDOMAIN、超时等常见解析异常及其排查思路',
  ],
  chapters: [
    {
      id: 'hierarchy',
      title: 'DNS:分布式的层级数据库',
      body: `DNS 把「域名 → IP」的映射拆成了一个**层级树**:

- **根域名服务器**(.) :全球 13 组根服务器(实际通过 anycast 有上千个节点),它不认识具体域名,但知道每个顶级域由谁管;
- **顶级域服务器**(TLD):管理 .com、.cn、.org 等后缀,告诉你某个域名的权威服务器在哪;
- **权威域名服务器**:真正保存 example.com → 93.184.216.34 这类记录的服务器,通常由 DNS 服务商或云厂商运营。

域名从右往左逐级缩小范围:www.example.com 中 com 是顶级域,example.com 是注册域,www 是其子域。这个「逐级委托」的设计让任何一台服务器都不必知道全网所有域名。`,
    },
    {
      id: 'recursive-iterative',
      title: '递归查询与迭代查询',
      body: `一次完整的解析混合了两种查询模式:

**客户端 → 本地 DNS(递归查询)**
客户端(浏览器/操作系统)把域名扔给配置好的本地 DNS(运营商的,或 8.8.8.8 / 114.114.114.114 这类公共 DNS),要求它**必须给出最终答案**,查不到就报错 —— 责任全部在本地 DNS。

**本地 DNS → 各级服务器(迭代查询)**
本地 DNS 自己去问:

1. 问**根服务器**:「www.example.com 谁管?」→ 根:「.com 在这边,这是 TLD 服务器地址」;
2. 问 **TLD 服务器**:「example.com 谁管?」→ TLD:「这是 example.com 的权威服务器」;
3. 问**权威服务器**:得到最终 IP。

所以:对客户端来说是递归,对上游来说是迭代。有些本地 DNS 也支持向上一级发起递归(如通过 forwarding 配置),但经典模型就是上面的两级结构。`,
    },
    {
      id: 'cache',
      title: '缓存与 TTL',
      body: `DNS 解析的快慢几乎由缓存决定。一条查询会依次检查:

1. **浏览器 DNS 缓存**(进程内,时间短);
2. **操作系统缓存**(含 hosts 文件 —— hosts 优先级最高,直接改写结果);
3. **本地 DNS 服务器缓存** —— 大部分请求在这里命中,不会走到根/TLD/权威。

每条记录都带 **TTL**(生存时间,秒)。TTL 是权威服务器设定的缓存有效期:TTL 长,缓存命中多、解析快,但记录变更生效慢;TTL 短,变更快速生效,但查询压力大。计划迁移服务器前,先把 TTL 调小,是运维的常见操作。

浏览器「秒开」第二个页面,很大程度上就是命中了本机与本地 DNS 的缓存。`,
    },
    {
      id: 'failures',
      title: '记录类型与常见异常',
      body: `常见 DNS 记录类型:

- **A**:域名 → IPv4;**AAAA**:域名 → IPv6;
- **CNAME**:域名 → 另一个域名(别名链,最终要落到 A/AAAA);
- **NS**:指定域名的权威服务器;**MX**:邮件交换记录。

常见异常:

- **NXDOMAIN**:域名根本不存在(权威服务器明确回答);注意「域名存在但没有对应 A 记录」会返回空回答而非 NXDOMAIN;
- **SERVFAIL**:上游超时、DNSSEC 校验失败等导致解析失败;
- **超时**:网络不通或服务器无响应,客户端通常会在多个超时窗口内重试 —— 这就是「DNS 慢导致页面白屏几秒」的来源。排查顺序:hosts → 本机缓存 → 本地 DNS → 权威服务器。`,
    },
  ],
}

export default tutorial
