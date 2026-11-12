import { gsap } from 'gsap'
import type { SVGRenderer } from '../renderers/SVGRenderer'

export type NodeStatus = 'idle' | 'active' | 'processing' | 'success' | 'error' | 'dim'

export interface NetworkNodeOptions {
  id: string
  x: number
  y: number
  /** 矩形节点尺寸(默认 72x50) */
  width?: number
  height?: number
  shape?: 'rect' | 'circle'
  /** 圆形节点半径(默认 26) */
  radius?: number
  label: string
  /** 节点内部短文字(如 DNS、ALU) */
  glyph?: string
  /** 节点下方补充说明 */
  sublabel?: string
  clickable?: boolean
  onClick?: () => void
}

/**
 * 网络节点:SVG 分组(主体 + 文字 + 状态点)。
 * 位置通过 transform 控制,GSAP 可直接对 group 做 x/y 补间。
 */
export class NetworkNode {
  readonly group: SVGGElement
  readonly body: SVGRectElement | SVGCircleElement
  private sublabelEl: SVGTextElement | null = null
  private status: NodeStatus = 'idle'
  private clickHandler: (() => void) | null = null

  constructor(
    renderer: SVGRenderer,
    public options: NetworkNodeOptions,
  ) {
    const w = options.width ?? 72
    const h = options.height ?? 50
    const svgNs = 'http://www.w3.org/2000/svg'

    this.group = document.createElementNS(svgNs, 'g')
    this.group.classList.add('tf-node')
    this.group.setAttribute('data-node-id', options.id)

    if (options.shape === 'circle') {
      const r = options.radius ?? 26
      this.body = renderer.el('circle', {
        cx: 0,
        cy: 0,
        r,
        class: 'tf-node-body tf-node-circle',
      }, this.group)
    } else {
      this.body = renderer.el('rect', {
        x: -w / 2,
        y: -h / 2,
        width: w,
        height: h,
        rx: 9,
        class: 'tf-node-body',
      }, this.group)
    }

    if (options.glyph) {
      renderer.el('text', {
        x: 0,
        y: 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        class: 'tf-node-glyph',
      }, this.group).textContent = options.glyph
    }

    renderer.el('circle', {
      cx: (options.shape === 'circle' ? (options.radius ?? 26) : w / 2) - 4,
      cy: (options.shape === 'circle' ? -(options.radius ?? 26) : -h / 2) + 4,
      r: 3.5,
      class: 'tf-node-dot',
    }, this.group)

    const label = renderer.el('text', {
      x: 0,
      y: (options.shape === 'circle' ? (options.radius ?? 26) : h / 2) + 16,
      'text-anchor': 'middle',
      class: 'tf-node-label',
    }, this.group)
    label.textContent = options.label

    if (options.sublabel) {
      this.sublabelEl = renderer.el('text', {
        x: 0,
        y: (options.shape === 'circle' ? (options.radius ?? 26) : h / 2) + 31,
        'text-anchor': 'middle',
        class: 'tf-node-sublabel',
      }, this.group)
      this.sublabelEl.textContent = options.sublabel
    }

    this.setPosition(options.x, options.y)
    renderer.layerNodes.appendChild(this.group)

    if (options.clickable) {
      this.group.classList.add('tf-node--clickable')
      if (options.onClick) this.onClick(options.onClick)
    }
  }

  /** 直接设置位置(不动画) */
  setPosition(x: number, y: number): void {
    this.options.x = x
    this.options.y = y
    this.group.setAttribute('transform', `translate(${x} ${y})`)
  }

  /** 动画移动到目标位置(可加入时间线) */
  moveTo(x: number, y: number, timeline?: gsap.core.Timeline, duration = 0.6, position?: number): void {
    if (timeline) {
      timeline.to(this.group, { x, y, duration }, position)
    } else {
      gsap.to(this.group, { x, y, duration })
    }
    this.options.x = x
    this.options.y = y
  }

  setStatus(status: NodeStatus): void {
    this.status = status
    this.group.classList.remove(
      'tf-node--idle',
      'tf-node--active',
      'tf-node--processing',
      'tf-node--success',
      'tf-node--error',
      'tf-node--dim',
    )
    this.group.classList.add(`tf-node--${status}`)
  }

  getStatus(): NodeStatus {
    return this.status
  }

  setSublabel(text: string): void {
    if (this.sublabelEl) this.sublabelEl.textContent = text
  }

  setLabel(text: string): void {
    const label = this.group.querySelector('.tf-node-label')
    if (label) label.textContent = text
  }

  /** 注册点击处理(记录用于销毁) */
  onClick(handler: () => void): void {
    if (this.clickHandler) {
      this.group.removeEventListener('click', this.clickHandler)
    }
    this.clickHandler = handler
    this.group.addEventListener('click', handler)
  }

  /** 快速脉冲(独立短动画,用于点击反馈) */
  pulse(): void {
    gsap.fromTo(
      this.body,
      { scale: 1 },
      { scale: 1.08, duration: 0.18, yoyo: true, repeat: 1, transformOrigin: 'center', overwrite: 'auto' },
    )
  }

  destroy(): void {
    if (this.clickHandler) this.group.removeEventListener('click', this.clickHandler)
    gsap.killTweensOf(this.group)
    gsap.killTweensOf(this.body)
    this.group.remove()
  }
}
