import type { PlayerStatus, SceneEventPayloads, SceneStateSnapshot, StepStatus, TutorialScene } from '../types/scene'
import type { RenderOptions, SceneStep, StepTransition } from '../types/step'
import type { GsapTimeline } from '../types/animation'
import { EventBus } from './EventBus'
import { StateManager } from './StateManager'
import { TimelineManager } from './TimelineManager'
import { SVGRenderer } from '../renderers/SVGRenderer'

export interface BaseSceneOptions {
  id: string
  viewBox: { width: number; height: number }
  label?: string
}

/**
 * 场景基类:实现统一的播放/暂停/单步/跳转/重置/速度/销毁。
 *
 * 核心机制(docs §5.5):步骤转移必须是纯函数,状态从初始状态逐步折叠缓存,
 * 因此 goToStep / previousStep 直接按索引重建场景状态,而非连续重放动画。
 *
 * 子类职责:
 * - buildScene: 创建静态视觉(node/connection/packet)
 * - buildSteps: 声明步骤列表与对应纯函数转移
 * - render: 把某个状态渲染到画布(animate 时将补间写入传入的 timeline)
 * - snapshotData: 输出实时信息面板数据(必须来自真实模拟状态)
 */
export abstract class BaseScene<S> implements TutorialScene {
  readonly id: string
  protected renderer!: SVGRenderer
  protected timeline = new TimelineManager()
  readonly events = new EventBus<SceneEventPayloads>()
  protected stepDefs: SceneStep[] = []
  protected states!: StateManager<S>
  protected status: PlayerStatus = 'idle'
  protected destroyed = false
  private containerRef: HTMLElement | null = null

  /** 正在播放动画的步骤索引(-1 表示无) */
  private animatingStep = -1
  private playTimer: number | null = null

  constructor(private readonly options: BaseSceneOptions) {
    this.id = options.id
  }

  /* ============ 子类实现 ============ */

  /** 创建静态视觉元素(节点、连线、背景) */
  protected abstract buildScene(renderer: SVGRenderer): void

  /** 声明步骤与转移(必须一次性给出全部步骤) */
  protected abstract buildSteps(): { steps: SceneStep[]; transitions: StepTransition<S>[] }

  /** 初始状态 */
  protected abstract buildInitialState(): S

  /** 渲染状态。opts.timeline 存在时把补间加入时间线,否则直接设置终值 */
  protected abstract render(state: S, opts: RenderOptions & { timeline: GsapTimeline | null }): void

  /** 实时信息面板数据 */
  protected abstract snapshotData(state: S, completedSteps: number): Record<string, unknown>

  /* ============ 生命周期 ============ */

  init(container: HTMLElement): void {
    this.containerRef = container
    this.setupVisual()
    const built = this.buildSteps()
    this.stepDefs = built.steps
    this.states = new StateManager(this.buildInitialState(), built.transitions)
    this.render(this.states.current, { animate: false, timeline: null, fromIndex: 0 })
    this.events.emit('status', this.status)
    this.emitData()
  }

  /** (重)创建渲染层并构建静态视觉与步骤状态机,用于实验模式切换场景配置 */
  protected rebuild(): void {
    if (this.destroyed || !this.containerRef) return
    this.clearPlayTimer()
    this.timeline.kill()
    this.animatingStep = -1
    this.setupVisual()
    const built = this.buildSteps()
    this.stepDefs = built.steps
    this.states = new StateManager(this.buildInitialState(), built.transitions)
    this.render(this.states.current, { animate: false, timeline: null, fromIndex: 0 })
    this.status = 'idle'
    this.events.emit('status', this.status)
    this.events.emit('step', 0)
    this.emitData()
  }

  private setupVisual(): void {
    if (this.renderer) this.renderer.destroy()
    this.renderer = new SVGRenderer(this.containerRef as HTMLElement, {
      viewBoxWidth: this.options.viewBox.width,
      viewBoxHeight: this.options.viewBox.height,
      label: this.options.label,
    })
    this.buildScene(this.renderer)
  }

  /* ============ 状态读取 ============ */

  get stepCount(): number {
    return this.stepDefs.length
  }

  get steps(): readonly SceneStep[] {
    return this.stepDefs
  }

  /** 已执行完成的步骤数(states 索引) */
  get completedSteps(): number {
    return this.states.index
  }

  getStatus(): PlayerStatus {
    return this.status
  }

  getSpeed(): number {
    return this.timeline.getSpeed()
  }

  /* ============ 播放控制 ============ */

  play(): void {
    if (this.destroyed) return
    // 时间线被暂停:继续
    const tl = this.timeline.active
    if (tl && tl.paused() && this.animatingStep >= 0) {
      tl.play()
      this.status = 'playing'
      this.events.emit('status', this.status)
      return
    }
    if (this.status === 'completed') {
      this.goToStepInternal(0)
    }
    this.status = 'playing'
    this.events.emit('status', this.status)
    this.runNextStep()
  }

