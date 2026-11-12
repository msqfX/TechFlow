import { isInteractiveScene } from '../types/scene'
import type { SceneAction, TutorialScene } from '../types/scene'
import type { SceneStep } from '../types/step'
import { createInitialPlayerState, reducePlayerState } from './PlayerState'
import type { PlayerState } from './PlayerState'

/** 实验模式动作:场景暴露的可操作交互 */
export type { SceneAction }

/**
 * 播放器:包装场景,向 Vue UI 提供统一的状态订阅与控制接口。
 * 页面卸载时必须调用 destroy()(docs §5.6-11)。
 */
export class Player {
  private scene: TutorialScene
  private state: PlayerState
  private listeners = new Set<(state: PlayerState) => void>()
  private unsubs: Array<() => void> = []

  constructor(scene: TutorialScene) {
    this.scene = scene
    this.state = createInitialPlayerState()

    const offStatus = scene.events.on('status', status => {
      this.state = reducePlayerState(this.state, { type: 'status', status })
      this.notify()
    })
    const offData = scene.events.on('data', snapshot => {
      this.state = reducePlayerState(this.state, { type: 'snapshot', snapshot })
      this.notify()
    })
    this.unsubs = [offStatus, offData]

    // 场景 init 时已发出首帧数据(先于订阅),这里主动拉取一次
    const initial = scene.getState() as import('../types/scene').SceneStateSnapshot
    if (initial && typeof initial === 'object') {
      this.state = reducePlayerState(this.state, { type: 'snapshot', snapshot: initial })
    }
  }

  get interactive(): boolean {
    return isInteractiveScene(this.scene)
  }

  /** 场景步骤列表(步骤型场景才有;纯实验场景返回 null) */
  get steps(): readonly SceneStep[] {
    const s = this.scene as unknown as { steps?: readonly SceneStep[] }
    return Array.isArray(s.steps) ? s.steps : []
  }

  getActions(): SceneAction[] {
    return isInteractiveScene(this.scene) ? this.scene.getActions() : []
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    if (isInteractiveScene(this.scene)) {
      this.scene.performAction(name, params)
    }
  }

  getSnapshot(): PlayerState {
    return this.state
  }

  subscribe(listener: (state: PlayerState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  play(): void {
    this.scene.play()
  }

  pause(): void {
    this.scene.pause()
  }

  next(): void {
    this.scene.nextStep()
  }

  prev(): void {
    this.scene.previousStep()
  }

  goToStep(index: number): void {
    this.scene.goToStep(index)
  }

  reset(): void {
    this.scene.reset()
  }

  setSpeed(speed: number): void {
    this.scene.setSpeed(speed)
    this.state = reducePlayerState(this.state, { type: 'speed', speed })
    this.notify()
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener(this.state)
    }
  }

  destroy(): void {
    for (const off of this.unsubs) off()
    this.unsubs = []
    this.listeners.clear()
    this.scene.destroy()
  }
}
