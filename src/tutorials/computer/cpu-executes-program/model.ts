/**
 * CPU 指令执行模型(教学简化:单发射、顺序执行、无流水线)。
 * 纯函数,可测试。
 */

export type Op = 'LOAD' | 'ADD' | 'SUB' | 'STORE' | 'CMP' | 'HALT'

export interface Instruction {
  op: Op
  /** 文本形式,如 LOAD R1, [M0] */
  text: string
}

export type Phase = 'idle' | 'fetch' | 'decode' | 'execute' | 'writeback' | 'halted'

export interface CpuState {
  program: Instruction[]
  pc: number
  ir: string | null
  registers: { R1: number; R2: number; R3: number }
  memory: number[]
  phase: Phase
  flags: { zero: boolean }
  /** 本条指令的中间结果(writeback 时落位) */
  pending: number | null
  log: string[]
}

export const DEFAULT_PROGRAM: Instruction[] = [
  { op: 'LOAD', text: 'LOAD R1, [M0]' },
  { op: 'LOAD', text: 'LOAD R2, [M1]' },
  { op: 'ADD', text: 'ADD R3, R1, R2' },
  { op: 'STORE', text: 'STORE [M2], R3' },
  { op: 'SUB', text: 'SUB R1, R1, R2' },
  { op: 'HALT', text: 'HALT' },
]

export function createCpuState(memory: number[], program: Instruction[] = DEFAULT_PROGRAM): CpuState {
  return {
    program,
    pc: 0,
    ir: null,
    registers: { R1: 0, R2: 0, R3: 0 },
    memory: [...memory],
    phase: 'idle',
    flags: { zero: false },
    pending: null,
    log: ['CPU 上电,PC = 0;程序与数据已加载到内存'],
  }
}

/** 取指:IR ← 内存[PC](教学模型:程序与数据同放内存);PC 自增 */
export function fetch(s: CpuState): CpuState {
  const inst = s.program[s.pc]
  if (!inst) return { ...s, phase: 'halted' }
  return {
    ...s,
    ir: inst.text,
    phase: 'fetch',
    pending: null,
    log: [...s.log, `取指:IR ← ${inst.text}(PC=${s.pc});PC 将自增 → ${s.pc + 1}`],
  }
}

/** 解码:控制单元解析操作码与操作数 */
export function decode(s: CpuState): CpuState {
  const inst = s.program[s.pc]
  if (!inst) return { ...s, phase: 'halted' }
  return {
    ...s,
    phase: 'decode',
    log: [...s.log, `解码:${inst.op} — 控制单元识别操作码并定位操作数`],
  }
}

/** 执行:ALU 计算(不落位)或访存读取 */
export function execute(s: CpuState): CpuState {
  const inst = s.program[s.pc]
  if (!inst) return { ...s, phase: 'halted' }
  const r = s.registers
  switch (inst.op) {
    case 'LOAD': {
      const addr = addrOf(inst.text)
      const value = s.memory[addr] ?? 0
      return { ...s, phase: 'execute', pending: value, log: [...s.log, `执行:从内存[${addr}] 读出 ${value},准备写入寄存器`] }
    }
    case 'ADD': {
      const [, a, b] = operands(inst.text)
      const value = (regValue(r, a ?? 'R1') ?? 0) + (regValue(r, b ?? 'R1') ?? 0)
      return { ...s, phase: 'execute', pending: value, log: [...s.log, `执行:ALU 计算 ${a ?? 'R1'}(${regValue(r, a ?? 'R1')}) + ${b ?? 'R1'}(${regValue(r, b ?? 'R1')}) = ${value}`] }
    }
    case 'SUB': {
      const [, a, b] = operands(inst.text)
      const value = (regValue(r, a ?? 'R1') ?? 0) - (regValue(r, b ?? 'R1') ?? 0)
      return { ...s, phase: 'execute', pending: value, log: [...s.log, `执行:ALU 计算 ${a ?? 'R1'} − ${b ?? 'R1'} = ${value},并更新标志位`] }
    }
    case 'STORE': {
      const addr = addrOf(inst.text)
      const src = srcRegister(inst.text)
      const srcVal = regValue(r, src) ?? 0
      return { ...s, phase: 'execute', pending: srcVal, log: [...s.log, `执行:准备把 ${src}(${srcVal}) 写入内存[${addr}]`] }
    }
    case 'CMP': {
      const [a, b] = operands(inst.text)
      const value = (regValue(r, a ?? 'R1') ?? 0) - (regValue(r, b ?? 'R1') ?? 0)
      return { ...s, phase: 'execute', pending: value, log: [...s.log, `执行:比较 ${a ?? 'R1'} 与 ${b ?? 'R1'} → 结果 ${value}(影响 zero 标志)`] }
    }
    case 'HALT':
      return { ...s, phase: 'halted', log: [...s.log, '执行:HALT — CPU 停机,不再取指'] }
    default:
      return s
  }
}

/** 写回:结果写入寄存器/内存;更新标志;PC 移动由取指完成 */
export function writeback(s: CpuState): CpuState {
  const inst = s.program[s.pc]
  if (!inst) return { ...s, phase: 'halted' }
  if (inst.op === 'HALT') {
    return { ...s, phase: 'halted', pending: null, log: [...s.log, '程序结束(PC 停留在 HALT)'] }
  }
  const registers = { ...s.registers }
  const memory = [...s.memory]
  const flags = { ...s.flags }
  switch (inst.op) {
    case 'LOAD': {
      const dst = dstRegister(inst.text)
      registers[dst] = s.pending ?? 0
      break
    }
    case 'ADD':
    case 'SUB':
    case 'CMP': {
      const dst = dstRegister(inst.text)
      registers[dst] = s.pending ?? 0
      if (inst.op !== 'CMP') flags.zero = (s.pending ?? 0) === 0
      break
    }
    case 'STORE': {
      const addr = addrOf(inst.text)
      memory[addr] = s.pending ?? 0
      break
    }
    default:
      break
  }
  return {
    ...s,
    registers,
    memory,
    flags,
    phase: 'writeback',
    pending: null,
    pc: s.pc + 1,
    log: [...s.log, `写回:${inst.text} 完成;PC=${s.pc + 1}`],
  }
}

function addrOf(text: string): number {
  const m = /\[M(\d+)\]/.exec(text)
  return m ? Number(m[1]) : 0
}

function operands(text: string): string[] {
  const body = text.split(/\s+/).slice(1).join(' ')
  return body.split(',').map(x => x.trim()).filter(Boolean)
}

function dstRegister(text: string): 'R1' | 'R2' | 'R3' {
  const first = operands(text)[0] ?? 'R1'
  if (first.startsWith('[')) {
    // STORE [M2], R3 的目标是内存,寄存器侧作为来源;这里仍返回占位
    const src = srcRegister(text)
    return src as 'R1' | 'R2' | 'R3'
  }
  return (['R1', 'R2', 'R3'].includes(first) ? first : 'R1') as 'R1' | 'R2' | 'R3'
}

function srcRegister(text: string): string {
  const ops = operands(text)
  const reg = ops.find(o => o.startsWith('R'))
  return reg ?? 'R1'
}

function regValue(r: { R1: number; R2: number; R3: number }, name: string): number | undefined {
  if (name === 'R1') return r.R1
  if (name === 'R2') return r.R2
  if (name === 'R3') return r.R3
  return undefined
}
