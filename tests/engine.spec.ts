import { beforeEach, describe, expect, it } from 'vitest'
import { StateManager } from '@/engine/core/StateManager'
import { createInitialPlayerState, reducePlayerState } from '@/engine/player/PlayerState'
import EngineTestSceneModule from '@/tutorials/dev/engine-test.scene'
import type { SceneStateSnapshot, TutorialScene } from '@/engine/types/scene'

/** TutorialScene.getState() 按规范返回 unknown;测试中收窄为快照类型 */
function snapOf(scene: TutorialScene): SceneStateSnapshot {
  return scene.getState() as SceneStateSnapshot
}

// jsdom 不实现 SVG 几何方法,这里打桩供引擎组件使用
beforeEach(() => {
  const proto = SVGElement.prototype as unknown as Record<string, unknown>
  proto.getBBox = proto.getBBox ?? (() => ({ x: 0, y: 0, width: 50, height: 16 }))
  proto.getTotalLength = proto.getTotalLength ?? (() => 200)
  proto.getPointAtLength =
    proto.getPointAtLength ?? ((len: number) => ({ x: len / 2, y: 50 }))
})

describe('StateManager(步骤状态折叠)', () => {
  interface S {
    log: string[]
    n: number
  }
  const initial: S = { log: [], n: 0 }
  const transitions = [
    (s: S) => ({ log: [...s.log, 'a'], n: s.n + 1 }),
    (s: S) => ({ log: [...s.log, 'b'], n: s.n + 10 }),
    (s: S) => ({ log: [...s.log, 'c'], n: s.n + 100 }),
  ]

  it('从初始状态逐步折叠', () => {
    const sm = new StateManager<S>(initial, [...transitions])
    expect(sm.index).toBe(0)
    expect(sm.goToState(1).n).toBe(1)
    expect(sm.goToState(2).n).toBe(11)
    expect(sm.goToState(3).n).toBe(111)
  })

  it('任意索引都能直接重建(不依赖连续执行)', () => {
    const sm = new StateManager<S>(initial, [...transitions])
    const jumped = sm.goToState(3)
    expect(jumped.log).toEqual(['a', 'b', 'c'])
    // 回退也必须精确
    expect(sm.goToState(1).log).toEqual(['a'])
    expect(sm.reset()).toEqual(initial)
  })

  it('越界索引抛错', () => {
    const sm = new StateManager<S>(initial, [...transitions])
    expect(() => sm.stateAt(9)).toThrow()
  })
})

describe('PlayerState(播放器 reducer)', () => {
  it('快照更新步骤进度', () => {
    let st = createInitialPlayerState(5)
    st = reducePlayerState(st, {
      type: 'snapshot',
      snapshot: {
        stepIndex: 2,
        totalSteps: 5,
        stepStatuses: ['completed', 'completed', 'active', 'pending', 'pending'],
        data: { rows: [] },
      },
    })
    expect(st.completedSteps).toBe(2)
    expect(st.stepStatuses[1]).toBe('completed')
    expect(st.stepStatuses[2]).toBe('active')
  })

  it('speed 与 status 更新', () => {
    let st = createInitialPlayerState(3)
    st = reducePlayerState(st, { type: 'speed', speed: 2 })
    st = reducePlayerState(st, { type: 'status', status: 'playing' })
    expect(st.speed).toBe(2)
    expect(st.status).toBe('playing')
  })
})

describe('EngineTestScene(引擎验收场景)', () => {
  function createScene() {
    const scene = EngineTestSceneModule.create()
    const container = document.createElement('div')
    document.body.appendChild(container)
    scene.init(container)
    return { scene, container }
  }

  function logOf(scene: TutorialScene): string[] {
    const snap = snapOf(scene)
    const rows = snap.data.rows as Array<{ label: string; value: string }>
    const value = rows.find(r => r.label === '事件日志')?.value ?? ''
    return value ? value.split(' | ') : []
  }

  it('init 后处于初始状态', () => {
    const { scene, container } = createScene()
    expect(snapOf(scene).stepIndex).toBe(0)
    expect(snapOf(scene).totalSteps).toBe(5)
    expect(container.querySelector('.tf-scene')).not.toBeNull()
    expect(container.querySelectorAll('.tf-node').length).toBe(3)
    scene.destroy()
  })

  it('单步推进:状态立即折叠,快照同步', () => {
    const { scene } = createScene()
    scene.nextStep()
    expect(snapOf(scene).stepIndex).toBe(1)
    expect(logOf(scene)).toEqual(['A 上电'])
    scene.nextStep()
    expect(snapOf(scene).stepIndex).toBe(2)
    expect(logOf(scene)).toEqual(['A 上电', 'A → B 发送'])
    scene.destroy()
  })

  it('goToStep 任意跳转:按索引重建状态(核心要求)', () => {
    const { scene } = createScene()
    // 不经过 1~4 步,直接跳到最后一步执行完成的画面
    scene.goToStep(4)
    expect(snapOf(scene).stepIndex).toBe(5)
    expect(logOf(scene)).toEqual(['A 上电', 'A → B 发送', 'B 处理中', 'B → C 转发', 'C 完成'])
    // 回退到第一步
    scene.goToStep(0)
    expect(snapOf(scene).stepIndex).toBe(1)
    expect(logOf(scene)).toEqual(['A 上电'])
    // 跳到初始画面
    scene.goToStep(-1)
    expect(snapOf(scene).stepIndex).toBe(0)
    scene.destroy()
  })

  it('previousStep 回退一步', () => {
    const { scene } = createScene()
    scene.nextStep()
    scene.nextStep()
    expect(snapOf(scene).stepIndex).toBe(2)
    scene.previousStep()
    expect(snapOf(scene).stepIndex).toBe(1)
    scene.destroy()
  })

  it('reset 回到初始状态', () => {
    const { scene } = createScene()
    scene.nextStep()
    scene.nextStep()
    scene.reset()
    expect(snapOf(scene).stepIndex).toBe(0)
    expect(snapOf(scene).data.rows).toBeDefined()
    scene.destroy()
  })

  it('setSpeed 更新速度且不影响状态折叠', () => {
    const { scene } = createScene()
    scene.setSpeed(2)
    scene.nextStep()
    expect(snapOf(scene).stepIndex).toBe(1)
    scene.destroy()
  })

  it('destroy 后不再响应控制且释放 DOM', () => {
    const { scene, container } = createScene()
    scene.nextStep()
    scene.destroy()
    expect(container.querySelector('.tf-scene')).toBeNull()
    const before = snapOf(scene).stepIndex
    scene.nextStep()
    expect(snapOf(scene).stepIndex).toBe(before)
  })

  it('完整走完五步后 stepIndex 到达末尾', () => {
    const { scene } = createScene()
    for (let i = 0; i < 5; i++) scene.nextStep()
    expect(snapOf(scene).stepIndex).toBe(5)
    const statuses = snapOf(scene).stepStatuses
    expect(statuses.every(s => s === 'completed' || s === 'active')).toBe(true)
    scene.destroy()
  })
})
