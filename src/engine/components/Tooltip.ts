import type { SVGRenderer } from '../renderers/SVGRenderer'

/** SVG 坐标系上的 HTML Tooltip */
export class Tooltip {
  private el: HTMLDivElement

  constructor(
    private renderer: SVGRenderer,
    maxWidth = 260,
  ) {
    this.el = document.createElement('div')
    this.el.className = 'tf-tooltip'
    this.el.style.maxWidth = `${maxWidth}px`
    this.el.style.display = 'none'
    renderer.container.appendChild(this.el)
  }

  /** content 支持 HTML(内容为仓库内可信文案) */
  show(svgX: number, svgY: number, content: string): void {
    const pos = this.renderer.svgPointToContainer(svgX, svgY)
    this.el.innerHTML = content
    this.el.style.display = 'block'
    // 边界修正:防止溢出容器
    const rect = this.el.getBoundingClientRect()
    const hostRect = this.renderer.container.getBoundingClientRect()
    let x = pos.x + 14
    let y = pos.y - 10
    if (x + rect.width > hostRect.width - 8) x = pos.x - rect.width - 14
    if (y + rect.height > hostRect.height - 8) y = hostRect.height - rect.height - 8
    if (y < 4) y = 4
    this.el.style.left = `${Math.max(4, x)}px`
    this.el.style.top = `${y}px`
  }

  hide(): void {
    this.el.style.display = 'none'
  }

  destroy(): void {
    this.el.remove()
  }
}
