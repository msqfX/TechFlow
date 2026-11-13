import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { NetworkNode } from '@/engine/components/NetworkNode'
import { Packet } from '@/engine/components/Packet'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  MAJORITY,
  RAFT_NODE_NAMES,
  clientWrite,
  commitEntry,
  createRaftState,
  crashLeader,
  receiveVoteRequest,
  replicateLog,
  splitVote,
  startElection,
  winElection,
} from './model'
import type { RaftState } from './model'

/** Raft 场景:5 节点环形拓扑 + 角色色 + 任期 + 投票/复制包 */

const VIEW = { width: 840, height: 620 }
// 五节点环形布局
const NODE_POS: Record<string, { x: number; y: number }> = {
  N1: { x: 420, y: 110 },
  N2: { x: 640, y: 260 },
  N3: { x: 560, y: 480 },
  N4: { x: 280, y: 480 },
  N5: { x: 200, y: 260 },
}

class RaftScene extends BaseScene<RaftState> {
  private nodes = new Map<string, NetworkNode>()
  private termChips = new Map<string, SVGTextElement>()
  private leaderBanner: SVGGElement | null = null
  private leaderText: SVGTextElement | null = null
  private termBig: SVGTextElement | null = null
  private votesChip: SVGTextElement | null = null
  private slots: Packet[] = []
  private live: RaftState | null = null

  constructor() {
    super({ id: 'raft-consensus', viewBox: VIEW, label: 'Raft 五节点选主与日志复制' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // 环形连线(心跳/投票通道)
    const ring = ['N1', 'N2', 'N3', 'N4', 'N5', 'N1']
    for (let i = 0; i < ring.length - 1; i++) {
      const a = NODE_POS[ring[i]!]!
      const b = NODE_POS[ring[i + 1]!]!
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      renderer.el('path', {
        d: `M ${a.x} ${a.y} Q ${mx + (my - 260) * 0.12} ${my} ${b.x} ${b.y}`,
        class: 'tf-link tf-link--dashed',
      }, renderer.layerLinks)
    }

    RAFT_NODE_NAMES.forEach(name => {
      const pos = NODE_POS[name]!
      const node = new NetworkNode(renderer, {
        id: name, x: pos.x, y: pos.y, shape: 'circle', radius: 34, label: name, glyph: name,
      })
      this.nodes.set(name, node)
      const chip = renderer.el('text', {
        x: pos.x, y: pos.y + 72, 'text-anchor': 'middle', class: 'tf-subnet-mono',
      }, renderer.layerLabels)
      this.termChips.set(name, chip)
    })

    // 中心信息
    renderer.el('circle', { cx: 420, cy: 300, r: 66, class: 'tf-ip-card' }, renderer.layerNodes)
    const termTitle = renderer.el('text', { x: 420, y: 284, 'text-anchor': 'middle', class: 'tf-label--muted' }, renderer.layerLabels)
    termTitle.textContent = '当前任期 term'
    this.termBig = renderer.el('text', { x: 420, y: 318, 'text-anchor': 'middle', class: 'tf-ip-decimal' }, renderer.layerNodes)
    this.votesChip = renderer.el('text', { x: 420, y: 344, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, renderer.layerLabels)

    // Leader 横幅
    this.leaderBanner = renderer.el('g', {}, renderer.layerOverlay)
    renderer.el('rect', { x: 320, y: 30, width: 200, height: 38, rx: 10, class: 'tf-ip-error-bg' }, this.leaderBanner)
    this.leaderText = renderer.el('text', { x: 420, y: 55, 'text-anchor': 'middle', class: 'tf-ip-error-text' }, this.leaderBanner)
    this.leaderBanner.style.opacity = '0'

    // 多数派说明
    new Label(renderer, { x: 90, y: 60, text: '多数派 = 3/5', kind: 'accent', anchor: 'start' })
    new Label(renderer, { x: 90, y: 84, text: '两个多数派必有交集', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 90, y: 108, text: '→ 同 term 只有一个 Leader', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 90, y: 132, text: 'term 大者为准(全局裁判)', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 750, y: 60, text: '金/紫 = Leader', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 750, y: 84, text: '蓝 = Candidate', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 750, y: 108, text: '灰 = Follower', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: 750, y: 132, text: '红 = 已宕机', kind: 'mono', anchor: 'start' })

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 6, text: '对照 TCP:确认换可靠;Raft:多数派换一致 —— etcd/Consul/TiKV 的共识底座', kind: 'muted' })

    this.slots = []
    for (let i = 0; i < 12; i++) {
      this.slots.push(new Packet(renderer, { id: `raft-slot-${i}`, color: 'accent', shape: 'rect', width: 66, height: 20 }))
    }
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: '五节点集群:全部 Follower',
        description: 'term=0,没有 Leader —— 等待选举。',
        explanation: `5 个节点都是 **Follower**:只被动接收心跳。没有 Leader 就没人接写请求 —— 集群必须先**选主**。每个节点有**随机选举超时**(150~300ms):随机化是为了避免大家同时起哄(spliver vote)。`,
        duration: 1300,
        action: 'init',
      },
      {
        id: 'timeout',
        title: 'N1 心跳超时 → Candidate,拉票',
        description: 'term 0 → 1;自投一票 + RequestVote × 4。',
        explanation: `N1 超时后**自荐**:角色转 **Candidate**,**term+1**(逻辑时钟单调递增),给自己投一票,并行向其余 4 节点发 **RequestVote** 拉票。此刻它需要 **3 票**(多数派)才能当选。`,
        duration: 1500,
        action: 'timeout',
      },
      {
        id: 'votes',
        title: 'N2、N3 投票:3 票达到多数派',
        description: '先到先得:每个节点每 term 只能投一票。',
        explanation: `N2、N3 收到拉票:term 更大且**本 term 还没投过票** → 投出。**每个节点在一个 term 只有一票** —— 这是「同一 term 只有一个 Leader」的保证。两个多数派必有交集,交集节点拒绝重复投票 → 不可能出现两个合法 Leader。`,
        duration: 1500,
        action: 'votes',
      },
      {
        id: 'elected',
        title: 'N1 当选 Leader,广播心跳',
        description: '3/5 ≥ 多数派 → Leader,term=1。',
        explanation: `票数达到多数派,N1 当选 **Leader**,立刻广播**心跳**宣告权威并重置其他节点的选举定时器。此后所有**写请求都由 Leader 处理**;心跳周期性发送,维持领导地位。`,
        duration: 1400,
        action: 'elected',
      },
      {
        id: 'replicate',
        title: '写请求与日志复制',
        description: '客户端写 → Leader 追加日志 → 复制 → 多数 ACK → 提交。',
        explanation: `客户端写 "set x=1":**只有 Leader 接收**。Leader 追加日志(未提交)→ 复制给 Followers → 多数派 ACK → **提交**(apply 到状态机)→ 回复客户端成功。思想与 TCP 同源:**用确认换可靠**,只是这里的确认来自**多数派**,换来的是分布式一致性。`,
        duration: 1500,
        action: 'replicate',
      },
      {
        id: 'crash',
        title: '挑战:Leader 宕机 → 重新选举',
        description: 'N1 宕机;N3 超时 → term=2 新选举。',
        explanation: `Leader 宕机后,Follower 在随机超时后重新拉票,**term+1**(新任期)。已提交的日志至少存在于多数派节点 → 新 Leader 必然拥有全部已提交日志(选举安全性),集群无损失地继续服务。实验面板可切换「票数分裂」场景 —— 随机超时正是为避免它。`,
        duration: 1600,
        action: 'crash',
      },
    ]

