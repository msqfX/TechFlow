import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Packet } from '@/engine/components/Packet'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { createCpuState, decode, execute, fetch, writeback } from './model'
import type { CpuState } from './model'

/** CPU 执行程序场景:取指/解码/执行/写回 四阶段动画 */

interface CpuSceneConfig {
  memory: number[]
}

const VIEW = { width: 840, height: 600 }

const REG_POS = { R1: { x: 300, y: 150 }, R2: { x: 400, y: 150 }, R3: { x: 500, y: 150 } }
const PC_POS = { x: 170, y: 90 }
const IR_POS = { x: 170, y: 150 }
const ALU_POS = { x: 400, y: 230 }
const MEM_X = 620
const MEM_Y0 = 90
const MEM_STEP = 46

class CpuExecScene extends BaseScene<CpuState> {
  private config: CpuSceneConfig = { memory: [7, 3, 0, 0, 0, 0, 0, 0] }

  private pcBox: SVGTextElement | null = null
  private irBox: SVGTextElement | null = null
  private regBoxes: Partial<Record<'R1' | 'R2' | 'R3', SVGTextElement>> = {}
  private aluBox: SVGTextElement | null = null
  private flagChip: SVGTextElement | null = null
  private memCells: SVGTextElement[] = []
  private memRects: SVGRectElement[] = []
  private programRows: SVGTextElement[] = []
  private phaseChips: Partial<Record<string, SVGTextElement>> = {}
  private busPacket!: Packet

