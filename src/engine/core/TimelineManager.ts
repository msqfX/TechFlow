import { gsap } from 'gsap'

/**
 * GSAP 时间线管理器:每个步骤一个时间线,支持速度缩放与销毁。
 * 场景销毁或跳转时必须 kill(),避免幽灵动画残留(docs §5.7)。
 */
export class TimelineManager {
  private timeline: gsap.core.Timeline | null = null
  private speed = 1

  /** 创建(并替换)当前时间线;可选完成回调 */
  create(onComplete?: () => void): gsap.core.Timeline {
    this.kill()
    const tl = gsap.timeline({
      onComplete: () => {
        onComplete?.()
      },
    })
    tl.timeScale(this.speed)
    this.timeline = tl
    return tl
  }

  get active(): gsap.core.Timeline | null {
    return this.timeline
  }

  setSpeed(speed: number): void {
    this.speed = speed
    this.timeline?.timeScale(speed)
  }

  getSpeed(): number {
    return this.speed
  }

  pause(): void {
    this.timeline?.pause()
  }

  resume(): void {
    this.timeline?.play()
  }

  kill(): void {
    if (this.timeline) {
      this.timeline.kill()
      this.timeline = null
    }
  }

  destroy(): void {
    this.kill()
  }
}
