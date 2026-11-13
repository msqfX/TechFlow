/**
 * MySQL 架构模型:一条 SQL 的执行流水线(纯函数,可测试)。
 * 阶段:连接器 → 分析器 → 优化器 → 执行器 → 存储引擎(InnoDB)。
 * 变量:查询类型(SELECT/UPDATE)、是否走索引、预估扫描行数。
 */

export type SqlType = 'SELECT' | 'UPDATE'
export type MysqlStageId = 'connector' | 'analyzer' | 'optimizer' | 'executor' | 'innodb'

export interface MysqlStage {
  id: MysqlStageId
  title: string
  status: 'pending' | 'active' | 'done'
  note: string
}

export interface MysqlState {
  sqlType: SqlType
  indexUsed: boolean
  stages: MysqlStage[]
  scannedRows: number
  returnedRows: number
  /** UPDATE 产生的 redo/undo 写入 */
  logsWritten: string[]
  error: string | null
  log: string[]
}

export interface MysqlSceneConfig {
  sqlType: SqlType
  indexUsed: boolean
  tableRows: number
}

export const DEFAULT_CONFIG: MysqlSceneConfig = {
  sqlType: 'SELECT',
  indexUsed: true,
  tableRows: 100000,
}

export const STAGE_DEFS: Array<{ id: MysqlStageId; title: string }> = [
  { id: 'connector', title: '连接器' },
  { id: 'analyzer', title: '分析器' },
  { id: 'optimizer', title: '优化器' },
  { id: 'executor', title: '执行器' },
  { id: 'innodb', title: 'InnoDB 引擎' },
]

export function createMysqlState(cfg: MysqlSceneConfig): MysqlState {
  const scanned = cfg.indexUsed ? Math.max(1, Math.round(cfg.tableRows * 0.001)) : cfg.tableRows
  const returned = cfg.sqlType === 'SELECT' ? Math.max(1, Math.round(scanned * 0.05)) : 0
  return {
    sqlType: cfg.sqlType,
    indexUsed: cfg.indexUsed,
    stages: STAGE_DEFS.map(d => ({ id: d.id, title: d.title, status: 'pending', note: '' })),
    scannedRows: scanned,
    returnedRows: returned,
    logsWritten: [],
    error: null,
    log: [
      `SQL:${cfg.sqlType === 'SELECT' ? `SELECT * FROM users WHERE id = 15` : `UPDATE users SET age = 26 WHERE id = 15`}`,
      cfg.indexUsed ? '条件列有主键/二级索引' : '条件列无索引(将全表扫描)',
    ],
  }
}

/** 各阶段的说明(依据配置生成) */
export function stageNote(stage: MysqlStageId, cfg: MysqlSceneConfig, s: MysqlState): string {
  switch (stage) {
    case 'connector':
      return 'TCP 握手 · 认证 · 加载权限(应用用连接池复用长短连接)'
    case 'analyzer':
      return '词法/语法分析:识别 SELECT/UPDATE、表与列是否存在(语法报错在这一层)'
    case 'optimizer':
      return cfg.indexUsed
        ? `估算 cost:走主键索引,预估扫描 ~${s.scannedRows} 行(EXPLAIN 展示此决策)`
        : `估算 cost:条件列无索引 → 全表扫描(约 ${s.scannedRows} 行,type=ALL,慢查询头号嫌疑)`
    case 'executor':
      return cfg.indexUsed
        ? '校验权限 → 调用 InnoDB 接口按索引取行'
        : '校验权限 → 循环调用 InnoDB 全表逐行比对条件'
    case 'innodb':
      if (cfg.sqlType === 'UPDATE') {
        return '写 undo(旧值)→ 改 Buffer Pool 数据页 → 写 redo(新值)→ binlog 同步'
      }
      return `在 B+Tree 索引上定位数据页(Buffer Pool 命中则免磁盘 IO),返回 ${s.returnedRows} 行`
    default:
      return ''
  }
}

/** 推进到下一个阶段 */
export function advanceStage(s: MysqlState, cfg: MysqlSceneConfig): MysqlState {
  const activeIdx = s.stages.findIndex(st => st.status === 'active')
  const nextIdx = activeIdx + 1
  if (nextIdx >= s.stages.length) {
    // 最后一个阶段收尾:全部标记 done
    const stages = s.stages.map(st => ({ ...st, status: 'done' as const }))
    return { ...s, stages, log: [...s.log, 'SQL 执行完毕,结果/影响行数返回客户端'] }
  }
  const stages = s.stages.map((st, i) => ({
    ...st,
    status: i < nextIdx ? ('done' as const) : i === nextIdx ? ('active' as const) : ('pending' as const),
    note: i === nextIdx ? stageNote(st.id, cfg, s) : st.note,
  }))
  const def = STAGE_DEFS[nextIdx]!
  let logsWritten = s.logsWritten
  let log = [...s.log, `${def.title}:${stageNote(def.id, cfg, s)}`]
  if (def.id === 'innodb' && cfg.sqlType === 'UPDATE') {
    logsWritten = ['undo log(旧值,回滚用)', 'redo log(新值,崩溃恢复)', 'binlog(主从复制)']
    log = [...log, `UPDATE 额外写三份日志:${logsWritten.join('、')}`]
  }
  if (def.id === 'optimizer' && !cfg.indexUsed) {
    log = [...log, '⚠ 全表扫描:扫描行数与表大小成正比,这是慢查询最常见的形态']
  }
  return { ...s, stages, logsWritten, log }
}

/** 全部阶段完成? */
export function mysqlFinished(s: MysqlState): boolean {
  return s.stages.every(st => st.status === 'done')
}