  constructor() {
    super({ id: 'cpu-exec', viewBox: VIEW, label: 'CPU 指令周期动画' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // CPU 外框
    renderer.el('rect', { x: 60, y: 60, width: 560, height: 240, rx: 14, class: 'tf-cpu-block' }, renderer.layerBg)
    const cpuTitle = renderer.el('text', { x: 80, y: 84, class: 'tf-label--accent' }, renderer.layerLabels)
    cpuTitle.textContent = 'CPU(教学模型:顺序单发射)'
    renderer.el('rect', { x: 600, y: 60, width: 210, height: 420, rx: 14, class: 'tf-mem-block' }, renderer.layerBg)
    const memTitle = renderer.el('text', { x: 700, y: 84, 'text-anchor': 'middle', class: 'tf-label--accent' }, renderer.layerLabels)
    memTitle.textContent = '内存'
    renderer.el('text', { x: 700, y: 104, 'text-anchor': 'middle', class: 'tf-label--muted' }, renderer.layerLabels).textContent =
      '程序与数据同放(冯诺依曼)'

    // PC / IR
    renderer.el('text', { x: PC_POS.x - 60, y: PC_POS.y + 4, class: 'tf-label--muted' }, renderer.layerLabels).textContent = 'PC'
    this.pcBox = renderer.el('text', { x: PC_POS.x + 20, y: PC_POS.y + 4, 'text-anchor': 'middle', class: 'tf-cpu-value' }, renderer.layerNodes)
    renderer.el('text', { x: IR_POS.x - 60, y: IR_POS.y + 4, class: 'tf-label--muted' }, renderer.layerLabels).textContent = 'IR'
    this.irBox = renderer.el('text', { x: IR_POS.x + 60, y: IR_POS.y + 4, 'text-anchor': 'middle', class: 'tf-cpu-value' }, renderer.layerNodes)

    // 寄存器
    ;(['R1', 'R2', 'R3'] as const).forEach(reg => {
      const pos = REG_POS[reg]
      renderer.el('text', { x: pos.x, y: pos.y - 22, 'text-anchor': 'middle', class: 'tf-label--muted' }, renderer.layerLabels).textContent = reg
      this.regBoxes[reg] = renderer.el('text', { x: pos.x + 30, y: pos.y + 6, 'text-anchor': 'middle', class: 'tf-cpu-value' }, renderer.layerNodes)
    })

    // ALU
    renderer.el('rect', { x: ALU_POS.x - 90, y: ALU_POS.y - 26, width: 180, height: 52, rx: 10, class: 'tf-alu-box' }, renderer.layerNodes)
    const aluLabel = renderer.el('text', { x: ALU_POS.x, y: ALU_POS.y - 8, 'text-anchor': 'middle', class: 'tf-label--muted' }, renderer.layerNodes)
    aluLabel.textContent = 'ALU 算术逻辑单元'
    this.aluBox = renderer.el('text', { x: ALU_POS.x, y: ALU_POS.y + 16, 'text-anchor': 'middle', class: 'tf-cpu-value' }, renderer.layerNodes)

    // 标志位
    this.flagChip = renderer.el('text', { x: 170, y: 232, class: 'tf-label--mono' }, renderer.layerLabels)
    this.flagChip.textContent = 'ZF=0'

    // 阶段指示条
    const phases = ['fetch', 'decode', 'execute', 'writeback']
    phases.forEach((p, i) => {
      const x = 100 + i * 120
      const chip = renderer.el('text', { x: x + 40, y: 285, 'text-anchor': 'middle', class: 'tf-phase-chip' }, renderer.layerLabels)
      chip.textContent = { fetch: '取指', decode: '解码', execute: '执行', writeback: '写回' }[p] ?? ''
      this.phaseChips[p] = chip
    })

    // 内存 8 格
    this.memRects = []
    this.memCells = []
    for (let i = 0; i < 8; i++) {
      const y = MEM_Y0 + 20 + i * MEM_STEP
      renderer.el('text', { x: MEM_X + 10, y: y + 18, class: 'tf-label--mono' }, renderer.layerLabels).textContent = `M${i}`
      this.memRects.push(renderer.el('rect', { x: MEM_X + 50, y, width: 140, height: 36, rx: 7, class: 'tf-mem-cell' }, renderer.layerNodes))
      this.memCells.push(renderer.el('text', { x: MEM_X + 120, y: y + 24, 'text-anchor': 'middle', class: 'tf-cpu-value' }, renderer.layerNodes))
    }

    // 程序列表
    const progTitle = renderer.el('text', { x: 80, y: 330, class: 'tf-label--accent' }, renderer.layerLabels)
    progTitle.textContent = '程序(指令序列)'
    this.programRows = []
    for (let i = 0; i < 6; i++) {
      const y = 350 + i * 34
      this.programRows.push(renderer.el('text', { x: 90, y, class: 'tf-subnet-mono' }, renderer.layerLabels))
    }

    // 总线
    new Label(renderer, { x: 590, y: 300, text: '地址/数据总线', kind: 'mono' })
    this.busPacket = new Packet(renderer, { id: 'bus-pkt', color: 'purple', shape: 'circle', radius: 8 })

    // 提示
    new Label(renderer, { x: VIEW.width / 2, y: 570, text: '观察 PC/IR/寄存器/内存随四个阶段的变化', kind: 'muted' })
  }

  protected buildSteps() {
    const memory = [...this.config.memory]
    const program = [
      { op: 'LOAD' as const, text: 'LOAD R1, [M0]' },
      { op: 'LOAD' as const, text: 'LOAD R2, [M1]' },
      { op: 'ADD' as const, text: 'ADD R3, R1, R2' },
      { op: 'STORE' as const, text: 'STORE [M2], R3' },
      { op: 'SUB' as const, text: 'SUB R1, R1, R2' },
      { op: 'HALT' as const, text: 'HALT' },
    ]

    const explain = {
      boot: '**启动**:程序以指令序列的形式与数据一起放在内存(冯·诺依曼架构)。PC(程序计数器)指向第一条指令的地址 0。CPU 的一切工作就是把「取指 → 解码 → 执行 → 写回」这个循环跑起来。',
      fetch: '**取指(Fetch)**:把 PC 里的地址放上地址总线,从内存读出指令存入 **IR(指令寄存器)**;同时 PC 自增,指向下一条指令。注意 PC 的自增发生在取指阶段 —— 这就是「顺序执行」的来源。',
      decode: '**解码(Decode)**:控制单元解析 IR 中的二进制编码:高位操作码(opcode)决定做什么(LOAD/ADD/STORE…),其余位指明操作数在哪个寄存器或内存地址。',
      execute: '**执行(Execute)**:ALU 完成算术逻辑运算,或按地址访问内存。本步骤只产生结果,**还没写回** —— 现代乱序处理器正是把「执行」和「写回」解耦来重排指令的。',
      writeback: '**写回(Writeback)**:结果写入目的寄存器或内存;条件类指令同时更新**标志位**(ZF 等)。随后循环回到取指,处理 PC 指向的下一条指令。',
      halted: '**停机**:HALT 之后 CPU 不再取指。真实程序里,「停机」对应进程结束/系统调用退出;操作系统的调度器会把 CPU 让给其他进程。',
    }

    const phaseStep = (phase: string, i: number): SceneStep => ({
      id: `${phase}-${i}`,
      title: `第 ${i + 1} 条 · ${({ fetch: '取指', decode: '解码', execute: '执行', writeback: '写回' })[phase]}`,
      description: program[i]!.text,
      explanation: explain[phase as keyof typeof explain] ?? '',
      duration: 1100,
      action: phase,
    })

    const steps: SceneStep[] = [
      {
        id: 'boot',
        title: 'CPU 上电,程序载入内存',
        description: 'PC=0,寄存器清零。',
        explanation: explain.boot,
        duration: 1500,
        action: 'boot',
      },
      phaseStep('fetch', 0),
      phaseStep('decode', 0),
      phaseStep('execute', 0),
      phaseStep('writeback', 0),
      phaseStep('fetch', 1),
      phaseStep('decode', 1),
      phaseStep('execute', 1),
      phaseStep('writeback', 1),
      phaseStep('fetch', 2),
      phaseStep('decode', 2),
      phaseStep('execute', 2),
      phaseStep('writeback', 2),
      phaseStep('fetch', 3),
      phaseStep('decode', 3),
      phaseStep('execute', 3),
      phaseStep('writeback', 3),
      phaseStep('fetch', 4),
      phaseStep('decode', 4),
      phaseStep('execute', 4),
      phaseStep('writeback', 4),
      {
        id: 'halt',
        title: 'HALT:程序结束',
        description: 'CPU 停止取指。',
        explanation: explain.halted,
        duration: 1300,
        action: 'halt',
      },
    ]

    const transitions: StepTransition<CpuState>[] = [
      () => createCpuState(memory, program),
      s => fetch(s),
      s => decode(s),
      s => execute(s),
      s => writeback(s),
      s => fetch(s),
      s => decode(s),
      s => execute(s),
      s => writeback(s),
      s => fetch(s),
      s => decode(s),
      s => execute(s),
      s => writeback(s),
      s => fetch(s),
      s => decode(s),
      s => execute(s),
      s => writeback(s),
      s => fetch(s),
      s => decode(s),
      s => execute(s),
      s => writeback(s),
      s => ({ ...s, phase: 'halted', log: [...s.log, 'HALT:程序结束'] }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): CpuState {
    return createCpuState([...this.config.memory])
  }

  protected render(state: CpuState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const tl = opts.timeline
    if (this.pcBox) this.pcBox.textContent = String(state.pc)
    if (this.irBox) this.irBox.textContent = state.ir ?? '—'
    for (const reg of ['R1', 'R2', 'R3'] as const) {
      const el = this.regBoxes[reg]
      if (el) el.textContent = String(state.registers[reg])
    }
    if (this.aluBox) this.aluBox.textContent = state.pending !== null ? String(state.pending) : ' '
    if (this.flagChip) this.flagChip.textContent = `ZF=${state.flags.zero ? 1 : 0}`

    for (let i = 0; i < 8; i++) {
      const cell = this.memCells[i]
      const rect = this.memRects[i]
      if (cell) cell.textContent = String(state.memory[i] ?? 0)
      if (rect) {
        // 数据区被写过的格子高亮
        rect.setAttribute('class', `tf-mem-cell ${state.memory[i] ? 'is-written' : ''}`)
      }
    }

    // 程序列表高亮当前 PC
    for (let i = 0; i < this.programRows.length; i++) {
      const row = this.programRows[i]
      if (!row) continue
      const inst = state.program[i]
      row.textContent = `${i === state.pc ? '▶' : ' '} [${i}] ${inst?.text ?? ''}`
      row.setAttribute('class', `tf-subnet-mono ${i === state.pc && state.phase !== 'halted' ? 'is-current' : ''}`)
    }

    // 阶段高亮
    for (const [phase, chip] of Object.entries(this.phaseChips)) {
      if (!chip) continue
      chip.setAttribute('class', `tf-phase-chip ${state.phase === phase ? 'is-active' : ''}`)
    }

    // 总线数据包:取指/写回阶段展示搬运
    if (this.busPacket) {
      const moving = state.phase === 'fetch' || state.phase === 'writeback'
      if (tl && moving) {
        const fromReg = state.phase === 'fetch' ? { x: MEM_X + 120, y: MEM_Y0 + 20 + Math.min(state.pc, 5) * MEM_STEP + 18 } : { x: ALU_POS.x, y: ALU_POS.y + 10 }
        const toReg = state.phase === 'fetch' ? { x: IR_POS.x + 60, y: IR_POS.y + 4 } : { x: REG_POS.R3.x + 30, y: REG_POS.R3.y + 6 }
        this.busPacket.placeAt(fromReg.x, fromReg.y)
        this.busPacket.show(true)
        tl.to(this.busPacket.group, { x: toReg.x - fromReg.x, y: toReg.y - fromReg.y, duration: 0.6, ease: 'power1.inOut' }, 0)
        tl.add(() => this.busPacket.show(false))
      } else {
        this.busPacket.show(false)
      }
    }
  }

  protected snapshotData(state: CpuState, completedSteps: number): Record<string, unknown> {
    const phaseText = { idle: '空闲', fetch: '取指', decode: '解码', execute: '执行', writeback: '写回', halted: '已停机' }[state.phase]
    return {
      rows: [
        { label: 'PC', value: String(state.pc), tone: 'accent' },
        { label: 'IR', value: state.ir ?? '—' },
        { label: '阶段', value: phaseText ?? state.phase, tone: 'accent' },
        { label: 'R1 / R2 / R3', value: `${state.registers.R1} / ${state.registers.R2} / ${state.registers.R3}` },
        { label: 'ALU 结果', value: state.pending !== null ? String(state.pending) : '—' },
        { label: '标志位 ZF', value: String(state.flags.zero ? 1 : 0) },
        { label: '内存 M0/M1/M2', value: `${state.memory[0]} / ${state.memory[1]} / ${state.memory[2]}` },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'set-memory',
        label: '修改内存操作数',
        description: '改变 M0/M1 的初始值,重新运行程序观察结果。',
        params: [
          { name: 'addr', label: '地址', type: 'select', options: [0, 1, 2].map(n => ({ value: String(n), label: `M${n}` })) },
          { name: 'value', label: '值', type: 'number', min: -999, max: 999, placeholder: '如 7' },
        ],
      },
      { name: 'reset-cpu', label: '复位 CPU' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    switch (name) {
      case 'set-memory': {
        const addr = Number(params?.addr ?? 0)
        const value = Number(params?.value ?? 0)
        if (addr >= 0 && addr < 8 && Number.isFinite(value)) {
          this.config.memory[addr] = Math.floor(value)
          this.rebuild()
        }
        break
      }
      case 'reset-cpu':
        this.rebuild()
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new CpuExecScene(),
}

export default sceneModule
