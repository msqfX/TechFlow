/**
 * MySQL 查询执行过程模型(InnoDB 内部;纯函数,可测试)。
 * 三种查询形态:主键直达 / 二级索引回表 / 覆盖索引免回表。
 * Buffer Pool 页命中/未命中分别计数。
 */

export type QueryKind = 'pk' | 'secondary' | 'covering'

export interface QueryStep {
  id: string
  label: string
  detail: string
  /** 访问的树:'clustered' | 'secondary' | null(纯内存步骤) */
  tree: 'clustered' | 'secondary' | null
  /** 高亮的树节点路径 */
  path: string[]
  /** Buffer Pool 命中? */
  poolHit: boolean | null
}

export interface QueryExecState {
  kind: QueryKind
  steps: QueryStep[]
  activeStep: number
  /** Buffer Pool 已缓存页(命中) */
  poolPages: string[]
  poolHits: number
  diskReads: number
  /** 回表次数 */
  backToTable: number
  /** 扫描/返回 */
  rowsExamined: number
  rowsReturned: number
  done: boolean
  log: string[]
}

export interface QueryPreset {
  sql: string
  kind: QueryKind
  explainType: string
  label: string
}

export const QUERY_PRESETS: Record<QueryKind, QueryPreset> = {
  pk: {
    sql: 'SELECT * FROM users WHERE id = 15',
    kind: 'pk',
    explainType: 'const(主键)',
    label: '主键查询:一步直达',
  },
  secondary: {
    sql: "SELECT * FROM users WHERE name = 'Alice'",
    kind: 'secondary',
    explainType: 'ref(二级索引)',
    label: '二级索引:需要回表',
  },
  covering: {
    sql: "SELECT id, name FROM users WHERE name = 'Alice'",
    kind: 'covering',
    explainType: 'ref + Using index(覆盖)',
    label: '覆盖索引:免回表',
  },
}

let qeSeq = 0
function makeStep(label: string, detail: string, tree: 'clustered' | 'secondary' | null, path: string[], poolHit: boolean | null): QueryStep {
  qeSeq += 1
  return { id: `qe-${qeSeq}`, label, detail, tree, path, poolHit }
}

/** 每种查询的步骤脚本(树路径:根 R → 内部 I → 叶 L) */
function stepsFor(kind: QueryKind, poolWarm: boolean): QueryStep[] {
  const hit = poolWarm
  const poolTag = (tree: string, page: string) => `页 ${tree}/${page} ${hit ? '已在 Buffer Pool(内存命中)' : '不在 Buffer Pool → 磁盘读取'}`
  switch (kind) {
    case 'pk':
      return [
        makeStep('执行器', '按计划调用 InnoDB:主键定位 id=15', null, [], null),
        makeStep('聚簇索引下降', '根页 → 内部页 → 叶页(3 层 = 3 次页访问)', 'clustered', ['R', 'I1', 'L15'], null),
        makeStep('Buffer Pool', poolTag('clustered', 'leaf-15'), 'clustered', ['L15'], hit),
        makeStep('返回整行', '叶节点直接存整行 —— 主键查询一次树遍历完成', 'clustered', ['L15'], null),
      ]
    case 'secondary':
      return [
        makeStep('执行器', '调用 InnoDB:按二级索引 idx_name 定位 name=Alice', null, [], null),
        makeStep('二级索引下降', 'idx_name 根 → 叶(存的是 name + 主键 id=15,不是整行!)', 'secondary', ['R2', 'L2a'], null),
        makeStep('Buffer Pool', poolTag('secondary', 'leaf-2a'), 'secondary', ['L2a'], hit),
        makeStep('回表(第一次树遍历)', '拿主键 id=15 → 回聚簇索引再走一遍取整行', 'clustered', ['R', 'I1', 'L15'], null),
        makeStep('Buffer Pool', poolTag('clustered', 'leaf-15'), 'clustered', ['L15'], hit),
        makeStep('返回整行', '两次树遍历 —— 结果集越大,回表代价线性放大', 'clustered', ['L15'], null),
      ]
    case 'covering':
      return [
        makeStep('执行器', '调用 InnoDB:idx_name 叶子已含 name + id,无需回表', null, [], null),
        makeStep('二级索引下降', 'idx_name 根 → 叶(要的列全在索引里)', 'secondary', ['R2', 'L2a'], null),
        makeStep('Buffer Pool', poolTag('secondary', 'leaf-2a'), 'secondary', ['L2a'], hit),
        makeStep('Using index 直接返回', '覆盖索引:只查一棵树 —— EXPLAIN Extra = Using index', 'secondary', ['L2a'], null),
      ]
    default:
      return []
  }
}

export function createQueryState(kind: QueryKind, poolWarm: boolean): QueryExecState {
  const steps = stepsFor(kind, poolWarm)
  const diskReads = steps.filter(st => st.poolHit === false).length
  return {
    kind,
    steps,
    activeStep: 0,
    poolPages: poolWarm ? ['clustered/leaf-15', 'secondary/leaf-2a'] : [],
    poolHits: steps.filter(st => st.poolHit === true).length,
    diskReads,
    backToTable: kind === 'secondary' ? 1 : 0,
    rowsExamined: kind === 'pk' ? 1 : kind === 'covering' ? 1 : 2,
    rowsReturned: 1,
    done: false,
    log: [
      QUERY_PRESETS[kind].sql,
      `执行形态:${QUERY_PRESETS[kind].label}${poolWarm ? ';相关数据页已在 Buffer Pool' : ';冷查询,首次访问需磁盘 IO'}`,
    ],
  }
}

/** 推进一步 */
export function advanceQuery(s: QueryExecState): QueryExecState {
  if (s.activeStep >= s.steps.length) return { ...s, done: true }
  const activeStep = s.activeStep + 1
  const done = activeStep >= s.steps.length
  const step = s.steps[Math.min(s.activeStep, s.steps.length - 1)]!
  let poolPages = [...s.poolPages]
  let poolHits = s.poolHits
  let diskReads = s.diskReads
  if (step.poolHit !== null) {
    const key = step.path.includes('L15') ? 'clustered/leaf-15' : 'secondary/leaf-2a'
    if (poolPages.includes(key)) poolHits += 1
    else {
      poolPages = [...poolPages, key]
      diskReads += 1
    }
  }
  return {
    ...s,
    activeStep,
    poolPages,
    poolHits,
    diskReads,
    done: done || activeStep >= s.steps.length,
    log: [...s.log, step.label],
  }
}

/** 三种形态的代价对照(教学) */
export function costCompare(kind: QueryKind): { treeWalks: number; backToTable: number; note: string } {
  switch (kind) {
    case 'pk':
      return { treeWalks: 1, backToTable: 0, note: '主键查询:一次树遍历直达整行' }
    case 'secondary':
      return { treeWalks: 2, backToTable: 1, note: '二级索引:索引树 + 回表聚簇树 = 两棵树' }
    case 'covering':
      return { treeWalks: 1, backToTable: 0, note: '覆盖索引:一棵树搞定,免回表' }
  }
}
