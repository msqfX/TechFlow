/**
 * HTTPS 证书验证模拟模型(教学简化)。
 * 纯函数,可测试:通配符匹配、逐级验签、有效期窗口、吊销检查、汇总结论。
 */

export type CertRole = 'leaf' | 'intermediate' | 'root'

export interface CertNode {
  role: CertRole
  subject: string
  issuerLabel: string
  /** SAN 域名列表(仅 leaf 有意义) */
  san: string[]
  notBefore: string
  notAfter: string
  /** 本级签名是否有效(教学:模拟验签结果) */
  signatureValid: boolean
  /** 是否自签名/私有 CA(leaf 的中间/根默认可信) */
  revoked: boolean
}

export type CertCheckId = 'chain' | 'hostname' | 'time' | 'revocation'

export interface CertVerifyState {
  visiting: string
  leaf: CertNode
  intermediate: CertNode
  root: CertNode
  /** 逐级验签进度(场景步骤推进) */
  verifiedLevels: CertRole[]
  checks: Record<CertCheckId, boolean | null>
  issues: string[]
  concluded: boolean
  passed: boolean
  log: string[]
}

export const DEFAULT_LEAF: CertNode = {
  role: 'leaf',
  subject: 'www.example.com',
  issuerLabel: 'Let\u2019s Encrypt R3(中间 CA)',
  san: ['www.example.com', 'example.com'],
  notBefore: '2026-11-01',
  notAfter: '2027-02-01',
  signatureValid: true,
  revoked: false,
}

export const INTERMEDIATE: CertNode = {
  role: 'intermediate',
  subject: 'R3(中间 CA)',
  issuerLabel: 'ISRG Root X1(根 CA)',
  san: [],
  notBefore: '2020-01-01',
  notAfter: '2035-09-01',
  signatureValid: true,
  revoked: false,
}

export const ROOT: CertNode = {
  role: 'root',
  subject: 'ISRG Root X1(根 CA,系统内置)',
  issuerLabel: '自签(信任锚点)',
  san: [],
  notBefore: '2015-06-01',
  notAfter: '2035-06-01',
  signatureValid: true,
  revoked: false,
}

export const NOW = '2026-11-13'

export function createCertState(
  visiting = 'www.example.com',
  leaf: CertNode = DEFAULT_LEAF,
): CertVerifyState {
  return {
    visiting,
    leaf,
    intermediate: INTERMEDIATE,
    root: ROOT,
    verifiedLevels: [],
    checks: { chain: null, hostname: null, time: null, revocation: null },
    issues: [],
    concluded: false,
    passed: false,
    log: ['浏览器收到服务端下发的证书链(站点 + 中间 CA)'],
  }
}

/**
 * 通配符匹配(教学模型):
 * - 精确匹配优先;
 * - `*.example.com` 只匹配一级子域(a.example.com ✓,a.b.example.com ✗),
 *   不匹配裸域 example.com;
 * - 通配符仅允许在最左一段。
 */
export function wildcardMatches(pattern: string, host: string): boolean {
  if (pattern === host) return true
  if (!pattern.startsWith('*.')) return false
  const rest = pattern.slice(2) // example.com
  if (host === rest) return false // 裸域不匹配
  if (!host.endsWith('.' + rest)) return false
  const prefix = host.slice(0, host.length - rest.length - 1)
  return prefix.length > 0 && !prefix.includes('.')
}

function isWithin(now: string, node: CertNode): boolean {
  return node.notBefore <= now && now <= node.notAfter
}

/** 验签一个层级(教学:调用即视为对该级签名+信任链完成检查) */
export function verifyLevel(s: CertVerifyState, level: CertRole): CertVerifyState {
  if (s.verifiedLevels.includes(level)) return s
  const order: CertRole[] = ['root', 'intermediate', 'leaf']
  const idx = order.indexOf(level)
  // 必须先验上级
  for (const prev of order.slice(0, idx)) {
    if (!s.verifiedLevels.includes(prev)) {
      return { ...s, log: [...s.log, `请先验证上级(${prev === 'root' ? '根 CA' : '中间 CA'})`] }
    }
  }
  const node =
    level === 'leaf' ? s.leaf : level === 'intermediate' ? s.intermediate : s.root
  const names: Record<CertRole, string> = {
    root: '根 CA(信任锚点)',
    intermediate: '中间 CA',
    leaf: '站点证书',
  }
  const okSig =
    level === 'root'
      ? true // 根 CA 是信任锚点,系统内置即信
      : node.signatureValid && !node.revoked
  const verifiedLevels = [...s.verifiedLevels, level]
  return {
    ...s,
    verifiedLevels,
    log: [
      ...s.log,
      okSig
        ? `✓ ${names[level]}:签名验证通过(用上级公钥验证下级签名)`
        : `✗ ${names[level]}:签名无效或已被吊销`,
    ],
  }
}

