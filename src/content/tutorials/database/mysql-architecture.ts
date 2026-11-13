import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-mysql-architecture',
    slug: 'mysql-architecture',
    title: 'MySQL 架构',
    description:
      '跟随一条 SQL 穿过 MySQL:连接器、分析器、优化器、执行器与 InnoDB 存储引擎,理解每层做什么、慢查询卡在哪一层,以及 EXPLAIN 在看什么。',
    category: 'database',
    difficulty: 'intermediate',
    duration: 18,
    tags: ['MySQL', '架构', 'SQL 执行', '优化器', 'InnoDB', '慢查询'],
    prerequisites: ['tomcat-internals'],
    relatedTutorials: ['btree-index', 'http-request-flow', 'tomcat-internals'],
    sceneType: 'mysql-architecture',
    featured: false,
    order: 23,
  },
  objectives: [
    '掌握一条 SQL 的完整旅程:连接器 → 分析器 → 优化器 → 执行器 → 存储引擎',
    '理解 Server 层与存储引擎层的职责分界,以及插件式引擎的含义',
    '理解优化器的角色:选择索引与连接顺序,EXPLAIN 就是在看它的决策',
    '能定位慢查询的层级:无索引全表扫描、锁等待、连接数打满各有不同症状',
  ],
  chapters: [
    {
      id: 'journey',
      title: '一条 SQL 的完整旅程',
      body: `以 \`SELECT * FROM users WHERE id = 15\` 为例(MySQL 8.0):

1. **连接器**:TCP 握手、认证账号密码、权限加载;长短连接管理(应用方用连接池,如 JDBC 连接池、HikariCP);
2. **分析器**:词法/语法分析 —— 识别这是 SELECT、表名对不对、语法对不对(报错 You have an error in your SQL syntax 就在这一层);
3. **优化器**:决定**怎么执行** —— 用哪个索引、多表 join 的顺序、估算扫描行数(cost 模型);\`EXPLAIN\` 展示的就是它的决策;
4. **执行器**:校验表权限,按优化器的计划**调用存储引擎接口**逐行取数;
5. **存储引擎(InnoDB)**:真正读写数据页的地方 —— 索引 B+Tree、Buffer Pool、redo/undo log 都在这一层。

注:查询缓存(命中直接返回)在 **8.0 已整体移除** —— 写多读少场景失效太频繁,弊大于利。`,
    },
    {
      id: 'layers',
      title: 'Server 层与存储引擎层',
      body: `MySQL 架构分两层:

**Server 层**(所有引擎共享):连接器、分析器、优化器、执行器,以及内置函数、跨引擎功能(如 binlog);

**存储引擎层**(插件式):InnoDB、MyISAM、Memory…… 表级指定。它负责索引结构、锁、事务(MVCC)、redo/undo、Buffer Pool。

InnoDB 成为默认引擎的原因:支持**事务**(ACID)、**行级锁**、**崩溃恢复**(redo log)。MyISAM 只支持表锁、无事务 —— 如今仅存于历史项目。

对应用工程师的启示:SQL 语法在 Server 层,性能在引擎层 —— 「为什么走没走索引」要看引擎层的数据结构(B+Tree,见本站 B+Tree 教程)。`,
    },
    {
      id: 'optimizer',
      title: '优化器:MySQL 的「大脑」',
      body: `同一条 SQL 可以有多种执行方案:走索引 A 还是 B、全表扫还是范围扫、join 时谁做驱动表。**优化器基于成本模型(Cost Model)估算每个方案的代价**(扫描行数 × IO/CPU 权重),选它认为最便宜的。

估算的依据是**统计信息**(索引基数 cardinality、数据分布)—— 统计信息不准时优化器会「选错索引」,这是 DBA 常见处理场景(ANALYZE TABLE 重新采样、FORCE INDEX 干预)。

\`EXPLAIN\` 是观察优化器决策的窗口:key 看用了哪个索引、rows 看预估扫描行数、type 看 access type(const/ref/range/index/ALL)—— **ALL = 全表扫描**,通常是慢查询的头号嫌疑。`,
    },
    {
      id: 'slow-query',
      title: '慢查询排查:按层级定位',
      body: `不同症状对应不同层:

- **执行器层慢**:type=ALL 全表扫描(没走索引/索引失效 —— 隐式类型转换、函数包裹列)、rows 巨大 → 建索引/改写 SQL;
- **引擎层慢**:Buffer Pool 命中率低(冷查询大表)、锁等待(innodb_lock_wait_timeout);
- **Server 层慢**:连接数打满(max_connections,症状是报错 too many connections)、单条 SQL 语法巨复杂;
- **网络/应用层慢**:连接池耗尽(对照 Tomcat 教程的线程池)、往返次数太多(应批量)。

排查工具链:慢日志(slow_query_log)抓疑似 → \`EXPLAIN\` 看计划 → 建索引/改写。本站场景可切换「有索引/无索引」对比执行路径与扫描行数的差异。`,
    },
  ],
}

export default tutorial
