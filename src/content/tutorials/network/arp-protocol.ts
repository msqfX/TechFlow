import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-arp-protocol',
    slug: 'arp-protocol',
    title: 'ARP 协议',
    description:
      '跟随一次 ARP 请求与应答,理解 IP 地址如何解析成 MAC 地址:广播请求、单播应答、缓存表与老化,以及 ARP 欺骗的原理。',
    category: 'network',
    difficulty: 'beginner',
    duration: 15,
    tags: ['ARP', 'MAC 地址', '广播', '缓存', 'ARP 欺骗'],
    prerequisites: ['ip-address', 'switch-working'],
    relatedTutorials: ['switch-working', 'ip-address', 'tcp-handshake'],
    sceneType: 'arp',
    featured: false,
    order: 6,
  },
  objectives: [
    '理解二层用 MAC 寻址、三层用 IP 寻址,ARP 是两者之间的桥梁',
    '掌握 ARP 请求(广播)与应答(单播)的完整流程',
    '理解 ARP 缓存的写入规则(请求方与被请求方都会学习)与老化时间',
    '认识 ARP 欺骗的原理与防护手段',
  ],
  chapters: [
    {
      id: 'why',
      title: '为什么需要 ARP',
      body: `网络通信里有个关键的不对称:**IP 地址负责全局路由,MAC 地址负责本地送达**。

当 PC1 要给同网段的 PC2(192.168.1.2)发一个 IP 包时,它拿着 IP 没法直接把包交给交换机 —— 以太网帧的头部的字段是**目的 MAC**。所以发包前必须先回答一个问题:

**「192.168.1.2 这台设备的 MAC 地址是多少?」**

ARP(Address Resolution Protocol)就是回答这个问题的协议。跨网段的通信同样离不开 ARP:目标是网关的 IP,解析出网关的 MAC,把帧送给网关,再由网关三层接力。`,
    },
    {
      id: 'flow',
      title: 'ARP 请求与应答的完整流程',
      body: `以 PC1(192.168.1.1,MAC A1)解析 PC2(192.168.1.2,MAC A2)为例:

**① 查缓存**:PC1 先查本地 ARP 缓存,有 PC2 的记录就直接用(省一次往返);没有才发请求。

**② 广播请求**:PC1 发出 ARP 请求,**目的 MAC = FF:FF:FF:FF:FF:FF**(链路层广播),内容是「Who has 192.168.1.2? Tell 192.168.1.1」。交换机把广播帧泛洪到所有端口 —— 网段内每台设备都收到。

**③ 目标回应**:所有设备都收到请求,但只有 **IP 匹配的 PC2** 处理它;其他设备发现问的不是自己,直接丢弃。PC2 发回 ARP **应答**(单播,目的 MAC = A1):「192.168.1.2 is-at A2」。

**④ 双方写缓存**:PC1 收到应答,把 (192.168.1.2 → A2) 写入缓存;**PC2 在收到请求的当下也把 PC1 写进了缓存**(请求里有完整的源 IP 和源 MAC)—— 下一次 PC2 主动找 PC1 时不用再广播。`,
    },
    {
      id: 'cache',
      title: 'ARP 缓存与老化',
      body: `ARP 缓存表的每条记录 = **IP ↔ MAC ↔ 端口/接口**,带**老化时间**(Linux 默认约 60 秒未使用即进入 stale,Windows 通常 2 分钟以上)。

- 老化机制保证「设备换了网卡/IP 后旧记录不会永远生效」;
- 缓存未命中就广播请求,所以 ARP 流量与「新连接的频率」正相关;
- **免费 ARP(Gratuitous ARP)**:设备上线或 IP 变更时主动广播「我是 192.168.1.2,我的 MAC 是 A2」,让全网刷新缓存 —— 高可用主备切换(如 keepalived VIP 漂移)依赖它。

查看本机缓存:Windows 是 \`arp -a\`,Linux/Mac 同名命令。`,
    },
    {
      id: 'spoofing',
      title: 'ARP 欺骗与防护',
      body: `ARP 的设计有一个先天弱点:**它完全信任收到的应答**,没有任何认证。

**ARP 欺骗(ARP Spoofing)**:攻击者在网段内持续广播伪造应答,例如宣称「192.168.1.1(网关)的 MAC 是我」—— 其他设备的缓存被污染,发给网关的流量全部先经过攻击者,实现**中间人窃听/篡改**。

常见防护:

- **交换机动态 ARP 检测(DAI)**:校验 ARP 报文与 DHCP Snooping 绑定表是否一致,不一致直接丢弃;
- **静态 ARP 绑定**:关键网关手工绑定(管理成本高);
- **加密**:HTTPS/VPN 让中间人即使截获也看不懂内容 —— 这也是全站 HTTPS 的价值之一。`,
    },
  ],
}

export default tutorial
