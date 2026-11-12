import type { SVGRenderer } from '../renderers/SVGRenderer'
import type { NetworkNode } from './NetworkNode'

export interface Point {
  x: number
  y: number
}

export interface ConnectionOptions {
  id: string
  from: Point | NetworkNode
  to: Point | NetworkNode
  /** 二次贝塞尔曲线弯曲程度(0 = 直线) */
  curvature?: number
  dashed?: boolean
  /** 是否带箭头(默认 true) */
  arrow?: boolean
  /** 箭头颜色类:accent | success | danger | muted */
  arrowColor?: 'accent' | 'success' | 'danger' | 'muted'
  label?: string
}

function endpoint(p: Point | NetworkNode): Point {
  if ('group' in p) return { x: p.options.x, y: p.options.y }
  return p
}

/**
 * 连线:支持直线/曲线、虚线流动画与箭头。
 * path 元素同时作为数据包移动的轨迹(getPointAtLength)。
 */
export class Connection {
  readonly path: SVGPathElement
  readonly d: string
  private labelEl: SVGTextElement | null = null
  private labelBg: SVGRectElement | null = null

  constructor(
    renderer: SVGRenderer,
    public options: ConnectionOptions,
  ) {
    const a = endpoint(options.from)
    const b = endpoint(options.to)
    const curvature = options.curvature ?? 0

    let midX = (a.x + b.x) / 2
    let midY = (a.y + b.y) / 2
    if (curvature !== 0) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      // 垂直方向偏移
      midX += -dy * curvature * 0.25
      midY += dx * curvature * 0.25
    }
    this.d = curvature !== 0 ? `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}` : `M ${a.x} ${a.y} L ${b.x} ${b.y}`

    this.path = renderer.el('path', {
      d: this.d,
      class: [
        'tf-link',
        options.dashed ? 'tf-link--dashed' : '',
        options.arrow === false ? '' : `tf-link--arrow tf-arrow-${options.arrowColor ?? 'muted'}`,
      ]
        .filter(Boolean)
        .join(' '),
      'data-link-id': options.id,
    }, renderer.layerLinks)

    if (options.label) {
      this.labelBg = renderer.el('rect', { rx: 5, class: 'tf-label-pill-bg' }, renderer.layerLinks)
      this.labelEl = renderer.el('text', {
        x: midX,
        y: midY,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        class: 'tf-label-pill',
      }, renderer.layerLinks)
      this.labelEl.textContent = options.label
      const bbox = this.labelEl.getBBox()
      this.labelBg.setAttribute('x', String(bbox.x - 6))
      this.labelBg.setAttribute('y', String(bbox.y - 3))
      this.labelBg.setAttribute('width', String(bbox.width + 12))
      this.labelBg.setAttribute('height', String(bbox.height + 6))
    }
  }

  /** 路径上参数 t(0~1)处的坐标 */
  pointAt(t: number): Point {
    const clamped = Math.min(1, Math.max(0, t))
    const len = this.path.getTotalLength()
    if (len === 0) return endpoint(this.options.from)
    const p = this.path.getPointAtLength(len * clamped)
    return { x: p.x, y: p.y }
  }

  get totalLength(): number {
    return this.path.getTotalLength()
  }

  /** 激活数据流效果(虚线流动) */
  setActive(active: boolean): void {
    this.path.classList.toggle('tf-link--flow', active)
  }

  setDim(dim: boolean): void {
    this.path.classList.toggle('tf-link--dim', dim)
  }

  /** 高亮(成功/错误等语义色) */
  setKind(kind: 'default' | 'success' | 'danger' | 'accent'): void {
    this.path.classList.remove('tf-link--success', 'tf-link--danger', 'tf-link--accent')
    if (kind !== 'default') this.path.classList.add(`tf-link--${kind}`)
  }

  destroy(): void {
    this.path.remove()
    this.labelEl?.remove()
    this.labelBg?.remove()
  }
}
