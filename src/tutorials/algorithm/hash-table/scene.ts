import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import { LOAD_FACTOR_THRESHOLD, createHashTableState, get, put, removeKey } from './model'
import type { HashTableState } from './model'

/** 哈希表场景:桶行 + 冲突链 + 负载因子 + rehash 展开 */

const VIEW = { width: 840, height: 640 }
const BUCKET_X = 60
const BUCKET_W = 120
const BUCKET_H = 30
const BUCKET_STEP = 34
const MAX_VISIBLE_BUCKETS = 16
const CHAIN_X0 = 200
const CHIP_W = 64
const CHIP_STEP = 72

class HashTableScene extends BaseScene<HashTableState> {
  private bucketRows: Array<{ g: SVGGElement; label: SVGTextElement; hl: SVGRectElement }> = []
  private chainChips: Array<{ g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }> = []
  private factorBar: SVGRectElement | null = null
  private factorText: SVGTextElement | null = null
  private rehashBanner: SVGTextElement | null = null
  private live: HashTableState | null = null
  private scripted = 0

  constructor() {
    super({ id: 'hash-table', viewBox: VIEW, label: '哈希表桶与冲突链' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    new Label(renderer, { x: 60, y: 40, text: '桶(hash(key) % bucketCount)', kind: 'accent', anchor: 'start' })
    new Label(renderer, { x: CHAIN_X0, y: 40, text: '冲突链(链地址法:同桶键依次挂链)', kind: 'accent', anchor: 'start' })

    // 预建最多 16 行(4→8→16 扩容可见)
    this.bucketRows = []
    for (let i = 0; i < MAX_VISIBLE_BUCKETS; i++) {
      const g = renderer.el('g', {}, renderer.layerNodes)
      const y = 56 + i * BUCKET_STEP
      const hl = renderer.el('rect', { x: BUCKET_X - 8, y: y - 5, width: BUCKET_W + 16, height: BUCKET_H - 2, rx: 7, class: 'tf-jvm-gen', opacity: 0 }, g)
      const label = renderer.el('text', { x: BUCKET_X + BUCKET_W / 2, y: y + 14, 'text-anchor': 'middle', class: 'tf-subnet-mono' }, g)
      label.textContent = `#${i}`
      renderer.el('rect', { x: BUCKET_X, y, width: BUCKET_W - 16, height: BUCKET_H - 12, rx: 6, class: 'tf-jvm-frame', 'stroke-dasharray': '3 3' }, g)
      g.style.opacity = '0'
      this.bucketRows.push({ g, label, hl })
    }

    // 链条芯片(预留网格:16 行 × 6 列)
    this.chainChips = []
    for (let row = 0; row < MAX_VISIBLE_BUCKETS; row++) {
      for (let col = 0; col < 6; col++) {
        const g = renderer.el('g', {}, renderer.layerNodes)
        const x = CHAIN_X0 + col * CHIP_STEP
        const y = 56 + row * BUCKET_STEP - 5
        const rect = renderer.el('rect', { x, y, width: CHIP_W, height: BUCKET_H - 10, rx: 6, class: 'tf-jvm-frame' }, g)
        const text = renderer.el('text', { x: x + CHIP_W / 2, y: y + 18, 'text-anchor': 'middle', class: 'tf-label--mono' }, g)
        g.style.opacity = '0'
        this.chainChips.push({ g, rect, text })
      }
    }

    // 负载因子
    renderer.el('rect', { x: 60, y: 600, width: 400, height: 16, rx: 6, class: 'tf-tw-bar' }, renderer.layerNodes)
    this.factorBar = renderer.el('rect', { x: 60, y: 600, width: 0, height: 16, rx: 6, class: 'tf-tw-fill' }, renderer.layerNodes)
    this.factorText = renderer.el('text', { x: 480, y: 613, class: 'tf-subnet-mono' }, renderer.layerLabels)
    this.rehashBanner = renderer.el('text', { x: VIEW.width / 2, y: 26, 'text-anchor': 'middle', class: 'tf-ip-error-text' }, renderer.layerLabels)

    new Label(renderer, { x: 620, y: 613, text: '超过阈值 0.75 → 翻倍 rehash', kind: 'mono', anchor: 'start' })
    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 2, text: '教学哈希 = 字符码求和 % 桶数;真实实现用带密钥哈希防碰撞攻击', kind: 'muted' })
  }

