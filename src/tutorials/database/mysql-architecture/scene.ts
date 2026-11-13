import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  DEFAULT_CONFIG,
  STAGE_DEFS,
  advanceStage,
  createMysqlState,
  mysqlFinished,
} from './model'
import { Connection } from '@/engine/components/Connection'
import type { MysqlSceneConfig, MysqlState } from './model'

/** MySQL 架构场景:Server 层 + InnoDB 两层流水线,SQL 包自上而下流动 */

const VIEW = { width: 840, height: 620 }
const STAGE_X = 90
const STAGE_W = 300
const STAGE_H = 62
const STAGE_STEP = 76
const STAGE_Y0 = 120
const INNODB = { x: 90, y: STAGE_Y0 + 5 * STAGE_STEP, w: 300, h: 96 }
const SERVER_BOX = { x: 60, y: 84, w: 360, h: 5 * STAGE_STEP + 30 }

class MysqlArchScene extends BaseScene<MysqlState> {
  private config: MysqlSceneConfig = { ...DEFAULT_CONFIG }
  private stageBoxes: Array<{ g: SVGGElement; rect: SVGRectElement; title: SVGTextElement; note: SVGTextElement; status: SVGTextElement }> = []
  private clientNode!: NetworkNode
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private sqlPacket!: Packet
  private connLine!: Connection
  private innodbRect: SVGRectElement | null = null
  private logChips: SVGTextElement[] = []
  private scanChip: SVGTextElement | null = null

