# TechFlow - 用动画理解技术

计算机原理可视化交互学习平台。纯前端项目:把 CPU 指令执行、网络数据传输、DNS 解析、TCP 握手、Tomcat 请求处理、JVM 内存管理这些抽象原理,变成可观察、可操作、可实验的动态场景。

## 技术栈

| 模块 | 技术 |
|---|---|
| 框架 | Vue 3 + TypeScript(严格模式) |
| 构建 | Vite 8 |
| 路由 / 状态 | Vue Router 5 / Pinia |
| 动画引擎 | 自研 `src/engine`(GSAP + SVG,Canvas 按需) |
| SEO | 构建时预渲染(SSR bundle + renderToString) |
| 部署 | Docker + Nginx |

## 快速开始

```bash
npm install
npm run dev        # 开发服务器
npm run typecheck  # 类型检查
npm run test       # 单元测试(vitest)
npm run build      # 生产构建(SPA)
npm run build-all  # 生产构建 + SSR bundle + 预渲染 + sitemap/robots
npm run preview    # 本地预览 dist
```

> 注意:`vite preview` 对所有未知路径回退根页面,不能体现「优先返回预渲染页」的行为;本地想完整验证 SEO 行为请用 `python3 -m http.server -d dist`(带尾斜杠访问)或直接 `docker compose up --build`(nginx 会无重定向命中 `dist/<route>/index.html`)。

### 一键 Docker 部署

```bash
docker compose up -d --build
# 访问 http://localhost:8080
```

生产环境请设置站点地址(用于 canonical/sitemap/robots):

```bash
SITE_URL=https://your-domain.com node scripts/prerender.ts
# 或在 Dockerfile 中传入
```

## 项目结构

```text
src/
├── engine/            # 可复用动画引擎(docs §5)
│   ├── core/          # Scene(步骤状态机)、StateManager、TimelineManager、EventBus、SceneManager
│   ├── player/        # Player、PlayerState(播放器 UI 状态 reducer)
│   ├── components/    # NetworkNode、Connection、Packet、Label、Tooltip
│   ├── renderers/     # SVGRenderer、CanvasRenderer
│   └── types/         # scene/step/animation 类型
├── tutorials/         # 教程场景(sceneType → 动态加载;registry.ts 注册)
│   └── <domain>/<slug>/
│       ├── model.ts   # 纯函数模拟逻辑(可单测)
│       └── scene.ts   # 可视化场景
├── content/           # 内容层:分类 JSON + 教程元数据/正文(TS 模块)
├── laboratory/        # 计算器类实验(IP / 子网)
├── pages/             # 页面(home/tutorials/laboratory/learning-paths/about/dev)
├── components/        # layout / navigation / tutorial / player / common
├── composables/       # usePageMeta、usePlayerState
├── stores/            # Pinia(ui:主题)
└── styles/            # 设计令牌(tokens)+ 引擎样式(engine.css)
```

## 架构要点

### 动画引擎与步骤状态恢复(docs §5.5)

每篇教程的步骤转移是**纯函数**:`state → action → newState`。引擎从初始状态逐步折叠并缓存全部中间状态,因此:

- **任意步骤跳转/上一步/重置**都是按索引直接重建场景状态(`goToStep`),不依赖连续重放动画;
- **实时信息面板**的数据始终来自真实模拟器状态,不是写死的展示值;
- 场景销毁时释放 GSAP 时间线、事件监听与 DOM(页面切换自动触发)。

### 内容与场景解耦(docs §8)

- 教程内容(`src/content/tutorials/**`)只含元数据、教学目标与图文正文;
- 场景代码(`src/tutorials/**`)通过 `sceneType` 在 `registry.ts` 动态加载,不进入首屏包;
- 分类与教程 id 不允许冲突(`tests/content.spec.ts` 校验)。

### 三种学习模式(docs §4.2)

- **教学模式**:步骤播放器(播放/暂停/单步/跳转/倍速/重置)+ 每步原理解释;
- **实验模式**:场景通过 `getActions()/performAction()` 暴露真实可操作项(修改 IP、切换协议、慢业务等);
- **挑战模式**:注入故障(SYN 丢失、ACK 丢失、线程池耗尽、DNS 超时),观察系统如何应对。

### SEO(docs §11)

- `npm run build-all` 对全部 36 个路由做构建时预渲染,每页有独立的 title / description / canonical / Open Graph / JSON-LD(TechArticle + BreadcrumbList);
- `dist/sitemap.xml` 与 `dist/robots.txt` 随预渲染生成;
- Nginx `try_files $uri $uri/index.html /index.html`:优先返回真实预渲染页面,未预渲染路径回退 SPA;
- 图文正文即使不播放动画也能读懂核心知识。

## 教学简化声明

所有动画均为**教学模拟模型**,用于建立正确的思维框架,未复现真实实现的全部细节:

- JVM GC:简化的可达性分析 + 分代搬运,不模拟并发标记/写屏障(G1/ZGC 等);
- CPU:顺序单发射模型,不含流水线、乱序执行与分支预测;
- Tomcat:组件结构与线程池模型忠实,但不复现完整的 Poller 实现;
- DNS/交换机:协议状态机与转发逻辑忠实,报文格式做了简化。

每篇教程页面内都有对应的声明,生产实践请以官方文档为准。

## 测试

```bash
npm run test
```

覆盖(docs §16.4 重点):

- IP 地址/子网计算(含 /31、/32 特殊规则);
- TCP 握手/挥手状态机(含 SYN 丢失重传);
- 交换机 MAC 学习/泛洪/广播;
- JVM 对象分配与 GC(可达性、晋升);
- 引擎步骤跳转与场景销毁;
- 内容完整性(slug 冲突、引用存在性、占位内容)。

> 端到端冒烟(`tests/e2e/`):43 个路由逐页断言渲染标记、场景挂载与全站文字重叠扫描(部署前一键回归)。首次使用需安装浏览器:`npx playwright install chromium`。

## 目录约定

- `/dev/engine` 是动画引擎验收页(未列入导航);
- 主题切换持久化到 localStorage,默认亮色;
- 全站无后端、无账号、无数据采集,可用任意静态服务器部署。
