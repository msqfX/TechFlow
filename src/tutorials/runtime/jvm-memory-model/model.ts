/**
 * JVM 内存教学模型(简化,非复现真实 HotSpot)。
 * 堆分代(Eden/Survivor/Old)+ 可达性分析 GC;纯函数,可测试。
 */

export type Generation = 'eden' | 'survivor' | 'old'

export interface JvmObject {
  id: string
  kind: string
  sizeKB: number
  gen: Generation
  /** Survivor 区内的 GC 年龄,≥3 晋升老年代 */
  age: number
}

export interface JvmLocal {
  name: string
  /** null = 未引用对象 */
  objId: string | null
}

export interface JvmFrame {
  method: string
  locals: JvmLocal[]
}

export interface JvmState {
  frames: JvmFrame[]
  heap: JvmObject[]
  edenCapKB: number
  gcCount: number
  collectedKB: number
  promoted: number
  log: string[]
}

let objSeq = 0

export function createJvmState(edenCapKB = 32): JvmState {
  return {
    frames: [],
    heap: [],
    edenCapKB,
    gcCount: 0,
    collectedKB: 0,
    promoted: 0,
    log: ['JVM 启动:堆/栈/元空间就绪(教学模型)'],
  }
}

/** 栈帧压栈(方法调用) */
export function callMethod(s: JvmState, method: string, locals: JvmLocal[] = []): JvmState {
  return {
    ...s,
    frames: [...s.frames, { method, locals }],
    log: [...s.log, `调用 ${method}():压入栈帧(局部变量表 + 操作数栈)`],
  }
}

/** 方法返回:栈帧弹出,其局部变量随之消失 */
export function returnFromMethod(s: JvmState): JvmState {
  if (s.frames.length === 0) return s
  const popped = s.frames[s.frames.length - 1]!
  return {
    ...s,
    frames: s.frames.slice(0, -1),
    log: [...s.log, `${popped.method}() 返回:栈帧弹出,其局部变量失去引用`],
  }
}

/** new 对象:优先在 Eden 分配,并在指定栈帧的局部变量表中登记引用 */
export function newObject(
  s: JvmState,
  kind: string,
  sizeKB: number,
  varName: string | null,
  frameIndex?: number,
): JvmState {
  objSeq += 1
  const obj: JvmObject = { id: `${kind}#${objSeq}`, kind, sizeKB, gen: 'eden', age: 0 }
  const frames = [...s.frames]
  if (varName) {
    const idx = frameIndex ?? frames.length - 1
    const frame = frames[idx]
    if (frame) {
      frames[idx] = { ...frame, locals: [...frame.locals, { name: varName, objId: obj.id }] }
    }
  }
  return {
    ...s,
    frames,
    heap: [...s.heap, obj],
    log: [
      ...s.log,
      varName
        ? `new ${kind}():在 Eden 分配 ${obj.id}(${sizeKB}KB),局部变量 ${varName} 指向它`
        : `new ${kind}():在 Eden 分配 ${obj.id}(${sizeKB}KB),无人引用`,
    ],
  }
}

/** 断开引用 */
export function dropRef(s: JvmState, varName: string): JvmState {
  const frames = s.frames.map(f => ({
    ...f,
    locals: f.locals.map(l => (l.name === varName ? { ...l, objId: null } : l)),
  }))
  return {
    ...s,
    frames,
    log: [...s.log, `局部变量 ${varName} 置空:对象失去引用(等待 GC 判定)`],
  }
}

/** GC Roots:所有栈帧的局部变量引用 */
export function gcRoots(s: JvmState): Set<string> {
  const roots = new Set<string>()
  for (const f of s.frames) {
    for (const l of f.locals) {
      if (l.objId) roots.add(l.objId)
    }
  }
  return roots
}

/** Minor GC(教学模型):可达性标记 → 清理不可达 → 幸存者进 Survivor,年龄达标晋升老年代 */
export function minorGc(s: JvmState): JvmState {
  const roots = gcRoots(s)
  const reachable = new Set<string>()
  // 从根出发沿引用遍历(教学模型中对象间引用未建模,直接判定根可达)
  for (const id of roots) reachable.add(id)

  let collectedKB = 0
  let promoted = 0
  const heap: JvmObject[] = []
  for (const obj of s.heap) {
    if (!reachable.has(obj.id)) {
      collectedKB += obj.sizeKB
      continue
    }
    if (obj.gen === 'eden') {
      heap.push({ ...obj, gen: 'survivor', age: 1 })
    } else if (obj.gen === 'survivor') {
      const age = obj.age + 1
      if (age >= 3) {
        heap.push({ ...obj, gen: 'old', age })
        promoted += 1
      } else {
        heap.push({ ...obj, gen: 'survivor', age })
      }
    } else {
      heap.push(obj)
    }
  }

  return {
    ...s,
    heap,
    gcCount: s.gcCount + 1,
    collectedKB: s.collectedKB + collectedKB,
    promoted: s.promoted + promoted,
    log: [
      ...s.log,
      `Minor GC #${s.gcCount + 1}:可达性分析从 GC Roots(栈局部变量)标记 → 清理 ${collectedKB}KB → 幸存者进入 Survivor(年龄+1,≥3 晋升老年代 ${promoted} 个)`,
    ],
  }
}

/** Eden 已用量 */
export function edenUsedKB(s: JvmState): number {
  return s.heap.filter(o => o.gen === 'eden').reduce((acc, o) => acc + o.sizeKB, 0)
}
