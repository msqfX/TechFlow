import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-bfs-dfs',
    slug: 'bfs-dfs',
    title: 'BFS 与 DFS',
    description:
      '在同一个图上分别跑广度优先与深度优先:队列 vs 栈如何决定遍历顺序,BFS 最短路径与 DFS 回溯的应用场景。',
    category: 'algorithm',
    difficulty: 'intermediate',
    duration: 14,
    tags: ['BFS', 'DFS', '图遍历', '队列', '栈'],
    prerequisites: ['stack-queue'],
    relatedTutorials: ['stack-queue', 'bst', 'linked-list'],
    sceneType: 'bfs-dfs',
    featured: false,
    order: 23,
  },
  objectives: [
    '掌握 BFS(队列)与 DFS(栈/递归)的遍历框架与访问顺序差异',
    '理解 BFS 按层扩散 → 无权图最短路径;DFS 一条路走到底 → 回溯',
    '理解两者的空间复杂度差异(O(宽度) vs O(深度))',
    '能把实际问题映射到正确的遍历:最短步数/层序 vs 路径枚举/拓扑/连通性',
  ],
  chapters: [
    {
      id: 'framework',
      title: '同一个框架,只差一个容器',
      body: `图遍历 = 「访问一个节点 → 把它的邻居排进 **待访问容器** → 从容器取出下一个」—— BFS 和 DFS **代码框架完全相同**,唯一区别是容器:

- **BFS(广度优先)用队列(FIFO)**:先访问的节点的邻居先被处理 → **按层扩散**;
- **DFS(深度优先)用栈(LIFO)**:最新发现的邻居先被处理 → **一条路走到底再回溯**(递归写法就是隐式栈)。

共享细节:用 **visited 集合**防环(图有回路,不记会死循环);每个节点入容器时标记 visited(而不是出容器时,防重复入队)。`,
    },
    {
      id: 'bfs',
      title: 'BFS:按层扩散与最短路径',
      body: `BFS 从起点出发,**先访问所有距离 1 的节点,再访问距离 2 的……** —— 按到起点的跳数分层推进。

核心性质:**在无权图中,BFS 第一次到达某节点时,走过的路径就是最短路径**(跳数最少)。这就是它的招牌应用:

- 无权图最短路径(社交关系里的「几度人脉」);
- 层序遍历(树/图的分层处理);
- 多源扩散( simultaneously 从多个起点 BFS,如腐烂橘子、01 矩阵距离)。

代价:队列里可能同时装着**一整层**的节点 → 空间 O(宽度),宽图上很吃内存。`,
    },
    {
      id: 'dfs',
      title: 'DFS:一条路走到底,撞墙回溯',
      body: `DFS 沿着一条路径**尽可能深**地走,走不通(无未访问邻居)就**回溯**到上一个岔路口换条路。

- 空间 O(深度):栈里只存当前路径 —— 深图上比 BFS 省得多;
- 擅长:**路径存在性/枚举所有路径**、连通分量、环检测、拓扑排序(有向无环图)、回溯类问题(全排列/N 皇后)。

注意:DFS 找到的路径**不保证最短** —— 它第一条钻通的路可能绕远。要最短,请 BFS(或带权图用 Dijkstra)。`,
    },
    {
      id: 'choose',
      title: '怎么选:问题形状决定容器',
      body: `| 问题 | 用哪个 |
|---|---|
| 无权图最短路径 / 最少步数 | **BFS** |
| 层级/按层处理 | **BFS** |
| 枚举所有路径 / 排列组合 | **DFS(回溯)** |
| 连通性 / 环检测 / 拓扑排序 | 两者皆可(DFS 更常见) |
| 深度极大、怕内存爆 | **DFS**(迭代加深可兼得) |

一句口诀:**问「最近」用队列,问「有没有/有哪些」用栈**。本站场景用同一个 8 节点图分别演示,访问顺序的差异一目了然 —— 右侧面板实时展示队列/栈的内容变化。`,
    },
  ],
}

export default tutorial