    const transitions: StepTransition<RaftState>[] = [
      () => createRaftState(),
      s => startElection(s, 'N1'),
      s => receiveVoteRequest(receiveVoteRequest(s, 'N1', 'N2', true), 'N1', 'N3', true),
      s => winElection(s, 'N1'),
      s => {
        let st = clientWrite(s, 'set x=1')
        st = replicateLog(st)
        st = commitEntry(st)
        return st
      },
      s => {
        const crashed = crashLeader(s)
        return startElection(crashed, 'N3')
      },
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): RaftState {
    return createRaftState()
  }

  private effectiveState(stepState: RaftState): RaftState {
    return this.live ?? stepState
  }

  protected render(stepState: RaftState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    // 节点角色与任期
    state.nodes.forEach(n => {
      const node = this.nodes.get(n.id)
      const chip = this.termChips.get(n.id)
      if (node) {
        node.setStatus(n.role === 'crashed' ? 'error' : n.role === 'leader' ? 'success' : n.role === 'candidate' ? 'active' : n.role === 'follower' ? 'idle' : 'idle')
        node.setLabel(`${n.name}${n.role === 'leader' ? ' 👑' : n.role === 'candidate' ? ' ?' : ''}`)
      }
      if (chip) {
        chip.textContent = `${n.role} · term ${n.term}`
        chip.setAttribute('class', `tf-subnet-mono ${n.role === 'leader' ? 'ok' : n.role === 'candidate' ? '' : ''}`)
      }
    })

    // 中心信息
    if (this.termBig) this.termBig.textContent = String(state.term)
    if (this.votesChip) {
      this.votesChip.textContent = state.votesReceived > 0 ? `选票 ${state.votesReceived}/5(需 ${MAJORITY})` : ''
    }

    // Leader 横幅
    if (this.leaderBanner && this.leaderText) {
      if (state.leaderId) {
        this.leaderText.textContent = `Leader:${state.leaderId}`
        if (tl) tl.to(this.leaderBanner, { opacity: 1, duration: 0.3 }, 0)
        else this.leaderBanner.style.opacity = '1'
      } else {
        if (tl) tl.to(this.leaderBanner, { opacity: 0, duration: 0.2 }, 0)
        else this.leaderBanner.style.opacity = '0'
      }
    }

    // 报文槽位:最近 6 个包沿环形通道展示
    const recent = state.packets.slice(-6)
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (!slot) continue
      const pkt = recent[i]
      if (!pkt) {
        slot.show(false)
        continue
      }
      const from = pkt.from === 'client' ? NODE_POS.N1! : NODE_POS[pkt.from] ?? NODE_POS.N1!
      const to = pkt.to === 'client' ? NODE_POS.N1! : NODE_POS[pkt.to] ?? NODE_POS.N1!
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
      const color = pkt.kind === 'vote' ? 'success' : pkt.kind === 'replicate' ? 'purple' : pkt.kind === 'client-write' ? 'warning' : 'accent'
      slot.options.color = color
      const body = slot.group.querySelector('.tf-packet-body-rect')
      if (body) body.setAttribute('class', `tf-packet-body-rect tf-packet-body--${color}`)
      slot.placeAt(from.x + (mid.x - from.x) * 0.3, from.y + (mid.y - from.y) * 0.3)
      slot.show(!pkt.lost)
      void tl
    }
  }

  protected snapshotData(stepState: RaftState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const leader = state.leaderId
    return {
      rows: [
        { label: '当前任期 term', value: String(state.term), tone: 'accent' },
        { label: 'Leader', value: leader ?? '(无主 — 选举中/宕机)', tone: leader ? 'success' : 'danger' },
        { label: '角色分布', value: state.nodes.map(n => `${n.id}:${n.role.slice(0, 4)}`).join(' ') },
        { label: '选票', value: state.votesReceived > 0 ? `${state.votesReceived}/5(需 ${MAJORITY})` : '—', tone: state.votesReceived >= MAJORITY ? 'success' : 'default' },
        { label: '未提交日志', value: state.pendingEntry ?? '(无)' },
        { label: '已提交一致', value: state.nodes.every(n => n.role === 'crashed' || true) && logConsistent(state) ? '✓ 全节点一致' : '—', tone: 'success' },
        { label: '最近报文', value: state.packets.length ? `${state.packets[state.packets.length - 1]!.kind} (term ${state.term})` : '—' },
        { label: '票数分裂', value: state.splitVote ? '发生过(随机超时规避)' : '无' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }

    function logConsistent(st: RaftState): boolean {
      const alive = st.nodes.filter(n => n.role !== 'crashed')
      const committed = alive[0]?.committed ?? 0
      return alive.every(n => n.committed === committed)
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'replay', label: '重放标准选举(N1 当选)' },
      {
        name: 'crash-and-reelect',
        label: '模拟 Leader 宕机 → N3 重选',
        description: '挑战:term+1,集群无损失继续服务。',
        danger: true,
      },
      {
        name: 'split-vote',
        label: '模拟票数分裂',
        description: '多个候选者同时拉票 → 平票,term+1 重选。',
        danger: true,
      },
      { name: 'write', label: '客户端写入(走 Leader 复制)' },
    ]
  }

  performAction(name: string): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: RaftState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'replay': {
        let st = base()
        st = startElection(st, 'N1')
        st = receiveVoteRequest(st, 'N1', 'N2', true)
        st = receiveVoteRequest(st, 'N1', 'N3', true)
        st = winElection(st, 'N1')
        apply(st)
        break
      }
      case 'crash-and-reelect': {
        let st = crashLeader(base())
        st = startElection(st, 'N3')
        st = receiveVoteRequest(st, 'N3', 'N1', true)
        st = receiveVoteRequest(st, 'N3', 'N2', true)
        st = winElection(st, 'N3')
        apply(st)
        break
      }
      case 'split-vote': {
        let st = startElection(base(), 'N2')
        st = receiveVoteRequest(st, 'N2', 'N4', true)
        st = splitVote(st)
        st = startElection(st, 'N3')
        st = receiveVoteRequest(st, 'N3', 'N1', true)
        st = receiveVoteRequest(st, 'N3', 'N2', true)
        st = winElection(st, 'N3')
        apply(st)
        break
      }
      case 'write': {
        let st = clientWrite(base(), 'set x=1')
        st = replicateLog(st)
        st = commitEntry(st)
        apply(st)
        break
      }
      default:
        break
    }
  }
}

const sceneModule: SceneModule = {
  create: () => new RaftScene(),
}

export default sceneModule