  pause(): void {
    if (this.destroyed) return
    this.clearPlayTimer()
    const tl = this.timeline.active
    if (tl && this.animatingStep >= 0) {
      tl.pause()
      this.status = 'paused'
    } else {
      this.status = 'paused'
    }
    this.events.emit('status', this.status)
  }

  /** 单步执行:动画结束后停在 paused(可继续播放) */
  nextStep(): void {
    if (this.destroyed) return
    if (this.states.index >= this.stepDefs.length) return
    if (this.status === 'playing') this.finishRunningAnimation()
    this.status = 'paused'
    this.events.emit('status', this.status)
    this.runNextStep()
  }

  previousStep(): void {
    if (this.destroyed) return
    if (this.states.index <= 0) return
    this.settleAsPaused()
    this.goToStepInternal(this.states.index - 1)
  }

  /** 跳转到「第 index 步执行完成」的画面;index=-1 表示初始状态 */
  goToStep(index: number): void {
    if (this.destroyed) return
    const clamped = Math.min(this.stepDefs.length, Math.max(-1, index))
    this.settleAsPaused()
    this.goToStepInternal(clamped + 1)
  }

  reset(): void {
    if (this.destroyed) return
    this.settleAsPaused()
    this.goToStepInternal(0)
    this.status = 'idle'
    this.events.emit('status', this.status)
  }

  setSpeed(speed: number): void {
    this.timeline.setSpeed(speed)
    this.emitData()
  }

  /* ============ 步骤执行内部 ============ */

  private clearPlayTimer(): void {
    if (this.playTimer !== null) {
      window.clearTimeout(this.playTimer)
      this.playTimer = null
    }
  }

  /** 中断一切运行中的动画与计时,状态停在当前位置 */
  private settleAsPaused(): void {
    this.clearPlayTimer()
    this.timeline.kill()
    this.animatingStep = -1
    if (this.status === 'playing') {
      this.status = 'paused'
      this.events.emit('status', this.status)
    }
  }

  /** 播放中被打断:立即完成当前动画(渲染到目标状态) */
  private finishRunningAnimation(): void {
    const tl = this.timeline.active
    if (tl && this.animatingStep >= 0) {
      tl.progress(1)
    }
    this.timeline.kill()
    this.clearPlayTimer()
    this.animatingStep = -1
  }

  private runNextStep(): void {
    if (this.destroyed) return
    if (this.states.index >= this.stepDefs.length) return

    this.clearPlayTimer()
    this.timeline.kill()
    const stepIndex = this.states.index
    const step = this.stepDefs[stepIndex] as SceneStep

    // 1. 立即推进状态(纯函数折叠)
    const fromIndex = stepIndex
    const newState = this.states.goToState(stepIndex + 1)

    // 2. 创建时间线并渲染动画
    this.animatingStep = stepIndex
    const tl = this.timeline.create(() => this.onStepAnimationDone(step))
    this.render(newState, { animate: true, timeline: tl, fromIndex })

    this.events.emit('step', stepIndex)
    this.emitData()
  }

  private onStepAnimationDone(step: SceneStep): void {
    if (this.destroyed) return
    this.animatingStep = -1
    this.timeline.kill()
    this.emitData()

    if (this.states.index >= this.stepDefs.length) {
      // 最后一步完成
      if (this.status === 'playing') {
        this.status = 'completed'
        this.events.emit('status', this.status)
      }
      return
    }
    if (this.status !== 'playing') return

    const delay = (step.duration ?? 900) / this.timeline.getSpeed()
    this.playTimer = window.setTimeout(() => {
      this.playTimer = null
      if (!this.destroyed && this.status === 'playing') {
        this.runNextStep()
      }
    }, delay)
  }

  /** 按索引重建画面(instant,不播放动画) */
  private goToStepInternal(statesIndex: number): void {
    this.clearPlayTimer()
    this.timeline.kill()
    this.animatingStep = -1
    const state = this.states.goToState(statesIndex)
    this.render(state, { animate: false, timeline: null, fromIndex: Math.max(0, statesIndex - 1) })
    const viewStep = Math.min(statesIndex, this.stepDefs.length - 1)
    this.events.emit('step', viewStep)
    this.emitData()
  }

  /* ============ 快照与事件 ============ */

  private stepStatuses(): StepStatus[] {
    const n = this.stepDefs.length
    const statuses: StepStatus[] = new Array(n).fill('pending')
    const done = this.states.index
    for (let i = 0; i < n; i++) {
      if (i < done) statuses[i] = 'completed'
    }
    const activeIdx = this.animatingStep >= 0 ? this.animatingStep : done < n ? done : -1
    if (activeIdx >= 0 && this.status !== 'idle') {
      statuses[activeIdx] = 'active'
    }
    return statuses
  }

  getState(): SceneStateSnapshot {
    return {
      stepIndex: this.states.index,
      totalSteps: this.stepDefs.length,
      stepStatuses: this.stepStatuses(),
      data: this.snapshotData(this.states.current, this.states.index),
    }
  }

  private emitData(): void {
    this.events.emit('data', this.getState())
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.clearPlayTimer()
    this.timeline.destroy()
    this.renderer.destroy()
    this.events.clear()
  }
}
