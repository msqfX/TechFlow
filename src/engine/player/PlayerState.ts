import type { PlayerStatus, SceneStateSnapshot, StepStatus } from '../types/scene'

/** 播放器 UI 状态(纯 reducer,便于测试) */
export interface PlayerState {
  status: PlayerStatus
  completedSteps: number
  totalSteps: number
  stepStatuses: StepStatus[]
  speed: number
  data: Record<string, unknown>
}

export type PlayerAction =
  | { type: 'status'; status: PlayerStatus }
  | { type: 'snapshot'; snapshot: SceneStateSnapshot }
  | { type: 'speed'; speed: number }
  | { type: 'reset'; totalSteps: number }

export function createInitialPlayerState(totalSteps = 0): PlayerState {
  return {
    status: 'idle',
    completedSteps: 0,
    totalSteps,
    stepStatuses: new Array<StepStatus>(totalSteps).fill('pending'),
    speed: 1,
    data: {},
  }
}

export function reducePlayerState(prev: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'status':
      return { ...prev, status: action.status }
    case 'snapshot':
      return {
        ...prev,
        completedSteps: action.snapshot.stepIndex,
        totalSteps: action.snapshot.totalSteps,
        stepStatuses: action.snapshot.stepStatuses,
        data: action.snapshot.data,
      }
    case 'speed':
      return { ...prev, speed: action.speed }
    case 'reset':
      return createInitialPlayerState(action.totalSteps)
    default:
      return prev
  }
}
