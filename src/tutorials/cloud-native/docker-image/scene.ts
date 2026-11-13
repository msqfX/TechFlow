import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import type { GsapTimeline } from '@/engine/types/animation'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { buildImage, createDockerfileState, sharedLayerCount } from './model'
import type { DockerfileState, DockerFileBuildResult } from './model'

/** Docker 镜像场景:Dockerfile 面板 + 层堆叠 + 共享复用(两镜像) */

const VIEW = { width: 840, height: 620 }
const LAYER_X = 80
const LAYER_W = 300
const LAYER_H = 34
const LAYER_STEP = 40

interface BuildSpec {
  name: string
  directives: Array<{ cmd: string; sizeMB: number }>
}

const BUILD_B: BuildSpec = {
  name: 'worker-app',
  directives: [
    { cmd: 'RUN apt-get install worker-deps', sizeMB: 60 },
    { cmd: 'COPY worker.js /app/', sizeMB: 8 },
  ],
}

class DockerImageScene extends BaseScene<DockerfileState> {
  private layerRows: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; shared: SVGTextElement }> = []
  private dockerfileLines: SVGTextElement[] = []
  private statsChips: SVGTextElement[] = []
  private live: DockerfileState | null = null

  constructor() {
    super({ id: 'docker-image', viewBox: VIEW, label: '镜像分层构建与复用' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // Dockerfile 面板(左)
    renderer.el('rect', { x: 50, y: 90, width: 340, height: 250, rx: 12, class: 'tf-ip-card' }, renderer.layerBg)
    renderer.el('text', { x: 68, y: 116, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      'Dockerfile(指令 → 层)'
    this.dockerfileLines = []
    for (let i = 0; i < 6; i++) {
      const line = renderer.el('text', { x: 68, y: 146 + i * 30, class: 'tf-subnet-mono' }, renderer.layerLabels)
      this.dockerfileLines.push(line)
    }

    // 层堆叠(中)
    new Label(renderer, { x: LAYER_X, y: 380, text: '镜像层(自底向上堆叠,只读)', kind: 'accent', anchor: 'start' })
    this.layerRows = []
    for (let i = 0; i < 6; i++) {
      const y = 396 - i * LAYER_STEP - LAYER_H
      const g = renderer.el('g', {}, renderer.layerNodes)
      const rect = renderer.el('rect', { x: LAYER_X, y: y + 380 - 380 + 340, width: LAYER_W, height: LAYER_H, rx: 7, class: 'tf-jvm-frame' }, g)
      const text = renderer.el('text', { x: LAYER_X + LAYER_W / 2, y: y + 380 - 380 + 340 + LAYER_H / 2 + 5, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, g)
      const shared = renderer.el('text', { x: LAYER_X + LAYER_W + 14, y: y + 380 - 380 + 340 + LAYER_H / 2 + 5, class: 'tf-subnet-result' }, g)
      g.style.opacity = '0'
      this.layerRows.push({ g, rect, text, shared })
    }

    // 统计(右)
    renderer.el('rect', { x: 560, y: 90, width: 250, height: 250, rx: 12, class: 'tf-ip-card' }, renderer.layerBg)
    renderer.el('text', { x: 578, y: 116, class: 'tf-label--accent' }, renderer.layerLabels).textContent = '统计'
    this.statsChips = []
    const stats = ['镜像数', '层总数', '共享层', '缓存命中', '总大小']
    stats.forEach((s, i) => {
      renderer.el('text', { x: 578, y: 146 + i * 34, class: 'tf-label--muted' }, renderer.layerLabels).textContent = s
      const v = renderer.el('text', { x: 792, y: 146 + i * 34, 'text-anchor': 'end', class: 'tf-cpu-value' }, renderer.layerLabels)
      this.statsChips.push(v)
    })

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 24, text: '层 ID = sha256(内容) —— 内容不变则 ID 不变 → 天然去重与构建缓存', kind: 'muted' })
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 4, text: '挑战:构建第二个镜像(worker-app),观察基础层/依赖层被复用', kind: 'muted' })
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: '已有镜像 my-app(2 层)',
        description: 'FROM debian:slim + RUN runtime —— 基础层全网共享。',
        explanation: `镜像 = **只读层的堆叠**,每层 ID 是其内容的 **sha256**(内容寻址):内容相同 = ID 相同 = 磁盘/传输只存一份。左侧是构建它的 Dockerfile:每条改文件系统的指令生成一层;CMD 类元数据指令不生成层。`,
        duration: 1200,
        action: 'init',
      },
      {
        id: 'build-b',
        title: '构建第二个镜像 worker-app',
        description: 'FROM 同基础 → RUN worker-deps → COPY worker.js。',
        explanation: `构建第二个镜像:第一条 FROM 直接**复用已存在的基础层**(内容寻址相同,Already exists);RUN worker-deps 是新内容 → 新建层;COPY worker.js 同理。右侧统计显示两镜像的**共享层数** —— 磁盘与传输都只付一份钱。`,
        duration: 1500,
        action: 'build-b',
      },
      {
        id: 'cache',
        title: '重建 my-app:构建缓存全命中',
        description: 'Dockerfile 未变 → 每一层都复用缓存,秒完成。',
        explanation: `重新构建相同 Dockerfile:每一层的指令与上下文都未变 → **全部缓存命中**,零成本完成。这就是 Dockerfile 排序原则的原理:**稳定指令(依赖安装)放前面吃缓存,易变指令(源码 COPY)放最后**,只重建薄薄几层。`,
        duration: 1400,
        action: 'cache',
      },
      {
        id: 'run',
        title: 'docker run:叠加可写层',
        description: '容器 = 镜像只读层 + 独立可写层。',
        explanation: `run 时在镜像顶部挂**空的可写层**:容器内写文件是写时复制(CoW)—— 从只读层复制到可写层再改。同一镜像跑 N 个容器,只读层共享、可写层各自独立(对照《Docker 容器原理》)。`,
        duration: 1300,
        action: 'run',
      },
    ]

    const transitions: StepTransition<DockerfileState>[] = [
      () => createDockerfileState(),
      s0 => {
        const r: DockerFileBuildResult = buildImage(s0, BUILD_B.name, BUILD_B.directives)
        return { images: r.images, buildLog: r.buildLog, cacheHits: s0.cacheHits + r.cacheHits, totalSizeMB: r.totalSizeMB, log: [...s0.log, ...r.buildLog] }
      },
      s0 => {
        const r: DockerFileBuildResult = buildImage(s0, 'my-app', [
          { cmd: 'RUN apt-get install runtime', sizeMB: 120 },
          { cmd: 'COPY app.jar /app/', sizeMB: 45 },
        ])
        return { ...s0, cacheHits: s0.cacheHits + r.cacheHits, log: [...s0.log, ...r.buildLog, '重建 my-app:全部层缓存命中 ✓'] }
      },
      s0 => ({ ...s0, log: [...s0.log, 'docker run my-app:叠加空可写层 —— 容器内写入走 CoW'] }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): DockerfileState {
    return createDockerfileState()
  }

  private effectiveState(stepState: DockerfileState): DockerfileState {
    return this.live ?? stepState
  }

  protected render(stepState: DockerfileState, _opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)

    // Dockerfile 行
    const dfLines = [
      'FROM debian:slim',
      'RUN apt-get install runtime',
      'COPY app.jar /app/',
      ...(state.buildLog.some(l => l.includes('worker-deps')) ? ['FROM + RUN worker-deps(第二镜像)'] : []),
    ]
    this.dockerfileLines.forEach((line, i) => {
      line.textContent = dfLines[i] ?? ''
    })

    // 层堆叠(取镜像 my-app 或最新构建)
    const img = state.images[0]
    const layers = img?.layers ?? []
    const n = layers.length
    for (let i = 0; i < this.layerRows.length; i++) {
      const row = this.layerRows[i]
      if (!row) continue
      const layer = layers[i]
      const visible = layer !== undefined
      const target = visible ? '1' : '0'
      if (layer) {
        if (row.text) row.text.textContent = `${i + 1}. ${layer.directive}(${layer.sizeMB}MB)`
        if (row.shared) row.shared.textContent = layer.shared || i < n - 2 ? '共享 ✓' : '私有'
        if (row.rect) row.rect.setAttribute('class', `tf-jvm-frame ${i === n - 1 ? 'is-front' : ''}`)
      }
      row.g.style.opacity = target
    }

    const shared = sharedLayerCount(state)
    const stats = [
      String(state.images.length),
      String(state.images.reduce((a, img) => a + img.layers.length, 0)),
      String(shared),
      String(state.cacheHits),
      `${state.totalSizeMB}MB`,
    ]
    this.statsChips.forEach((el, i) => {
      el.textContent = stats[i] ?? ''
    })
  }

  protected snapshotData(stepState: DockerfileState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const img = state.images[0]
    return {
      rows: [
        { label: '镜像数', value: String(state.images.length), tone: 'accent' },
        { label: '层(每镜像)', value: img ? `${img.layers.length} 层 / ${img.name}` : '—' },
        { label: '共享层(跨镜像)', value: String(sharedLayerCount(state)), tone: 'success' },
        { label: '基础层', value: 'debian:slim(77MB,全网共享一份)' },
        { label: '缓存命中', value: `${state.cacheHits} 次`, tone: state.cacheHits ? 'success' : 'default' },
        { label: 'my-app 总大小', value: `${state.totalSizeMB}MB` },
        { label: '层 ID', value: 'sha256(内容) —— 不可篡改、天然去重' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.buildLog.length ? state.buildLog[state.buildLog.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'build-b', label: '构建第二个镜像', description: '观察基础层/依赖层的复用。' },
      { name: 'rebuild', label: '重建 my-app(缓存全命中)' },
      { name: 'reset', label: '复位' },
    ]
  }

  performAction(name: string): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: DockerfileState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'build-b': {
        const r = buildImage(base(), BUILD_B.name, BUILD_B.directives)
        apply({ images: r.images, buildLog: [...base().buildLog, ...r.buildLog], cacheHits: base().cacheHits + r.cacheHits, totalSizeMB: r.totalSizeMB, log: r.buildLog })
        break
      }
      case 'rebuild': {
        const r = buildImage(base(), 'my-app', [
          { cmd: 'RUN apt-get install runtime', sizeMB: 120 },
          { cmd: 'COPY app.jar /app/', sizeMB: 45 },
        ])
        apply({ ...base(), cacheHits: base().cacheHits + r.cacheHits, buildLog: [...base().buildLog, ...r.buildLog] })
        break
      }
      case 'reset':
        this.live = null
        this.render(this.states.current, { animate: false, timeline: null, fromIndex: 0 })
        this.events.emit('data', this.getState())
        break
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new DockerImageScene(),
}

export default sceneModule
