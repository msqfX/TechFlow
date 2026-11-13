import { BaseScene } from '@/engine/core/Scene'
import type { RenderOptions, SceneModule, SceneStep, StepTransition } from '@/engine/types/step'
import type { GsapTimeline } from '@/engine/types/animation'
import type { SVGRenderer } from '@/engine/renderers/SVGRenderer'
import { Label } from '@/engine/components/Label'
import type { SceneAction } from '@/engine/types/scene'
import {
  DEFAULT_LEAF,
  checkChain,
  checkHostname,
  checkRevocation,
  checkTime,
  conclude,
  createCertState,
  verifyLevel,
} from './model'
import type { CertNode, CertVerifyState } from './model'

/** HTTPS 证书验证场景:证书字段卡 + 三级链逐级验签 + 四项检查清单 */

const VIEW = { width: 840, height: 640 }

type CertPreset = 'valid' | 'expired' | 'hostname' | 'wildcard' | 'revoked' | 'self-signed'

const PRESETS: Record<CertPreset, { leaf: CertNode; visiting: string; label: string }> = {
  valid: { leaf: DEFAULT_LEAF, visiting: 'www.example.com', label: '有效证书' },
  expired: {
    leaf: { ...DEFAULT_LEAF, notBefore: '2025-01-01', notAfter: '2025-12-31' },
    visiting: 'www.example.com',
    label: '已过期',
  },
  hostname: {
    leaf: { ...DEFAULT_LEAF, san: ['shop.example.com'] },
    visiting: 'www.example.com',
    label: '域名不匹配',
  },
  wildcard: {
    leaf: { ...DEFAULT_LEAF, san: ['*.example.com'] },
    visiting: 'api.example.com',
    label: '通配符匹配',
  },
  revoked: { leaf: { ...DEFAULT_LEAF, revoked: true }, visiting: 'www.example.com', label: '已被吊销(OCSP)' },
  'self-signed': {
    leaf: { ...DEFAULT_LEAF, subject: 'internal.corp', issuerLabel: '自签名(无受信 CA)', signatureValid: false },
    visiting: 'internal.corp',
    label: '自签名',
  },
}

class TlsCertScene extends BaseScene<CertVerifyState> {
  private preset: CertPreset = 'valid'
  private visiting = PRESETS.valid.visiting

  private chainRows: Array<{ g: SVGGElement; name: SVGTextElement; state: SVGTextElement }> = []
  private fieldRows: Array<{ label: SVGTextElement; value: SVGTextElement }> = []
  private checkRows: Array<{ g: SVGGElement; name: SVGTextElement; state: SVGTextElement }> = []
  private visitingChip: SVGTextElement | null = null
  private verdict: SVGTextElement | null = null
  private issuesText: SVGGElement | null = null

  constructor() {
    super({ id: 'tls-cert', viewBox: VIEW, label: '证书链验证与检查清单' })
  }

