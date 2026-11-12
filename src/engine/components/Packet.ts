import { gsap } from 'gsap'
import type { SVGRenderer } from '../renderers/SVGRenderer'
import type { Connection } from './Connection'

export type PacketColor = 'accent' | 'purple' | 'success' | 'warning' | 'danger'

export interface PacketOptions {
  id: string
  color?: PacketColor
  shape?: 'circle' | 'rect'
  radius?: number
  /** 随包移动的短文字(如 SYN、seq=100) */
  label?: string
  /** 矩形包尺寸 */
  width?: number
  height?: number
}

/**
 * 数据包:沿连线移动的视觉单元。
 * moveThrough 通过补间 {t: 0→1} + pointAt 定位,兼容直线与曲线。
 */
export class Packet {
  readonly group: SVGGElement
  private labelEl: SVGTextElement | null = null

  constructor(
    renderer: SVGRenderer,
    public options: PacketOptions,
  ) {
    const svgNs = 'http://www.w3.org/2000/svg'
    this.group = document.createElementNS(svgNs, 'g')
    this.group.classList.add('tf-packet')
    this.group.setAttribute('data-packet-id', options.id)
    this.group.classList.add(`tf-packet--${options.color ?? 'accent'}`)

    if (options.shape === 'rect') {
      const w = options.width ?? 34
      const h = options.height ?? 22
      renderer.el('rect', {
        x: -w / 2,
        y: -h / 2,
        width: w,
        height: h,
        rx: 5,
        class: 'tf-packet-body-rect',
      }, this.group)
    } else {
      renderer.el('circle', {
        r: options.radius ?? 6,
        class: 'tf-packet-body',
      }, this.group)
    }

    if (options.label) {
      this.labelEl = renderer.el('text', {
        y: options.shape === 'rect' ? 1 : -(options.radius ?? 6) - 8,
        'text-anchor': 'middle',
        'dominant-baseline': options.shape === 'rect' ? 'middle' : 'auto',
        class: 'tf-packet-label',
      }, this.group)
      this.labelEl.textContent = options.label
    }

    renderer.layerPackets.appendChild(this.group)
    this.group.style.opacity = '0'
  }

  setLabel(text: string | undefined): void {
    if (!this.labelEl) return
    this.labelEl.textContent = text ?? ''
    this.labelEl.style.display = text ? '' : 'none'
  }

  /** 直接放置 */
  placeAt(x: number, y: number): void {
    this.group.setAttribute('transform', `translate(${x} ${y})`)
  }

  placeOn(connection: Connection, t: number): void {
    const p = connection.pointAt(t)
    this.placeAt(p.x, p.y)
  }

  show(visible = true): void {
    this.group.style.opacity = visible ? '1' : '0'
  }

  /**
   * 沿连线从 tFrom 移动到 tTo。
   * 传入 timeline 时登记为时间线补间(步骤动画);否则独立运行。
   */
  moveThrough(
    connection: Connection,
    opts: {
      fromT?: number
      toT?: number
      duration?: number
      timeline?: gsap.core.Timeline
      position?: number
      onStart?: () => void
      onComplete?: () => void
    },
  ): void {
    const proxy = { t: opts.fromT ?? 0 }
    const tween = () => {
      gsap.to(proxy, {
        t: opts.toT ?? 1,
        duration: (opts.duration ?? 800) / 1000,
        ease: 'none',
        onUpdate: () => {
          const p = connection.pointAt(proxy.t)
          this.group.setAttribute('transform', `translate(${p.x} ${p.y})`)
        },
        onStart: () => this.show(true),
        onComplete: opts.onComplete,
      })
    }
    if (opts.timeline) {
      opts.timeline.add(tween, opts.position ?? '>')
    } else {
      tween()
    }
  }

  destroy(): void {
    gsap.killTweensOf(this.group)
    this.group.remove()
  }
}
