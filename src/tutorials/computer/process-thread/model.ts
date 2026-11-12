/**
 * 进程与线程调度模拟模型(教学简化:单核、时间片轮转)。
 * 纯函数,可测试。演示:上下文切换、共享堆可见性、竞态条件(丢失更新)与加锁。
 */

export interface ThreadContext {
  /** 私有寄存器/PC(切换时保存恢复) */
  pc: number
  register: number
}

export interface ThreadState {
  id: string
  name: string
  context: ThreadContext
  status: 'ready' | 'running' | 'done'
}

export interface ProcessState {
  id: string
  name: string
  threads: ThreadState[]
  /** 共享堆上的计数器 */
  sharedCounter: number
  /** 共享变量在堆上的影子(教学可视化用) */
  heapVisible: number
}

export interface SchedulerState {
  processes: ProcessState[]
  /** 当前占用 CPU 的线程(processId/threadId),null = idle */
  running: { processId: string; threadId: string } | null
  /** 已完成的时间片数 */
  slices: number
  /** 竞态窗口:线程读到旧值但未写回(pendingWrite) */
  pendingWrites: Array<{ processId: string; threadId: string; observed: number }>
  lockHeld: string | null
  log: string[]
}

export function createSchedulerState(): SchedulerState {
  return {
    processes: [
      {
        id: 'p1',
        name: '进程 A(计数服务)',
        threads: [
          { id: 'p1-t1', name: '线程 T1', context: { pc: 0, register: 0 }, status: 'ready' },
          { id: 'p1-t2', name: '线程 T2', context: { pc: 0, register: 0 }, status: 'ready' },
        ],
        sharedCounter: 5,
        heapVisible: 5,
      },
      {
        id: 'p2',
        name: '进程 B(独立服务)',
        threads: [{ id: 'p2-t1', name: '线程 T3', context: { pc: 0, register: 0 }, status: 'ready' }],
        sharedCounter: 100,
        heapVisible: 100,
      },
    ],
    running: null,
    slices: 0,
    pendingWrites: [],
    lockHeld: null,
    log: ['调度器就绪:单核 CPU,时间片轮转;进程 A 内有 T1/T2 两个线程'],
  }
}

function findThread(s: SchedulerState, processId: string, threadId: string) {
  const proc = s.processes.find(p => p.id === processId)
  return proc?.threads.find(t => t.id === threadId)
}

/** 线程执行「counter = counter + 1」的一条微指令;返回新状态 */
export function executeStep(s: SchedulerState, processId: string, threadId: string): SchedulerState {
  const proc = s.processes.find(p => p.id === processId)
  const thread = findThread(s, processId, threadId)
  if (!proc || !thread) return s

  const step = thread.context.pc % 3
  // 读 → 改 → 写 三步;竞态窗口在「读后未写回」期间
  if (step === 0) {
    // 读内存到寄存器
    const observed = proc.sharedCounter
    return {
      ...s,
      processes: s.processes.map(p =>
        p.id !== processId
          ? p
          : {
              ...p,
              threads: p.threads.map(t =>
                t.id !== threadId ? t : { ...t, context: { ...t.context, register: observed, pc: t.context.pc + 1 } },
              ),
            },
      ),
      pendingWrites: s.pendingWrites.some(w => w.processId === processId && w.threadId === threadId)
        ? s.pendingWrites
        : [...s.pendingWrites, { processId, threadId, observed }],
      log: [...s.log, `${thread.name}:读取堆内存 counter = ${observed}(寄存器暂存)`],
    }
  }
  if (step === 1) {
    // ALU 加 1(寄存器内)
    const pending = s.pendingWrites.find(w => w.processId === processId && w.threadId === threadId)
    const value = (pending?.observed ?? thread.context.register) + 1
    return {
      ...s,
      processes: s.processes.map(p =>
        p.id !== processId
          ? p
          : {
              ...p,
              threads: p.threads.map(t =>
                t.id !== threadId ? t : { ...t, context: { ...t.context, register: value, pc: t.context.pc + 1 } },
              ),
            },
      ),
      log: [...s.log, `${thread.name}:寄存器 +1 → ${value}(尚未写回)`],
    }
  }
  // 写回内存
  const thread2 = findThread(s, processId, threadId)!
  const writing = thread2.context.register
  return {
    ...s,
    processes: s.processes.map(p =>
      p.id !== processId
        ? p
        : {
            ...p,
            threads: p.threads.map(t =>
              t.id !== threadId ? t : { ...t, context: { ...t.context, pc: t.context.pc + 1 } },
            ),
            sharedCounter: writing,
            heapVisible: writing,
          },
    ),
    pendingWrites: s.pendingWrites.filter(w => !(w.processId === processId && w.threadId === threadId)),
    log: [...s.log, `${thread.name}:写回内存 counter = ${writing}${s.pendingWrites.length > 1 && s.pendingWrites.every(w => w.observed === thread2.context.register - 1) ? '(丢失更新!' : ''}`],
  }
}

/** 时间片到:保存当前线程上下文,切换到同进程/其他就绪线程 */
export function contextSwitch(s: SchedulerState): SchedulerState {
  if (!s.running) return s
  const { processId, threadId } = s.running
  const proc = s.processes.find(p => p.id === processId)!
  const current = findThread(s, processId, threadId)
  const others = proc.threads.filter(t => t.id !== threadId && t.status !== 'done')
  const next = others[0] ?? proc.threads[0]!
  return {
    ...s,
    running: { processId, threadId: next.id },
    slices: s.slices + 1,
    processes: s.processes.map(p =>
      p.id !== processId
        ? p
        : {
            ...p,
            threads: p.threads.map(t =>
              t.id === threadId
                ? { ...t, status: 'ready' }
                : t.id === next.id
                  ? { ...t, status: 'running' }
                  : t,
            ),
          },
    ),
    log: [...s.log, `时间片到:保存 ${current?.name} 的寄存器/PC → 恢复 ${next.name} 的上下文,继续执行(约 1-10μs)`],
  }
}

/** 调度器跑一个时间片:执行 3 步微指令(一条完整的 counter++) */
export function runTimeSlice(s: SchedulerState): SchedulerState {
  if (!s.running) return s
  let state = s
  for (let i = 0; i < 3; i++) {
    state = executeStep(state, state.running!.processId, state.running!.threadId)
  }
  return state
}

/** 加锁:持锁线程进入临界区,另一线程阻塞等待 */
export function acquireLock(s: SchedulerState, processId: string, threadId: string): SchedulerState {
  const thread = findThread(s, processId, threadId)
  if (s.lockHeld && s.lockHeld !== threadId) {
    return { ...s, log: [...s.log, `${thread?.name} 尝试加锁:锁被占用,阻塞等待` ] }
  }
  return {
    ...s,
    lockHeld: threadId,
    log: [...s.log, `${thread?.name} 获得互斥锁 —— 「读-改-写」三步成为原子临界区`],
  }
}

/** 竞态判定:pendingWrites 里两条记录观察到相同旧值 = 丢失更新 */
export function hasLostUpdate(s: SchedulerState): boolean {
  const seen = new Map<number, number>()
  for (const w of s.pendingWrites) {
    seen.set(w.observed, (seen.get(w.observed) ?? 0) + 1)
  }
  for (const count of seen.values()) {
    if (count >= 2) return true
  }
  return false
}
