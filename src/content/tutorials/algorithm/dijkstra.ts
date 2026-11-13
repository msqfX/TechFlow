import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-dijkstra',
    slug: 'dijkstra',
    title: 'Dijkstra 最短路径',
    description:
      '逐帧观察 Dijkstra 的贪心推进:优先队列取最近节点、松弛邻居、距离表更新 —— BFS 的带权版,理解为什么边权非负是前提。',
    category: 'algorithm',
    difficulty: 'intermediate',
    duration: 16,
    tags: ['Dijkstra', '最短路径', '贪心', '优先队列', '松弛'],
    prerequisites: ['bfs-dfs'],
    relatedTutorials: ['bfs-dfs', 'stack-queue', 'linked-list'],
    sceneType: 'dijkstra',
    featured: false,
    order: 25,
  },
  objectives: [
    '掌握松弛(relaxation)操作:dist[v] > dist[u] + w(u,v) 时更新',
    '理解贪心策略:每轮取「当前距离最小」的未定节点,确定后不再改变',
    '理解为什么负权边会破坏 Dijkstra 的正确性(以及 Bellman-Ford 的定位)',
    '掌握优先队列实现下的复杂度 O((V+E) log V) 及工程落点(导航/路由/图数据库)',
  ],
  chapters: [
    {
      id: 'idea',
      title: '从 BFS 到 Dijkstra:边有了权重',
      body: `BFS 解决无权图最短路径(跳数最少)。现实中边有代价:路由的延迟、地图的公里数、网络跳数的成本 —— BFS 的「先到 = 最短」失效,因为**跳数少的路径可能总代价更高**。

Dijkstra 的改良:**用优先队列替换普通队列** —— 每轮取「当前累计距离最小」的节点。它的贪心逻辑有一个关键洞察:**如果所有边权非负,当前距离最小的未定节点,其距离已经不可能再被任何路径改进**(任何绕路只会加更多非负权重)→ 它的距离就此**敲定**。`,
    },
    {
      id: 'relax',
      title: '松弛:唯一的更新动作',
      body: `算法只有一个核心操作 —— **松弛(relaxation)**:

当通过节点 u 可能改进邻居 v 时(dist[v] > dist[u] + w(u,v)),更新 dist[v] = dist[u] + w(u,v),并记录 v 的前驱是 u(终点回溯前驱即得路径)。

流程:起点 dist=0 入优先队列 → 循环{取出距离最小的未确定节点 → 标记确定 → 松弛其所有邻居}→ 队列空结束。距离表 + 前驱表就是全部状态 —— 动画里每个节点的 dist 变化一目了然。`,
    },
    {
      id: 'negative',
      title: '为什么负权边是毒药',
      body: `贪心的前提是「绕路只会更贵」。负权边打破它:一条先贵后负的路径,总代价可能低于当前最小者 —— 而 Dijkstra 在取最小节点时就**敲定了它的距离**,不再回头看。

对策:**Bellman-Ford**(逐轮松弛所有边,V 轮内收敛,O(V·E),还能检测负环);含负边但无负环的**有向无环图**则按拓扑序松弛即可。现实中的图(延迟/距离/价格)极少有负权 —— 所以 Dijkstra 是默认选择。`,
    },
    {
      id: 'complexity',
      title: '复杂度与工程落点',
      body: `优先队列(二叉堆)实现:**O((V+E) log V)** —— 每条边可能触发一次松弛,每次堆操作 log 级。

- **导航/地图**(里程/时间加权):Google Maps、高德的核心之一;
- **网络路由**(OSPF 协议按链路开销算最短路径树);
- **图数据库**的最短路径查询;
- 变体:A* 用启发函数加速(目标导向的 Dijkstra)。

一句话:Dijkstra 是「带权版的 BFS」—— 容器从队列换成优先队列,贪心 + 松弛,承接《BFS 与 DFS》的框架。`,
    },
  ],
}

export default tutorial