  constructor() {
    super({ id: 'mysql-architecture', viewBox: VIEW, label: 'MySQL Server 层与 InnoDB 流水线' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // Server 层框
    renderer.el('rect', { x: SERVER_BOX.x, y: SERVER_BOX.y, width: SERVER_BOX.w, height: SERVER_BOX.h, rx: 14, class: 'tf-cpu-block' }, renderer.layerBg)
    renderer.el('text', { x: SERVER_BOX.x + 16, y: SERVER_BOX.y + 24, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      'Server 层(跨引擎共享)'

    // 客户端
    this.clientNode = new NetworkNode(renderer, {
      id: 'client', x: 240, y: 46, width: 140, height: 46, label: '客户端(连接池)', glyph: 'APP',
    })
    this.connLine = new Connection(renderer, {
      id: 'conn-line', from: { x: 240, y: 69 }, to: { x: 240, y: STAGE_Y0 - 4 }, arrow: false,
    })

    // 五个阶段
    this.stageBoxes = []
    STAGE_DEFS.forEach((def, i) => {
      const y = STAGE_Y0 + i * STAGE_STEP
      const g = renderer.el('g', {}, renderer.layerNodes)
      const rect = renderer.el('rect', { x: STAGE_X, y, width: STAGE_W, height: STAGE_H, rx: 9, class: 'tf-http-stage' }, g)
      const title = renderer.el('text', { x: STAGE_X + 16, y: y + 24, class: 'tf-http-title' }, g)
      title.textContent = def.title
      const status = renderer.el('text', { x: STAGE_X + STAGE_W - 16, y: y + 24, 'text-anchor': 'end', class: 'tf-http-status' }, g)
      const note = renderer.el('text', { x: STAGE_X + 16, y: y + 46, class: 'tf-subnet-mono' }, g)
      note.textContent = '…'
      this.stageBoxes.push({ g, rect, title, note, status })
    })

    // InnoDB 层
    this.innodbRect = renderer.el('rect', { x: INNODB.x, y: INNODB.y, width: INNODB.w, height: INNODB.h, rx: 14, class: 'tf-mem-block' }, renderer.layerNodes)
    renderer.el('text', { x: INNODB.x + 16, y: INNODB.y + 24, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      'InnoDB 存储引擎层(表级插件)'
    renderer.el('text', { x: INNODB.x + 16, y: INNODB.y + 46, class: 'tf-subnet-mono' }, renderer.layerLabels).textContent =
      'B+Tree 索引 · Buffer Pool · redo/undo · 行锁'

    // 日志芯片
    this.logChips = []
    ;['undo(回滚)', 'redo(恢复)', 'binlog(复制)'].forEach((t, i) => {
      const chip = renderer.el('text', { x: INNODB.x + 20 + i * 100, y: INNODB.y + 76, class: 'tf-subnet-mono' }, renderer.layerLabels)
      chip.textContent = t
      chip.style.opacity = '0'
      this.logChips.push(chip)
    })

    // 扫描行数徽标
    this.scanChip = renderer.el('text', { x: 520, y: STAGE_Y0 + 5 * STAGE_STEP + 30, class: 'tf-subnet-result' }, renderer.layerLabels)

    // 对照说明
    new Label(renderer, { x: 560, y: 130, text: '查询缓存:8.0 已移除', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 560, y: 156, text: '(写多读少失效频繁)', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 560, y: 200, text: 'EXPLAIN 展示的就是', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: 560, y: 222, text: '优化器的决策', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: 560, y: 300, text: 'UPDATE 额外写:', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: 560, y: 324, text: 'undo + redo + binlog', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 560, y: 380, text: '对照《B+Tree 索引》:', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: 560, y: 402, text: '索引在引擎层', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: 560, y: 426, text: '对照《Tomcat》:', kind: 'muted', anchor: 'start' })
    new Label(renderer, { x: 560, y: 448, text: '连接池耗尽同款', kind: 'muted', anchor: 'start' })

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 6, text: '一条 SQL 自上而下穿过 Server 层,执行器调用 InnoDB 接口读写数据', kind: 'muted' })

    this.sqlPacket = new Packet(renderer, { id: 'sql-pkt', color: 'accent', shape: 'rect', width: 88, height: 24 })
    void this.connLine
  }

  protected buildSteps() {
    const cfg = this.config
    const steps: SceneStep[] = [
      {
        id: 'sql',
        title: 'SQL 到达:MySQL 收到请求',
        description: cfg.sqlType === 'SELECT' ? 'SELECT * FROM users WHERE id = 15' : 'UPDATE users SET age = 26 WHERE id = 15',
        explanation: `应用从**连接池**取出一条连接发出 SQL。MySQL 侧第一站是**连接器**:认证、加载权限。当前条件列${cfg.indexUsed ? '**有索引**' : '**无索引(挑战模式)**'} —— 这将决定后面优化器与执行器的全部表现。`,
        duration: 1200,
        action: 'sql',
      },
      {
        id: 'analyzer',
        title: '① 连接器 → 分析器',
        description: '词法/语法分析,检查表与列是否存在。',
        explanation: `分析器做两件事:**词法分析**(把 SQL 拆成关键字/表名/列名)与**语法分析**(检查合法性)—— \`You have an error in your SQL syntax\` 就发生在这一层。8.0 之前的查询缓存在这里已被移除:写多读少场景失效太频繁。`,
        duration: 1300,
        action: 'analyzer',
      },
      {
        id: 'optimizer',
        title: '② 优化器:选择执行方案',
        description: cfg.indexUsed ? '走索引,预估扫描极少行' : '无索引可用 → 全表扫描!',
        explanation: `优化器是 MySQL 的**大脑**:基于统计信息估算每个方案的成本(扫描行数 × IO/CPU 权重),选最便宜的执行计划 —— 用哪个索引、join 顺序如何。${cfg.indexUsed ? `本次走索引,预估扫描约 ${cfg.tableRows * 0.001} 行。` : `**条件列没有索引,只能全表扫描约 ${cfg.tableRows} 行** —— \`EXPLAIN\` 里 type=ALL、rows 巨大,慢查询的头号嫌疑。`} EXPLAIN 展示的就是这一层的决策。`,
        duration: 1500,
        action: 'optimizer',
      },
      {
        id: 'executor',
        title: '③ 执行器:调用引擎接口',
        description: '校验权限 → 按计划调用 InnoDB。',
        explanation: `执行器先校验**表权限**,然后按优化器的计划**循环调用存储引擎接口**取行:${cfg.indexUsed ? '按索引定位,取到即返回。' : '每一行都要取出并比对条件 —— CPU 与 IO 双重浪费。'} Server 层与引擎层的边界就在这里:执行器不懂数据结构,只调接口。`,
        duration: 1300,
        action: 'executor',
      },
      {
        id: 'innodb',
        title: '④ InnoDB:真正的读写',
        description: cfg.sqlType === 'SELECT' ? 'B+Tree 定位数据页(Buffer Pool 命中免 IO)' : '写 undo → 改数据页 → 写 redo → binlog',
        explanation: cfg.sqlType === 'SELECT'
          ? 'InnoDB 在 **B+Tree 索引**上定位数据页:页先在 **Buffer Pool**(内存)则免磁盘 IO,否则从磁盘读入。详见《B+Tree 索引》教程 —— 树高决定 IO 次数。'
          : `UPDATE 在引擎层要写**三份日志**:\`undo log\`(旧值,回滚/一致性读)、数据页(Buffer Pool)、\`redo log\`(新值,崩溃恢复),再由 Server 层写 \`binlog\`(主从复制)—— "一条 UPDATE,三处留痕"。`,
        duration: 1600,
        action: 'innodb',
      },
      {
        id: 'done',
        title: '结果返回客户端',
        description: cfg.sqlType === 'SELECT' ? `${cfg.tableRows * 0.001} 行扫描 → 返回结果` : `影响 1 行,耗时 ≈ 1 次索引定位`,
        explanation: `${cfg.indexUsed ? `索引命中:总扫描 ${cfg.tableRows * 0.001} 行,毫秒级。` : `全表扫描 ${cfg.tableRows} 行才找到 1 行 —— 差了 1000 倍!建索引是最有效的优化。`}排查口诀:**慢日志抓疑似 → EXPLAIN 看计划 → 建索引/改写 SQL**。不同慢有不同层:扫描大在引擎层、连接打满在 Server 层、连接池耗尽在应用层(对照 Tomcat)。`,
        duration: 1300,
        action: 'done',
      },
    ]

    const transitions: StepTransition<MysqlState>[] = [
      () => createMysqlState(cfg),
      s => advanceStage(s, cfg),
      s => advanceStage(s, cfg),
      s => advanceStage(s, cfg),
      s => advanceStage(s, cfg),
      s => ({ ...advanceStage(s, cfg), log: [...advanceStage(s, cfg).log, `统计:扫描 ${s.scannedRows} 行,${cfg.sqlType === 'SELECT' ? `返回 ${s.returnedRows} 行` : '影响 1 行'}`] }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): MysqlState {
    return createMysqlState(this.config)
  }

  private effectiveState(stepState: MysqlState): MysqlState {
    return this.live ?? stepState
  }

  private live: MysqlState | null = null

  protected render(stepState: MysqlState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline
    void tl

    const activeIdx = state.stages.findIndex(st => st.status === 'active')
    this.clientNode.setStatus(activeIdx >= 0 || mysqlFinished(state) ? 'active' : 'idle')

    // 阶段高亮
    this.stageBoxes.forEach((box, i) => {
      const st = state.stages[i]
      if (!box || !st) return
      box.rect.setAttribute('class', `tf-http-stage ${st.status === 'active' ? 'is-active' : st.status === 'done' ? 'is-done' : ''}`)
      box.status.textContent = st.status === 'done' ? '✓' : st.status === 'active' ? '●' : ''
      box.status.setAttribute('class', `tf-http-status ${st.status === 'active' ? 'is-active' : st.status === 'done' ? 'is-done' : ''}`)
      if (box.note) box.note.textContent = st.note
    })

    // InnoDB 状态
    if (this.innodbRect) {
      const active = state.stages[4]?.status === 'active'
      this.innodbRect.setAttribute('class', `tf-mem-block ${active ? 'tf-http-stage is-active' : ''}`)
    }

    // 日志芯片(UPDATE 且进入 InnoDB)
    const showLogs = state.sqlType === 'UPDATE' && state.stages[4]?.status !== 'pending'
    this.logChips.forEach(chip => {
      if (chip) chip.style.opacity = showLogs ? '1' : '0'
    })

    // 扫描行数
    if (this.scanChip) {
      const done = mysqlFinished(state)
      this.scanChip.textContent = done ? (state.indexUsed ? `✓ 索引扫描 ${state.scannedRows} 行` : `⚠ 全表扫描 ${state.scannedRows} 行`) : ''
      this.scanChip.setAttribute('class', `tf-subnet-result ${state.indexUsed ? 'ok' : 'bad'}`)
    }

    // SQL 包位置
    const yFor = (idx: number) => STAGE_Y0 + idx * STAGE_STEP + STAGE_H / 2
    if (activeIdx >= 0) {
      const y = yFor(activeIdx)
      const x = STAGE_X + STAGE_W + 60
      this.sqlPacket.placeAt(x, y)
      this.sqlPacket.show(true)
    } else {
      this.sqlPacket.show(false)
    }
  }

  protected snapshotData(stepState: MysqlState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const active = state.stages.find(st => st.status === 'active')
    return {
      rows: [
        { label: 'SQL', value: state.sqlType === 'SELECT' ? 'SELECT … WHERE id = 15' : 'UPDATE … WHERE id = 15', tone: 'accent' },
        { label: '索引', value: state.indexUsed ? '有(主键/二级)' : '无(全表扫描)', tone: state.indexUsed ? 'success' : 'danger' },
        { label: '当前阶段', value: active ? active.title : mysqlFinished(state) ? '(完成)' : '(未开始)', tone: 'accent' },
        { label: '阶段进度', value: `${state.stages.filter(st => st.status === 'done').length} / ${state.stages.length}` },
        { label: '扫描行数', value: `${state.scannedRows} / 表 ${this.configRows()}`, tone: state.indexUsed ? 'success' : 'danger' },
        { label: 'EXPLAIN type', value: state.indexUsed ? 'ref(索引)' : 'ALL(全表)', tone: state.indexUsed ? 'success' : 'danger' },
        { label: '返回/影响行数', value: String(state.sqlType === 'SELECT' ? state.returnedRows : 1) },
        { label: '日志', value: state.logsWritten.length ? state.logsWritten.join(' + ') : '—' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  private configRows(): number {
    return this.config.tableRows
  }

  getActions(): SceneAction[] {
    return [
      { name: 'select-indexed', label: 'SELECT(有索引)' },
      {
        name: 'select-noindex',
        label: 'SELECT(无索引)',
        description: '挑战:全表扫描 10 万行 —— 慢查询头号形态。',
        danger: true,
      },
      { name: 'update', label: 'UPDATE(观察三份日志)' },
    ]
  }

  performAction(name: string): void {
    switch (name) {
      case 'select-indexed':
        this.config = { ...this.config, sqlType: 'SELECT', indexUsed: true }
        this.rebuild()
        break
      case 'select-noindex':
        this.config = { ...this.config, sqlType: 'SELECT', indexUsed: false }
        this.rebuild()
        break
      case 'update':
        this.config = { ...this.config, sqlType: 'UPDATE', indexUsed: true }
        this.rebuild()
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new MysqlArchScene(),
}

export default sceneModule