/** 链完整性 + 可信性检查(三级都验签通过才成立) */
export function checkChain(s: CertVerifyState): CertVerifyState {
  const need: CertRole[] = ['root', 'intermediate', 'leaf']
  const done = need.every(r => s.verifiedLevels.includes(r))
  if (!done) return { ...s, log: [...s.log, '尚未完成全部三级验签'] }
  const intermediateOk = s.intermediate.signatureValid && !s.intermediate.revoked
  const leafOk = s.leaf.signatureValid && !s.leaf.revoked
  const trusted = intermediateOk && leafOk
  const issues = trusted ? s.issues : [...s.issues, '证书链不可信:签名无效或已被吊销(对应告警「不受信任的连接」)']
  return {
    ...s,
    checks: { ...s.checks, chain: trusted },
    issues,
    log: [...s.log, trusted ? '链检查 ✓:根 CA 内置信任,中间 CA 与站点证书签名有效' : '链检查 ✗'],
  }
}

/** 域名匹配检查(SAN,支持通配符) */
export function checkHostname(s: CertVerifyState): CertVerifyState {
  const matched = s.leaf.san.some(pattern => wildcardMatches(pattern, s.visiting))
  const issues = matched
    ? s.issues
    : [...s.issues, `域名不匹配:SAN(${s.leaf.san.join(', ')})不包含 ${s.visiting}(对应告警「证书与域名不符」)`]
  return {
    ...s,
    checks: { ...s.checks, hostname: matched },
    issues,
    log: [
      ...s.log,
      matched
        ? `域名检查 ✓:SAN 中有条目匹配 ${s.visiting}`
        : `域名检查 ✗:${s.visiting} 不在 SAN 覆盖范围内`,
    ],
  }
}

/** 有效期窗口检查 */
export function checkTime(s: CertVerifyState, now = NOW): CertVerifyState {
  const inWindow = isWithin(now, s.leaf) && isWithin(now, s.intermediate)
  const issues = inWindow
    ? s.issues
    : [...s.issues, `有效期异常:站点证书 ${s.leaf.notBefore} ~ ${s.leaf.notAfter},当前 ${now}(对应告警「证书已过期」)`]
  return {
    ...s,
    checks: { ...s.checks, time: inWindow },
    issues,
    log: [...s.log, inWindow ? `时间检查 ✓:${now} 在证书有效期窗口内` : `时间检查 ✗:当前 ${now} 不在有效期内`],
  }
}

/** 吊销检查(OCSP 教学模拟) */
export function checkRevocation(s: CertVerifyState, ocspStatus: 'good' | 'revoked' = 'good'): CertVerifyState {
  const ok = ocspStatus === 'good' && !s.leaf.revoked
  const issues = ok
    ? s.issues
    : [...s.issues, '吊销检查:OCSP 返回 revoked —— 证书已被提前吊销(如私钥泄露)']
  return {
    ...s,
    checks: { ...s.checks, revocation: ok },
    issues,
    log: [...s.log, ok ? '吊销检查 ✓:OCSP 状态 good' : '吊销检查 ✗:OCSP 状态 revoked'],
  }
}

/** 汇总结论:四项检查全部通过才发绿锁 */
export function conclude(s: CertVerifyState): CertVerifyState {
  const values = [s.checks.chain, s.checks.hostname, s.checks.time, s.checks.revocation]
  const allChecked = values.every(v => v !== null)
  const passed = allChecked && values.every(v => v === true)
  return {
    ...s,
    concluded: allChecked,
    passed,
    log: [
      ...s.log,
      !allChecked
        ? '还有检查项未执行,无法给出结论'
        : passed
          ? `结论:全部通过 —— ${s.visiting} 身份可信,浏览器显示绿锁 🔒`
          : `结论:验证失败(共 ${s.issues.length} 项)—— 浏览器拦截并告警`,
    ],
  }
}
