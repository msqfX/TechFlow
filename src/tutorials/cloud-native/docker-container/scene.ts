import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  NAMESPACE_KINDS,
  IMAGE_LAYERS,
  createDockerState,
  dockerRun,
  hostProcessCount,
  stopContainer,
  toggleCgroups,
  writeFile,
} from './model'
import type { DockerState } from './model'

/** Docker 场景:宿主机内核 + 容器进程 + 隔离维度开关 + 镜像分层 */

const VIEW = { width: 840, height: 620 }
const CONTAINER_X = [110, 480]
const CONTAINER_Y = 170
const CONTAINER_W = 300

class DockerScene extends BaseScene<DockerState> {
  private kernelBar: SVGTextElement | null = null
  private procChip: SVGTextElement | null = null
  private containerGroups = new Map<string, SVGGElement>()
  private nsChips: Array<{ g: SVGGElement; text: SVGTextElement }> = []
  private cgroupChip: SVGTextElement | null = null
  private layerLabels: SVGTextElement[] = []
  private writableLabels: SVGTextElement[] = []
  private vmNote: SVGTextElement | null = null
  private live: DockerState | null = null

  constructor() {
    super({ id: 'docker-container', viewBox: VIEW, label: '容器 = 隔离 + 限额的进程' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // 宿主机内核
    renderer.el('rect', { x: 40, y: 90, width: 760, height: 420, rx: 14, class: 'tf-cpu-block' }, renderer.layerBg)
    renderer.el('text', { x: 58, y: 116, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '宿主机 Linux 内核(所有容器共享 —— 容器不是虚拟机)'
    this.kernelBar = renderer.el('text', { x: 58, y: 140, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.procChip = renderer.el('text', { x: 620, y: 140, class: 'tf-subnet-mono' }, renderer.layerLabels)

    // 隔离维度开关(左)
    new Label(renderer, { x: 60, y: 174, text: 'Namespace 隔离维度(点击开关对照)', kind: 'accent', anchor: 'start' })
    this.nsChips = []
    NAMESPACE_KINDS.forEach((k, i) => {
      const chip = renderer.el('text', { x: 70, y: 200 + i * 30, class: 'tf-subnet-mono', 'data-ns': k.kind }, renderer.layerLabels)
      this.nsChips.push({ g: chip, text: chip })
      void i
    })

    // Cgroups
    this.cgroupChip = renderer.el('text', { x: 70, y: 200 + NAMESPACE_KINDS.length * 30 + 8, class: 'tf-subnet-mono' }, renderer.layerLabels)

    // 镜像分层(右)
    new Label(renderer, { x: 70, y: 430, text: '镜像分层(只读,多容器共享)+ 容器可写层', kind: 'accent', anchor: 'start' })
    this.layerLabels = []
    IMAGE_LAYERS.forEach((l, i) => {
      const t = renderer.el('text', { x: 80, y: 456 + i * 26, class: 'tf-subnet-mono' }, renderer.layerLabels)
      t.textContent = `${i + 1}. ${l}`
      this.layerLabels.push(t)
    })
    this.writableLabels = []
    CONTAINER_X.forEach((x, i) => {
      const box = renderer.el('rect', { x, y: CONTAINER_Y, width: CONTAINER_W, height: 250, rx: 12, class: 'tf-mem-block' }, renderer.layerBg)
      this.containerGroups.set(`c${i}`, box)
      const title = renderer.el('text', { x: x + 16, y: CONTAINER_Y + 28, class: 'tf-http-title' }, renderer.layerLabels)
      title.textContent = `容器 ${i + 1}`
      const w = renderer.el('text', { x: x + 16, y: CONTAINER_Y + 250 - 30, class: 'tf-subnet-mono' }, renderer.layerLabels)
      this.writableLabels.push(w)
    })
    // 可写层标注
    renderer.el('rect', { x: CONTAINER_X[0]! + 10, y: CONTAINER_Y + 180, width: CONTAINER_W - 20, height: 40, rx: 7, class: 'tf-subnet-row-bg' }, renderer.layerNodes)
    renderer.el('text', { x: CONTAINER_X[0]! + 20, y: CONTAINER_Y + 206, class: 'tf-subnet-mono' }, renderer.layerLabels).textContent = '可写层(容器销毁即丢)'

    // VM 对照
    this.vmNote = renderer.el('text', { x: VIEW.width / 2, y: VIEW.height - 26, 'text-anchor': 'middle', class: 'tf-label--muted' }, renderer.layerLabels)
    this.vmNote.textContent = '对照虚拟机:VM 每台带完整客户 OS(GB 级、分钟启动);容器共享内核(MB 级、毫秒启动)'

  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'not-vm',
        title: '容器不是虚拟机',
        description: '容器 = 宿主机上一个被隔离 + 限额的普通进程。',
        explanation: `虚拟机在硬件上虚拟完整计算机,每台带**完整客户操作系统**(GB 级、分钟启动)。容器只是宿主机上的**普通进程**,靠内核三件套「变魔术」:**Namespace**(视图隔离:看不见别人)、**Cgroups**(用量限额:CPU/内存配额)、**UnionFS**(镜像分层)。因为共享宿主机内核,镜像 MB 级、启动毫秒级 —— 「轻」是本质。`,
        duration: 1400,
        action: 'not-vm',
      },
      {
        id: 'namespace',
        title: 'Namespace:视图隔离的六面墙',
        description: 'PID/NET/MNT/UTS/IPC/USER —— 每面墙挡一类「看见」。',
        explanation: `Namespace 让进程「看到」独立的世界:**PID**(容器内自己从 1 号编号)、**NET**(独立网卡/IP/端口空间,两个容器都能监听 8080)、**MNT**(独立文件系统视图)、**UTS**(独立主机名)、**IPC/USER**。本质只是内核对象的**视图过滤** —— 进程在内核里还是那些进程,只是戴上了「只能看见自己人」的眼镜。左侧开关可以逐个关掉,看没有它会发生什么。`,
        duration: 1500,
        action: 'namespace',
      },
      {
        id: 'cgroups',
        title: 'Cgroups:限额与计量',
        description: 'CPU 配额分时、内存超限 OOM。',
        explanation: `Namespace 只解决「看不见」,**Cgroups** 解决「用不超」:CPU 按配额分时(--cpus=1.5)、内存超限触发 **OOM Killer** 杀容器进程 —— 容器 OOM 的直接原因。这也是 JVM 内存参数总配错的根源:老 JVM 看到的是宿主机总内存而非容器限额(Java 10+ 已修复)。`,
        duration: 1400,
        action: 'cgroups',
      },
      {
        id: 'layers',
        title: '镜像分层与可写层',
        description: '只读层共享 + 顶部可写层(写时复制)。',
        explanation: `镜像由**只读层**堆叠(基础层 + 依赖层 + 应用层),容器启动时在顶部挂**可写层**。同一镜像的多个容器**共享只读层**(拉一次全机复用,镜像因此小);容器内写文件是**写时复制(CoW)**:从只读层复制到可写层再改。**容器销毁可写层即丢** —— 数据库/日志必须挂 Volume。`,
        duration: 1500,
        action: 'layers',
      },
      {
        id: 'run-second',
        title: '启动第二个容器:共享内核,互不干扰',
        description: '同一镜像再起一个容器 —— 隔离视图 + 共享只读层。',
        explanation: `第二个容器:同样共享宿主机内核与只读镜像层,但拥有**独立的 Namespace 视图**(自己的 1 号进程、自己的端口空间)与**独立的可写层**。对照左侧开关:如果关掉 PID/NET 隔离,两容器进程互见、端口冲突 —— 隔离的本质就是「内核视图过滤」。`,
        duration: 1400,
        action: 'run-second',
      },
    ]

    const transitions: StepTransition<DockerState>[] = [
      () => createDockerState(),
      s => dockerRun(s, 'web-app'),
      s => toggleCgroups(s),
      s => writeFile(s, 'c-1', 30),
      s => dockerRun(s, 'web-app-2'),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): DockerState {
    return createDockerState()
  }

  private effectiveState(stepState: DockerState): DockerState {
    return this.live ?? stepState
  }

  protected render(stepState: DockerState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline
    void tl

    if (this.kernelBar) {
      this.kernelBar.textContent = `宿主机进程表:${hostProcessCount(state)} 个进程(容器进程混在其中,靠 Namespace 过滤视图)`
    }
    if (this.procChip) {
      this.procChip.textContent = `运行中容器:${state.containers.filter(c => c.status === 'running').length}`
    }

    // 隔离维度芯片
    this.nsChips.forEach(chip => {
      const kind = chip.text.getAttribute('data-ns') as keyof typeof state.namespaceEnabled
      if (!kind) return
      const on = state.namespaceEnabled[kind]
      chip.text.textContent = `${on ? '✓' : '✗'} ${NAMESPACE_KINDS.find(k => k.kind === kind)?.label ?? ''}`
      chip.text.setAttribute('class', `tf-subnet-mono ${on ? 'ok' : 'bad'}`)
    })
    if (this.cgroupChip) {
      this.cgroupChip.textContent = `${state.cgroupEnabled ? '✓' : '✗'} Cgroups 资源限额`
      this.cgroupChip.setAttribute('class', `tf-subnet-mono ${state.cgroupEnabled ? 'ok' : 'bad'}`)
    }

    // 容器标题(含状态)
    state.containers.forEach((c, i) => {
      const box = this.writableLabels[i]
      if (box) box.textContent = `可写层:${c.writableMB}MB · ${c.status === 'oom-killed' ? '⚠ OOM Killed' : c.status === 'stopped' ? '已停止(数据丢失)' : `限额 ${c.memLimitMB ?? '∞'}MB`}`
    })

    // 容器组透明度
    this.containerGroups.forEach((g, key) => {
      const idx = Number(key.replace('c', ''))
      const target = state.containers[idx] ? '1' : '0'
      g.style.opacity = target
    })
  }

  protected snapshotData(stepState: DockerState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const nsSummary = NAMESPACE_KINDS.map(k => `${k.kind}:${state.namespaceEnabled[k.kind] ? '✓' : '✗'}`).join(' ')
    return {
      rows: [
        { label: '容器数', value: String(state.containers.length), tone: 'accent' },
        { label: '内核', value: '共享宿主机 Linux 内核(非虚拟机)' },
        { label: 'Namespace', value: nsSummary, tone: Object.values(state.namespaceEnabled).every(Boolean) ? 'success' : 'warning' },
        { label: 'Cgroups', value: state.cgroupEnabled ? '限额开启(内存 512MB / CPU 100%)' : '关闭(可吃光宿主机!)', tone: state.cgroupEnabled ? 'success' : 'danger' },
        { label: '宿主机进程表', value: `${hostProcessCount(state)} 个进程` },
        { label: '镜像层', value: `${IMAGE_LAYERS.length} 层只读(多容器共享)`, tone: 'success' },
        { label: '容器状态', value: state.containers.map(c => `${c.name}:${c.status}`).join(' | ') || '(无)', tone: state.containers.some(c => c.status === 'oom-killed') ? 'danger' : 'default' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'run', label: 'docker run 启动容器' },
      { name: 'write', label: '容器内写文件(30MB)', description: '写时复制到可写层;超限触发 OOM。', danger: true },
      { name: 'toggle-cgroups', label: '开关 Cgroups 限额', description: '挑战:关掉限额,容器可吃光宿主机资源。', danger: true },
      { name: 'stop', label: '停止容器(可写层丢弃)', danger: true },
      { name: 'reset', label: '复位' },
    ]
  }

  performAction(name: string): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: DockerState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'run': {
        let st = dockerRun(base(), `app-${base().containers.length + 1}`)
        if (st.containers.length === 2) st = dockerRun(st, 'app-2')
        apply(st)
        break
      }
      case 'write': {
        const c = base().containers[0]
        if (c) apply(writeFile(base(), c.id, 30))
        break
      }
      case 'toggle-cgroups':
        apply(toggleCgroups(base()))
        break
      case 'stop': {
        const c = base().containers[0]
        if (c) apply(stopContainer(base(), c.id))
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
  create: () => new DockerScene(),
}

export default sceneModule
