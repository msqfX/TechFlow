import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-cdn-working',
    slug: 'cdn-working',
    title: 'CDN 工作原理',
    description:
      '跟随一次静态资源请求看 CDN 如何工作:DNS CNAME 委托、GSLB 就近调度、边缘缓存命中与回源,理解命中率为什么是 CDN 的生命线。',
    category: 'infrastructure',
    difficulty: 'intermediate',
    duration: 18,
    tags: ['CDN', 'CNAME', 'GSLB', '边缘节点', '缓存命中'],
    prerequisites: ['dns-resolution', 'http-request-flow'],
    relatedTutorials: ['dns-resolution', 'http-request-flow', 'tls-handshake'],
    sceneType: 'cdn',
    featured: false,
    order: 8,
  },
  objectives: [
    '理解 CDN 的核心动机:把内容搬到离用户近的边缘节点',
    '掌握 DNS CNAME 委托 + GSLB 调度的完整解析链',
    '区分边缘命中(直接返回)与回源(边缘 → 源站)两条路径',
    '理解缓存 TTL、命中率、预热与刷新的关系',
  ],
  chapters: [
    {
      id: 'why',
      title: 'CDN 解决什么问题',
      body: `没有 CDN 时,广州的用户访问部署在北京的源站:物理距离决定了 RTT 下限(约 30-40ms),跨国场景更糟;所有流量集中打向源站,热门内容会把源站带宽打满。

**CDN(Content Delivery Network)** 的思路很直接:把内容的副本提前放到全球各地的**边缘节点**(离用户几公里~几十公里的机房),用户就近取。收益:

- **延迟大幅下降**:就近命中通常 <10ms;
- **源站卸载**:90%+ 的请求被边缘消化,源站只处理回源;
- **抗突发**:热点内容(新品发布、爆点文章)由边缘扛住流量洪峰。`,
    },
    {
      id: 'resolution',
      title: 'DNS 怎么把流量导向边缘节点',
      body: `接入 CDN 后,源站把域名改成 **CNAME 委托**:权威 DNS 收到 static.example.com 的查询,不再直接给 IP,而是返回「static.example.com 是 cdn.example.com.cn 的别名」。

后续解析进入 **CDN 的调度系统(GSLB)**:

1. 本地 DNS 问 CDN 的权威服务器:「cdn.example.com.cn 是什么 IP?」
2. GSLB 看**发起查询的本地 DNS 来源**(大致代表用户位置)、运营商、节点负载与健康度,返回**就近边缘节点**的 IP;
3. 用户拿到广州节点的 IP,请求直达边缘。

这就是「DNS 调度」—— 精度受限于本地 DNS 的位置(所以有 HTTPDNS/EDNS Client Subnet 这类增强方案),但实现简单、兼容性最好。`,
    },
    {
      id: 'cache',
      title: '边缘命中与回源',
      body: `边缘节点收到请求后的两条路径:

**缓存命中(HIT)**:节点上已有该资源的副本,校验 TTL 未过期 → 直接返回。响应头会带 \`X-Cache: HIT\`,耗时 <10ms。

**回源(MISS)**:节点上没有(首次请求或已过期)→ 边缘节点向**源站**取一份,返回给用户的同时**在边缘缓存**(按 Cache-Control/TTL)→ 下一个用户就是命中。

由此得出 CDN 的核心经营指标:**命中率**。提升手段包括提高 TTL、**预热**(发布前主动把资源推到各边缘)、合理设置缓存键(Query String 是否参与)等。要强制刷新某个已缓存的文件,用 CDN 的**刷新(Purge)**接口 —— 直接删边缘副本,下一次请求触发回源。`,
    },
    {
      id: 'https',
      title: 'HTTPS 与动态内容的补充说明',
      body: `两个工程细节:

- **HTTPS 站点**:TLS 握手必须发生在用户与边缘节点之间,边缘节点持有证书私钥(或使用 SNI 透传回源);证书由 CDN 厂商托管或上传自定义证书;
- **动态内容**:不可缓存的 API 请求,CDN 退化为**智能链路代理**(专线/优化路由回源),加速收益来自网络路径优化而非缓存 —— 这就是「全站加速」与「静态加速」的区别。

本站的静态资源(JS/CSS)就是典型的 CDN 化对象:带内容哈希的文件名 + 长缓存 + 发布时刷新。`,
    },
  ],
}

export default tutorial
