import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-mysql-query-execution',
    slug: 'mysql-query-execution',
    title: 'MySQL 查询执行过程',
    description:
      '深入 InnoDB 内部:主键查询一步直达、二级索引查询要回表、覆盖索引免回表,Buffer Pool 页命中与磁盘读 —— 三种查询的代价差异逐帧呈现。',
    category: 'database',
    difficulty: 'advanced',
    duration: 18,
    tags: ['InnoDB', '回表', '覆盖索引', 'Buffer Pool', '聚簇索引'],
    prerequisites: ['btree-index', 'mysql-architecture'],
    relatedTutorials: ['btree-index', 'mysql-architecture', 'array'],
    sceneType: 'mysql-query',
    featured: false,
    order: 24,
  },
  objectives: [
    '理解聚簇索引:叶子存整行数据,主键查询一步直达',
    '理解二级索引查询的「回表」:先查二级索引拿主键,再回聚簇索引取整行',
    '掌握覆盖索引:查询列都在索引里 → 免回表,性能翻倍的原理',
    '理解 Buffer Pool:页命中免磁盘 IO,以及冷查询与热查询的差别',
  ],
  chapters: [
    {
      id: 'clustered',
      title: '聚簇索引:数据即索引',
      body: `InnoDB 的表本身就是一棵**聚簇索引 B+Tree**:非叶子节点存主键(路由),**叶子节点存完整的行数据**。

- **主键查询**(WHERE id = 15):在聚簇 B+Tree 上从根走到叶,**一次树遍历直接拿到整行** —— 最快的查询形态;
- 没有主键?InnoDB 会用唯一键或生成隐藏的 row_id 充当聚簇键。

对照《B+Tree 索引》:树高决定 IO 次数,千万数据约 3 层 —— 主键查询理论上最多 3 次页访问。`,
    },
    {
      id: 'back-to-table',
      title: '二级索引与回表',
      body: `二级索引(如 INDEX(age))是**另一棵 B+Tree**:叶子存的是「**索引列值 + 主键**」,不是整行。

查询 \`SELECT * FROM users WHERE age = 26\`:

1. 在 age 的 B+Tree 上定位到 age=26 的叶子 → 拿到 **主键 id=15**;
2. **回表**:拿着 id=15 再到聚簇 B+Tree 走一遍,取整行。

两次树遍历。如果命中的不止一行,每一行都要回一次表 —— 代价随结果集线性放大。这就是「SELECT * 是性能刺客」的原因之一:取的列越多,回表越不划算。`,
    },
    {
      id: 'covering',
      title: '覆盖索引:免回表的性能倍增器',
      body: `如果查询要的列**全部都在二级索引里**,就根本不需要回表:

"SELECT id, name FROM users WHERE name = 'Alice'"(索引 INDEX(name) — InnoDB 二级索引叶子自动带主键)

在 name 的 B+Tree 上拿到的叶子已经包含 id 和 name → 直接返回 —— **只查一棵树**。这就是**覆盖索引(Covering Index)**:EXPLAIN 的 Extra 列出现 **Using index** 就是它。

组合拳:把高频查询的列做成联合索引(如 INDEX(city, age)),让常用查询都能被索引覆盖 —— 这是 SQL 优化里性价比最高的手段之一。`,
    },
    {
      id: 'buffer-pool',
      title: 'Buffer Pool:内存与磁盘的分水岭',
      body: `InnoDB 不会每次都打磁盘:**数据页**(16KB)读入内存中的 **Buffer Pool**(默认 128MB 起,生产通常配到机器内存的 60~70%)后常驻:

- **页命中**:数据页已在 Buffer Pool → 纯内存操作,微秒级;
- **未命中**:从磁盘读入整页 → 毫秒级,差百倍;
- 满了按 **LRU 变体**淘汰(冷数据先走,预防全表扫描把热数据冲掉)。

所以「热查询」(反复访问的热点数据)极快,「冷查询」(首次访问大表)要付磁盘 IO —— 这也是为什么预热、预分配容量是性能工程的标准动作。`,
    },
  ],
}

export default tutorial
