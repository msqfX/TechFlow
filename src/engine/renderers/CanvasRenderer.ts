/** Canvas 渲染器:用于大量图形的实验(排序可视化等) */
export interface CanvasRendererOptions {
  width: number
  height: number
}

export class CanvasRenderer {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D

  constructor(
    public container: HTMLElement,
    private options: CanvasRendererOptions,
  ) {
    container.classList.add('tf-scene-host')
    this.canvas = document.createElement('canvas')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = options.width * dpr
    this.canvas.height = options.height * dpr
    this.canvas.style.width = '100%'
    this.canvas.style.maxWidth = `${options.width}px`
    this.canvas.classList.add('tf-scene-canvas')
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('CanvasRenderer: 无法获取 2D 上下文')
    this.ctx = ctx
    this.ctx.scale(dpr, dpr)
    container.appendChild(this.canvas)
  }

  get width(): number {
    return this.options.width
  }

  get height(): number {
    return this.options.height
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.options.width, this.options.height)
  }

  destroy(): void {
    this.canvas.remove()
    this.container.classList.remove('tf-scene-host')
  }
}
