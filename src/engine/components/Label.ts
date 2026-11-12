import type { SVGRenderer } from '../renderers/SVGRenderer'

export interface LabelOptions {
  x: number
  y: number
  text: string
  kind?: 'muted' | 'mono' | 'accent' | 'pill'
  anchor?: 'start' | 'middle' | 'end'
}

/** 文字标签工具 */
export class Label {
  readonly el: SVGTextElement
  private bg: SVGRectElement | null = null

  constructor(
    renderer: SVGRenderer,
    options: LabelOptions,
  ) {
    const kind = options.kind ?? 'muted'
    this.el = renderer.el('text', {
      x: options.x,
      y: options.y,
      'text-anchor': options.anchor ?? 'middle',
      class: `tf-label tf-label--${kind}`,
    }, renderer.layerLabels)
    this.el.textContent = options.text

    if (kind === 'pill') {
      const bbox = this.el.getBBox()
      this.bg = renderer.el('rect', {
        x: bbox.x - 7,
        y: bbox.y - 4,
        width: bbox.width + 14,
        height: bbox.height + 8,
        rx: 8,
        class: 'tf-label-pill-bg',
      }, renderer.layerLabels)
      renderer.layerLabels.appendChild(this.el)
    }
  }

  setText(text: string): void {
    this.el.textContent = text
    if (this.bg) {
      const bbox = this.el.getBBox()
      this.bg.setAttribute('x', String(bbox.x - 7))
      this.bg.setAttribute('y', String(bbox.y - 4))
      this.bg.setAttribute('width', String(bbox.width + 14))
      this.bg.setAttribute('height', String(bbox.height + 8))
    }
  }

  setPosition(x: number, y: number): void {
    this.el.setAttribute('x', String(x))
    this.el.setAttribute('y', String(y))
  }

  destroy(): void {
    this.el.remove()
    this.bg?.remove()
  }
}
