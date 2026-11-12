/**
 * gsap 时间线类型的统一别名(场景与引擎共用)。
 * gsap 的类型通过其 UMD 全局命名空间获得,无需 import。
 */
export type GsapTimeline = gsap.core.Timeline

/** 动画任务描述:用于在时间线上登记一段动画 */
export interface AnimationTask {
  /** 动画时长(ms),已按语义写死,不随 speed 改变(由 timeScale 统一缩放) */
  duration: number
  /** 完成回调 */
  onComplete?: () => void
}

export type EaseKind = 'power1.out' | 'power2.out' | 'power2.inOut' | 'back.out(1.4)' | 'none'

export const DEFAULT_DURATION = 700