  protected buildSteps() {
    const steps: SceneStep[] = [
      {
        id: 'init',
        title: '空哈希表:4 个桶',
        description: '负载因子 0 —— 一切 O(1)。',
        explanation: `哈希表 = **桶数组 + 哈希函数**。存键值对时先算 \`hash(key) % 桶数\` 得到桶下标,一步定位 —— 这就是 O(1) 的来源。教学哈希用「字符码求和取模」,例如 "name" 的字符码和是 417,417 % 4 = 1 → 桶 1。`,
        duration: 1300,
        action: 'init',
      },
      {
        id: 'put-first',
        title: 'put("age", "18"):直接命中空桶',
        description: '哈希 → 桶 0;桶为空,O(1) 放入。',
        explanation: `键 "age" 哈希后落在桶 0,桶是空的 → 直接放入,**一次定位完成**。只要桶不冲突,每次 put/get 都是「算哈希 → 直接取」两步,这就是「平均 O(1)」。`,
        duration: 1300,
        action: 'put-first',
      },
      {
        id: 'put-collide',
        title: 'put("mean", …):冲突了!',
        description: "`mean` 与 `name` 互为变位词(字符码和都是 417)→ 必然同桶。",
        explanation: `教学哈希是字符码求和,**"mean" 与 "name" 互为变位词、字符码和都是 417** → 必然同一个桶。冲突用**链地址法**处理:同桶的键依次挂成链表。查找时先定位桶再沿链逐个比对 —— 链越长越慢,「平均 O(1)」的 O(1) 开始打折。`,
        duration: 1500,
        action: 'put-collide',
      },
      {
        id: 'get-collide',
        title: 'get("mean"):沿链比对',
        description: '先比 "name"(不匹配),再比 "mean"(命中)。',
        explanation: `get 也要付冲突的代价:定位到桶后**沿链逐个比对键**,hops = 比较次数。哈希表只保证「桶一步到位」,桶内的比对次数取决于链长 —— 所以哈希函数的**分布均匀性**至关重要。`,
        duration: 1400,
        action: 'get-collide',
      },
      {
        id: 'fill',
        title: '继续放入:负载因子上升',
        description: '超过阈值 0.75 → 触发 rehash!',
        explanation: `**负载因子 = 键数 ÷ 桶数**。超过 0.75 就扩容:桶数翻倍,**所有键重新哈希、重新分配**(键的桶位置全变)。单次 rehash 是 O(n) 大动作,但翻倍式扩容均摊后仍是 O(1) —— 与动态数组扩容同款分析。`,
        duration: 1600,
        action: 'fill',
      },
      {
        id: 'after-rehash',
        title: 'rehash 后:链变短,恢复 O(1)',
        description: '桶数翻倍,冲突链被拆散分布。',
        explanation: `rehash 后同样的键散布到更多桶里,链普遍变短,查找回到接近 O(1)。代价是**一次 O(n) 的全量搬迁** —— Redis 为此做渐进式 rehash(分批搬),避免卡顿。键多时预设容量、少触发 rehash,是高性能哈希表的标配手法。`,
        duration: 1400,
        action: 'after-rehash',
      },
    ]

    const scripted = (s: HashTableState): HashTableState => {
      let st = s
      st = put(st, 'age', '18')
      st = put(st, 'mean', 'verb')
      st = get(st, 'mean')
      st = put(st, 'name', 'Alice')
      st = put(st, 'city', 'Guangzhou')
      st = put(st, 'hobby', 'code')
      return st
    }

    const transitions: StepTransition<HashTableState>[] = [
      () => createHashTableState(4),
      s => put(s, 'age', '18'),
      s => put(s, 'mean', 'verb'),
      s => get(s, 'mean'),
      s => scripted(s),
      s => ({ ...s, log: [...s.log, `rehash 完成:桶数 ${s.bucketCount},负载因子 ${(s.size / s.bucketCount).toFixed(2)},链已拆散`] }),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): HashTableState {
    return createHashTableState(4)
  }

  private effectiveState(stepState: HashTableState): HashTableState {
    return this.live ?? stepState
  }

  protected render(stepState: HashTableState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const state = this.effectiveState(stepState)
    const tl = opts.timeline

    // 桶行
    for (let i = 0; i < this.bucketRows.length; i++) {
      const row = this.bucketRows[i]
      if (!row) continue
      const visible = i < state.bucketCount
      const target = visible ? '1' : '0'
      const isLast = state.lastBucket === i
      if (row.hl) row.hl.setAttribute('opacity', isLast ? '0.5' : '0')
      if (tl) tl.to(row.g, { opacity: target, duration: 0.2 }, i * 0.03)
      else row.g.style.opacity = target
    }

    // 链条芯片:摊平 buckets → 按行定位
    const flat: Array<{ key: string; value: string; bucket: number; col: number }> = []
    state.buckets.forEach((chain, bucket) => {
      chain.forEach((e, col) => flat.push({ key: e.key, value: e.value, bucket, col }))
    })
    for (let i = 0; i < this.chainChips.length; i++) {
      const chip = this.chainChips[i]
      if (!chip) continue
      const entry = flat[i]
      const visible = entry !== undefined
      const target = visible ? '1' : '0'
      if (entry && chip.text) {
        chip.text.textContent = `${entry.key}:${entry.value}`
        const x = CHAIN_X0 + (entry.col ?? 0) * CHIP_STEP
        const y = 56 + entry.bucket * BUCKET_STEP - 5
        chip.g.setAttribute('transform', `translate(${x - (CHAIN_X0 + (i % 6) * CHIP_STEP)} ${y - (56 + Math.floor(i / 6) * BUCKET_STEP - 5)})`)
        if (chip.rect) {
          chip.rect.setAttribute('class', `tf-jvm-frame ${(entry.col ?? 0) > 0 ? 'is-top' : ''}`)
        }
      }
      if (tl && visible) {
        tl.to(chip.g, { opacity: target, duration: 0.2 }, 0)
      } else {
        chip.g.style.opacity = target
      }
    }

    // 负载因子
    if (this.factorBar && this.factorText) {
      const factor = state.size / state.bucketCount
      const w = Math.min(400, (400 * factor) / 1.5)
      if (tl) tl.to(this.factorBar, { attr: { width: w }, duration: 0.4 }, 0)
      else this.factorBar.setAttribute('width', String(w))
      this.factorText.textContent = `负载因子 ${factor.toFixed(2)}(键 ${state.size} / 桶 ${state.bucketCount})`
      this.factorText.setAttribute('class', `tf-subnet-mono ${factor > LOAD_FACTOR_THRESHOLD ? 'bad' : ''}`)
      if (factor > LOAD_FACTOR_THRESHOLD) this.factorText.setAttribute('style', 'fill: var(--warning)')
      else this.factorText.removeAttribute('style')
    }

    if (this.rehashBanner) {
      this.rehashBanner.textContent =
        state.rehashes > 0 ? `⚡ 已 rehash ×${state.rehashes}:桶数翻倍,全部键重新分配` : ''
    }
  }

  protected snapshotData(stepState: HashTableState, completedSteps: number): Record<string, unknown> {
    const state = this.effectiveState(stepState)
    const factor = state.size / state.bucketCount
    const longest = Math.max(0, ...state.buckets.map(b => b.length))
    return {
      rows: [
        { label: '键值对数量', value: String(state.size), tone: 'accent' },
        { label: '桶数', value: String(state.bucketCount) },
        { label: '负载因子', value: `${factor.toFixed(2)}(阈值 ${LOAD_FACTOR_THRESHOLD})`, tone: factor > LOAD_FACTOR_THRESHOLD ? 'warning' : 'success' },
        { label: '最长链', value: `${longest} 个(冲突最重的桶)`, tone: longest > 1 ? 'warning' : 'success' },
        { label: '空桶占比', value: `${Math.round((state.buckets.filter(b => b.length === 0).length / state.bucketCount) * 100)}%` },
        { label: 'rehash 次数', value: String(state.rehashes), tone: state.rehashes ? 'warning' : 'default' },
        { label: '最近 put/get', value: state.lastLookup ? `${state.lastLookup.key}:${state.lastLookup.found ? state.lastLookup.value : '不存在'}(比对 ${state.lastLookup.hops} 次)` : state.lastKey ? `${state.lastKey} → 桶 ${state.lastBucket}` : '—', tone: state.collided ? 'warning' : 'success' },
        { label: '平均/最坏', value: '平均 O(1) · 最坏 O(n)(全冲突)' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }
  }

  getActions(): SceneAction[] {
    return [
      {
        name: 'put',
        label: 'put 键值对',
        description: '观察哈希定位、冲突追加与自动 rehash。',
        params: [
          { name: 'key', label: '键', type: 'text', placeholder: 'name' },
          { name: 'value', label: '值', type: 'text', placeholder: 'Alice' },
        ],
      },
      {
        name: 'get',
        label: 'get 查找',
        description: '沿链比对的次数 = 冲突的代价。',
        params: [{ name: 'key', label: '键', type: 'text', placeholder: 'age' }],
      },
      {
        name: 'remove',
        label: 'remove 删除',
        params: [{ name: 'key', label: '键', type: 'text', placeholder: 'age' }],
      },
      { name: 'storm', label: '连续放入 6 对(触发 rehash)', danger: true },
      { name: 'reset', label: '复位(4 桶)' },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const base = () => this.effectiveState(this.states.current)
    const apply = (next: HashTableState) => {
      this.live = next
      this.render(next, { animate: false, timeline: null, fromIndex: 0 })
      this.events.emit('data', this.getState())
    }
    switch (name) {
      case 'put': {
        const key = String(params?.key ?? '').trim() || `k${this.scripted++}`
        const value = String(params?.value ?? '').trim() || 'v'
        apply(put(base(), key, value))
        break
      }
      case 'get': {
        const key = String(params?.key ?? '').trim()
        if (key) apply(get(base(), key))
        break
      }
      case 'remove': {
        const key = String(params?.key ?? '').trim()
        if (key) apply(removeKey(base(), key))
        break
      }
      case 'storm': {
        let st = base()
        st = put(st, 'k1', 'v1')
        st = put(st, 'k2', 'v2')
        st = put(st, 'k3', 'v3')
        st = put(st, 'k4', 'v4')
        st = put(st, 'k5', 'v5')
        st = put(st, 'k6', 'v6')
        apply(st)
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
  create: () => new HashTableScene(),
}

export default sceneModule
