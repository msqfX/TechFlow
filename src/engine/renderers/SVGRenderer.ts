/** SVG 渲染器:创建分层画布,提供元素构建工具与销毁 */
export interface SVGRendererOptions {
  viewBoxWidth: number
  viewBoxHeight: number
  className?: string
  label?: string
}

type Attrs = Record<string, string | number | undefined>

export class SVGRenderer {
  readonly svg: SVGSVGElement
  readonly defs: SVGDefsElement
  /** 最底层:大面板背景矩形(必须在所有内容之下) */
  readonly layerBg: SVGGElement
  readonly layerLinks: SVGGElement
  readonly layerPackets: SVGGElement
  readonly layerNodes: SVGGElement
  readonly layerLabels: SVGGElement
  readonly layerOverlay: SVGGElement

  constructor(
    public container: HTMLElement,
    private options: SVGRendererOptions,
  ) {
    container.classList.add('tf-scene-host')

    const svgNs = 'http://www.w3.org/2000/svg'
    this.svg = document.createElementNS(svgNs, 'svg')
    this.svg.setAttribute('viewBox', `0 0 ${options.viewBoxWidth} ${options.viewBoxHeight}`)
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    this.svg.classList.add('tf-scene')
    if (options.className) this.svg.classList.add(options.className)
    if (options.label) {
      this.svg.setAttribute('role', 'img')
      this.svg.setAttribute('aria-label', options.label)
    }

    this.defs = document.createElementNS(svgNs, 'defs')
    this.layerBg = document.createElementNS(svgNs, 'g')
    this.layerLinks = document.createElementNS(svgNs, 'g')
    this.layerPackets = document.createElementNS(svgNs, 'g')
    this.layerNodes = document.createElementNS(svgNs, 'g')
    this.layerLabels = document.createElementNS(svgNs, 'g')
    this.layerOverlay = document.createElementNS(svgNs, 'g')
    this.layerLinks.classList.add('tf-layer-links')
    this.layerPackets.classList.add('tf-layer-packets')
    this.layerNodes.classList.add('tf-layer-nodes')
    this.layerLabels.classList.add('tf-layer-labels')
    this.layerOverlay.classList.add('tf-layer-overlay')

    this.svg.append(
      this.defs,
      this.layerBg,
      this.layerLinks,
      this.layerPackets,
      this.layerNodes,
      this.layerLabels,
      this.layerOverlay,
    )
    this.buildMarkers()
    container.appendChild(this.svg)
  }

  /** 注入箭头 marker(按语义色) */
  private buildMarkers(): void {
    const colors: Record<string, string> = {
      muted: 'var(--text-3)',
      accent: 'var(--accent-bright)',
      success: 'var(--success)',
      danger: 'var(--danger)',
    }
    for (const [name, color] of Object.entries(colors)) {
      this.el(
        'marker',
        {
          id: `tf-arrow-${name}`,
          viewBox: '0 0 10 10',
          refX: 8,
          refY: 5,
          markerWidth: 6,
          markerHeight: 6,
          orient: 'auto-start-reverse',
        },
        this.defs,
      ).appendChild(this.el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }))
    }
  }

  get width(): number {
    return this.options.viewBoxWidth
  }

  get height(): number {
    return this.options.viewBoxHeight
  }

  /** 创建 SVG 元素并设置属性 */
  el<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs?: Attrs,
    parent?: Element,
  ): SVGElementTagNameMap[K] {
    const svgNs = 'http://www.w3.org/2000/svg'
    const node = document.createElementNS(svgNs, tag)
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined) node.setAttribute(k, String(v))
      }
    }
    ;(parent ?? this.svg).appendChild(node)
    return node
  }

  /** 清空一个图层 */
  clear(layer: 'links' | 'packets' | 'nodes' | 'labels' | 'overlay'): void {
    const target = {
      links: this.layerLinks,
      packets: this.layerPackets,
      nodes: this.layerNodes,
      labels: this.layerLabels,
      overlay: this.layerOverlay,
    }[layer]
    while (target.firstChild) target.removeChild(target.firstChild)
  }

  /** 把 SVG 坐标转换为容器内像素坐标(用于 Tooltip 定位) */
  svgPointToContainer(x: number, y: number): { x: number; y: number } {
    const ctm = this.svg.getScreenCTM()
    const rect = this.container.getBoundingClientRect()
    if (!ctm) return { x, y }
    const pt = this.svg.createSVGPoint()
    pt.x = x
    pt.y = y
    const transformed = pt.matrixTransform(ctm)
    return { x: transformed.x - rect.left, y: transformed.y - rect.top }
  }

  destroy(): void {
    this.svg.remove()
    this.container.classList.remove('tf-scene-host')
  }
}