  protected buildScene(renderer: SVGRenderer): void {
    // 左侧:证书字段卡
    renderer.el('rect', { x: 50, y: 90, width: 360, height: 300, rx: 12, class: 'tf-ip-card' }, renderer.layerLabels)
    renderer.el('text', { x: 68, y: 116, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '站点证书(X.509 关键字段)'
    const fields: Array<[string, string]> = [
      ['Subject', ''],
      ['Issuer', ''],
      ['SAN', ''],
      ['有效期', ''],
      ['签名', ''],
      ['吊销状态', ''],
    ]
    this.fieldRows = fields.map(([label], i) => {
      const y = 144 + i * 40
      const l = renderer.el('text', { x: 68, y, class: 'tf-label--muted' }, renderer.layerLabels)
      l.textContent = label
      const v = renderer.el('text', { x: 160, y, class: 'tf-subnet-mono' }, renderer.layerLabels)
      return { label: l, value: v }
    })

    this.visitingChip = renderer.el('text', { x: 230, y: 78, 'text-anchor': 'middle', class: 'tf-label--accent' }, renderer.layerLabels)

    // 右侧:三级链
    renderer.el('text', { x: 470, y: 116, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '证书链(逐级验签:上级公钥验下级签名)'
    this.chainRows = []
    const chainMeta = [
      { name: '根 CA(系统内置 = 信任锚点)', hint: '无需网络,机器里就有公钥' },
      { name: '中间 CA(Let\u2019s Encrypt R3)', hint: '服务端握手时下发' },
      { name: '站点证书 www.example.com', hint: '含公钥与 SAN' },
    ]
    chainMeta.forEach((m, i) => {
      const g = renderer.el('g', {}, renderer.layerNodes)
      renderer.el('rect', { x: 470, y: 132 + i * 76, width: 350, height: 62, rx: 9, class: 'tf-jvm-frame' }, g)
      const name = renderer.el('text', { x: 486, y: 156 + i * 76, class: 'tf-http-title' }, g)
      name.textContent = m.name
      renderer.el('text', { x: 486, y: 178 + i * 76, class: 'tf-label--muted' }, g).textContent = m.hint
      const state = renderer.el('text', { x: 804, y: 168 + i * 76, 'text-anchor': 'end', class: 'tf-subnet-result' }, g)
      if (i < 2) {
        renderer.el('text', { x: 645, y: 128 + (i + 1) * 76, 'text-anchor': 'middle', class: 'tf-label--mono' }, renderer.layerLabels).textContent = '↓ 用公钥验签'
      }
      this.chainRows.push({ g, name, state })
    })

    // 检查清单
    renderer.el('text', { x: 50, y: 430, class: 'tf-label--accent' }, renderer.layerLabels).textContent =
      '验证清单(四项全过 → 绿锁)'
    this.checkRows = []
    const checks = [
      { name: '① 证书链与信任', id: 'chain' },
      { name: '② 域名匹配(SAN/通配符)', id: 'hostname' },
      { name: '③ 有效期窗口', id: 'time' },
      { name: '④ 吊销状态(OCSP)', id: 'revocation' },
    ]
    checks.forEach((c, i) => {
      const g = renderer.el('g', {}, renderer.layerLabels)
      renderer.el('rect', { x: 50, y: 444 + i * 38, width: 360, height: 32, rx: 7, class: 'tf-subnet-row-bg' }, g)
      const name = renderer.el('text', { x: 66, y: 465 + i * 38, class: 'tf-subnet-mono' }, g)
      name.textContent = c.name
      const state = renderer.el('text', { x: 396, y: 465 + i * 38, 'text-anchor': 'end', class: 'tf-subnet-result' }, g)
      g.style.opacity = '0'
      this.checkRows.push({ g, name, state })
    })

    // 结论区
    this.verdict = renderer.el('text', { x: 470, y: 470, class: 'tf-ip-decimal' }, renderer.layerLabels)
    this.issuesText = renderer.el('g', {}, renderer.layerOverlay)

    new Label(renderer, { x: VIEW.width / 2, y: VIEW.height - 8, text: '教学简化:真实验签还含签名算法强度、密钥用途扩展等检查', kind: 'muted' })
  }

  protected buildSteps() {
    const preset = PRESETS[this.preset]!
    const leaf: CertNode = { ...preset.leaf }
    const visiting = this.visiting
    const steps: SceneStep[] = [
      {
        id: 'handoff',
        title: '拿到证书链',
        description: `访问 ${visiting},服务端下发站点证书 + 中间 CA。`,
        explanation: `TLS 握手第二步,服务端随 ServerHello 下发**证书链**:站点证书 + 签发它的中间 CA 证书。**根 CA 不在网络上传** —— 它是操作系统/浏览器内置的信任锚点。左侧是站点证书的字段卡,验证就是围绕这些字段展开的。`,
        duration: 1200,
        action: 'handoff',
      },
      {
        id: 'chain',
        title: '验签:根 → 中间 → 站点',
        description: '用上级公钥验证下级签名;根 CA 是信任起点。',
        explanation: `**验签 = 用上级证书的公钥验证下级证书上的签名**。顺序:根 CA 是内置信任锚点(机器里就有它的公钥)→ 用它验证中间 CA 的签名 → 用中间 CA 的公钥验证站点证书的签名。三级全过,链才可信。为什么要中间层?根 CA 私钥离线保管,日常签发交给中间 CA —— 中间 CA 出事可吊销更换而不动根。`,
        duration: 1500,
        action: 'chain',
      },
      {
        id: 'hostname',
        title: '域名匹配:SAN 与通配符',
        description: `检查 ${visiting} 是否被 SAN 覆盖。`,
        explanation: `访问的域名必须被证书 **SAN 列表**覆盖:\`*.example.com\` 只匹配**一级子域**(api.example.com ✓,a.b.example.com ✗,裸域 example.com 也要单独写入 SAN)。当前证书 SAN:\`${leaf.san.join(', ')}\`。`,
        duration: 1400,
        action: 'hostname',
      },
      {
        id: 'time',
        title: '有效期窗口',
        description: `notBefore ≤ 今天 ≤ notAfter?`,
        explanation: `当前时间必须落在 **notBefore ~ notAfter** 窗口内。主流证书只有 90 天左右 —— 强制自动化续期,杜绝「忘记换证书」的经典事故。本站用 certbot 自动续期,到期前 30 天自动换新。`,
        duration: 1200,
        action: 'time',
      },
      {
        id: 'revocation',
        title: '吊销检查(OCSP)',
        description: '证书可能在到期前被提前吊销。',
        explanation: `私钥泄露、CA 出事时,CA 会**提前吊销**证书。浏览器向 CA 的 OCSP 服务查询序列号状态:good / revoked。查询慢或超时多数浏览器按软失败放行(可用性权衡);OCSP Stapling 由服务端代查并随握手附上结果。`,
        duration: 1200,
        action: 'revocation',
      },
      {
        id: 'conclude',
        title: '汇总结论',
        description: '四项全过 → 绿锁;任一失败 → 告警拦截。',
        explanation: `四项检查全部通过,浏览器才显示**绿锁**。任何一项失败都会拦截告警 —— 右侧实验面板可以切换证书预设(过期/域名不匹配/通配符/吊销/自签名),亲手把四项检查逐个打叉,观察问题清单和结论的变化。`,
        duration: 1300,
        action: 'conclude',
      },
    ]

    const transitions: StepTransition<CertVerifyState>[] = [
      () => createCertState(visiting, leaf),
      s => verifyLevel(verifyLevel(verifyLevel(s, 'root'), 'intermediate'), 'leaf'),
      s => checkHostname(checkChain(s)),
      s => checkTime(s),
      s => checkRevocation(s, leaf.revoked ? 'revoked' : 'good'),
      s => conclude(s),
    ]

    return { steps, transitions }
  }

  protected buildInitialState(): CertVerifyState {
    const preset = PRESETS[this.preset]!
    return createCertState(this.visiting, { ...preset.leaf })
  }

  protected render(state: CertVerifyState, opts: RenderOptions & { timeline: GsapTimeline | null }): void {
    const tl = opts.timeline

    if (this.visitingChip) {
      this.visitingChip.textContent = `正在访问:${state.visiting}`
    }

    // 字段卡
    const values = [
      state.leaf.subject,
      state.leaf.issuerLabel,
      state.leaf.san.join(', '),
      `${state.leaf.notBefore} ~ ${state.leaf.notAfter}`,
      state.leaf.signatureValid ? '有效(签名算法 ECDSA)' : '✗ 无效',
      state.leaf.revoked ? '✗ 已吊销' : 'good',
    ]
    this.fieldRows.forEach((row, i) => {
      if (row.value) row.value.textContent = values[i] ?? ''
    })

    // 链状态
    const chainOk = [true, state.intermediate.signatureValid && !state.intermediate.revoked, state.leaf.signatureValid && !state.leaf.revoked]
    const roles: Array<'root' | 'intermediate' | 'leaf'> = ['root', 'intermediate', 'leaf']
    this.chainRows.forEach((row, i) => {
      const verified = state.verifiedLevels.includes(roles[i]!)
      if (row.state) {
        row.state.textContent = !verified ? '' : chainOk[i] ? '✓ 已验签' : '✗'
        row.state.setAttribute('class', `tf-subnet-result ${chainOk[i] ? 'ok' : 'bad'}`)
      }
    })

    // 检查清单
    const order: Array<'chain' | 'hostname' | 'time' | 'revocation'> = ['chain', 'hostname', 'time', 'revocation']
    for (let i = 0; i < this.checkRows.length; i++) {
      const row = this.checkRows[i]
      const id = order[i]!
      if (!row) continue
      const v = state.checks[id]
      const target = v !== null ? '1' : '0'
      if (row.state) {
        row.state.textContent = v === null ? '' : v ? '✓' : '✗'
        row.state.setAttribute('class', `tf-subnet-result ${v === false ? 'bad' : 'ok'}`)
      }
      if (tl) tl.to(row.g, { opacity: target, duration: 0.25 }, i * 0.08)
      else row.g.style.opacity = target
    }

    // 结论
    if (this.verdict) {
      this.verdict.textContent = !state.concluded ? '' : state.passed ? '🔒 绿锁:身份可信' : '⚠ 告警:验证失败'
      this.verdict.setAttribute('class', `tf-subnet-result ${state.passed ? 'ok' : 'bad'}`)
      this.verdict.setAttribute('font-size', state.concluded ? '18' : '14')
    }
    if (this.issuesText) {
      const g = this.issuesText
      while (g.firstChild) g.removeChild(g.firstChild)
      if (state.concluded && !state.passed) {
        state.issues.slice(0, 4).forEach((issue, i) => {
          const t = renderer2Text('470', String(524 + i * 26), `• ${issue}`)
          g.appendChild(t)
        })
      }
    }
  }

  protected snapshotData(state: CertVerifyState, completedSteps: number): Record<string, unknown> {
    return {
      rows: [
        { label: '访问域名', value: state.visiting, tone: 'accent' },
        { label: '证书 SAN', value: state.leaf.san.join(', ') },
        { label: 'Issuer', value: state.leaf.issuerLabel },
        { label: '① 证书链', value: fmt(state.checks.chain), tone: tone(state.checks.chain) },
        { label: '② 域名匹配', value: fmt(state.checks.hostname), tone: tone(state.checks.hostname) },
        { label: '③ 有效期', value: fmt(state.checks.time), tone: tone(state.checks.time) },
        { label: '④ 吊销(OCSP)', value: fmt(state.checks.revocation), tone: tone(state.checks.revocation) },
        { label: '结论', value: state.concluded ? (state.passed ? '绿锁 🔒 身份可信' : '告警 ⚠ 验证失败') : '验证中', tone: state.concluded ? (state.passed ? 'success' : 'danger') : 'default' },
        { label: '已完成步骤', value: `${completedSteps} / ${this.stepCount}` },
        { label: '事件日志', value: state.log.length ? state.log[state.log.length - 1] ?? '' : '(空)' },
      ],
    }

    function fmt(v: boolean | null): string {
      return v === null ? '(未检查)' : v ? '通过' : '失败'
    }
    function tone(v: boolean | null): string {
      return v === null ? 'default' : v ? 'success' : 'danger'
    }
  }

  getActions(): SceneAction[] {
    return [
      { name: 'preset-valid', label: '恢复正常证书' },
      { name: 'preset-expired', label: '切换为已过期证书', danger: true },
      { name: 'preset-hostname', label: '切换为域名不匹配', danger: true },
      { name: 'preset-wildcard', label: '通配符证书匹配子域' },
      { name: 'preset-revoked', label: '切换为已吊销证书(OCSP revoked)', danger: true },
      { name: 'preset-self-signed', label: '切换为自签名证书', danger: true },
      {
        name: 'visit',
        label: '用另一个域名访问',
        description: '输入任意域名,重新走一遍验证。',
        params: [{ name: 'host', label: '域名', type: 'text', placeholder: 'api.example.com' }],
      },
    ]
  }

  performAction(name: string, params?: Record<string, unknown>): void {
    const presetActions: Record<string, CertPreset> = {
      'preset-valid': 'valid',
      'preset-expired': 'expired',
      'preset-hostname': 'hostname',
      'preset-wildcard': 'wildcard',
      'preset-revoked': 'revoked',
      'preset-self-signed': 'self-signed',
    }
    if (name in presetActions) {
      this.preset = presetActions[name]!
      this.rebuild()
      return
    }
    if (name === 'visit') {
      const host = String(params?.host ?? '').trim()
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
        this.visiting = host
        this.rebuild()
      }
    }
  }
}

function renderer2Text(x: string, y: string, content: string): SVGTextElement {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  t.setAttribute('x', x)
  t.setAttribute('y', y)
  t.setAttribute('class', 'tf-ip-error-text')
  t.textContent = content
  return t
}

const sceneModule: SceneModule = {
  create: () => new TlsCertScene(),
}

export default sceneModule
