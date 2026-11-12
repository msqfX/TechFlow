/** 引擎类型:场景接口与播放器状态(docs §5.4) */

/** 播放器状态 */
export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'completed'

/** 步骤执行状态(右侧步骤面板) */
export type StepStatus = 'pending' | 'active' | 'completed' | 'error'

/** 统一场景接口 */
export interface TutorialScene {
  readonly id: string

  /** 场景事件总线(播放器状态 / 步骤 / 实时数据) */
  readonly events: SceneEventBus

  /** 挂载场景到容器(构建 SVG/Canvas 视图与内部状态) */
  init(container: HTMLElement): Promise<void> | void

  /** 从当前步骤继续自动播放 */
  play(): void

  pause(): void

  nextStep(): void

  previousStep(): void

  /** 跳转任意步骤:根据步骤索引重建场景状态,而不是连续执行动画 */
  goToStep(index: number): void

  /** 重置场景到初始状态 */
  reset(): void

  /** 播放速度(0.5 / 1 / 1.5 / 2) */
  setSpeed(speed: number): void

  /** 实时信息面板数据(来自模拟器实际状态) */
  getState(): unknown

  destroy(): void
}

/** 场景事件总线(最小接口,由 EventBus 实现) */
export interface SceneEventBus {
  on<K extends keyof SceneEventPayloads>(
    event: K,
    handler: (payload: SceneEventPayloads[K]) => void,
  ): () => void
  off<K extends keyof SceneEventPayloads>(
    event: K,
    handler: (payload: SceneEventPayloads[K]) => void,
  ): void
}

/** 实验模式动作的参数声明(由 ActionPanel 渲染输入控件) */
export interface SceneActionParam {
  name: string
  label: string
  type: 'text' | 'number' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
  min?: number
  max?: number
}

/** 实验模式动作:场景可暴露的可操作交互(按钮) */
export interface SceneAction {
  name: string
  label: string
  description?: string
  /** 标记为危险/故障类操作(挑战模式) */
  danger?: boolean
  params?: SceneActionParam[]
}

/** 支持参数操作与故障模拟的场景额外接口 */
export interface InteractiveScene extends TutorialScene {
  /** 当前可用的操作(实验/挑战模式按钮) */
  getActions(): SceneAction[]
  /** 执行操作,如发送帧、清空缓存、模拟丢包 */
  performAction(name: string, params?: Record<string, unknown>): void
}

/** 场景事件(供 Vue UI 订阅) */
export interface SceneEventPayloads {
  /** 播放器状态变化 */
  status: PlayerStatus
  /** 当前步骤索引变化 */
  step: number
  /** 实时状态快照更新 */
  data: SceneStateSnapshot
}

export interface SceneStateSnapshot {
  /** 当前步骤索引 */
  stepIndex: number
  /** 步骤总数 */
  totalSteps: number
  /** 各步骤执行状态 */
  stepStatuses: StepStatus[]
  /** 教程特定实时数据 */
  data: Record<string, unknown>
}

/** 实时信息面板单行数据(scenes 在 data.rows 中输出) */
export interface InfoRow {
  label: string
  value: string
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger'
}

export function isInteractiveScene(scene: TutorialScene): scene is InteractiveScene {
  return 'getActions' in scene && 'performAction' in scene
}
