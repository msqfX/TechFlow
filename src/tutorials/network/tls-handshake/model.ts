/**
 * TLS 握手模拟模型(教学简化,以 TLS 1.2 RSA 密钥交换为主线)。
 * 纯函数,可测试。证书验证故障:expired / hostname-mismatch / self-signed。
 */

export type CertStatus = 'ok' | 'expired' | 'hostname-mismatch' | 'self-signed'

export interface CertificateInfo {
  subject: string
  issuer: string
  /** 证书覆盖的域名(SAN) */
  domains: string[]
  notAfter: string
  status: CertStatus
}

export type TlsMsgKind = 'ClientHello' | 'ServerHello' | 'Certificate' | 'KeyExchange' | 'FinishedC' | 'FinishedS'

export interface TlsMsg {
  id: string
  kind: TlsMsgKind
  /** 报文要点(展示用) */
  summary: string
}

export type TlsPhase =
  | 'idle'
  | 'client-hello'
  | 'server-hello'
  | 'cert-validate'
  | 'cert-failed'
  | 'key-exchange'
  | 'derive'
  | 'finished'
  | 'established'

export interface TlsState {
  protocol: 'TLS1.2' | 'TLS1.3'
  messages: TlsMsg[]
  phase: TlsPhase
  clientRandom: string
  serverRandom: string
  preMaster: string
  sessionKey: string | null
  cert: CertificateInfo
  /** 验证通过的三级链 */
  chainVerified: boolean
  domainMatched: boolean
  notExpired: boolean
  trustedIssuer: boolean
  established: boolean
  log: string[]
}

export const DEFAULT_CERT: CertificateInfo = {
  subject: 'www.example.com',
  issuer: 'R3 / Let\u2019s Encrypt(中间 CA)',
  domains: ['www.example.com', 'example.com'],
  notAfter: '2027-02-10',
  status: 'ok',
}

const HEX = 'a3f19c0d7e2b48516a09d8c37f4e52ba'

function rand(seed: number): string {
  return HEX.slice(seed % 16, (seed % 16) + 16)
}

export function createTlsState(cert: CertificateInfo = DEFAULT_CERT): TlsState {
  return {
    protocol: 'TLS1.2',
    messages: [],
    phase: 'idle',
    clientRandom: rand(3),
    serverRandom: '',
    preMaster: '',
    sessionKey: null,
    cert,
    chainVerified: false,
    domainMatched: false,
    notExpired: false,
    trustedIssuer: false,
    established: false,
    log: ['TCP 已建立(三次握手完成),开始 TLS 握手'],
  }
}

function msg(kind: TlsMsgKind, summary: string): TlsMsg {
  return { id: `tls-${kind}-${Math.random().toString(36).slice(2, 6)}`, kind, summary }
}

/** 证书三要素验证(纯函数):返回每项结果 */
export function validateCert(cert: CertificateInfo, visiting: string): {
  chainVerified: boolean
  domainMatched: boolean
  notExpired: boolean
  trustedIssuer: boolean
  passed: boolean
} {
  const domainMatched = cert.status !== 'hostname-mismatch' && cert.domains.includes(visiting)
  const notExpired = cert.status !== 'expired'
  const trustedIssuer = cert.status !== 'self-signed'
  const chainVerified = trustedIssuer && notExpired
  return { chainVerified, domainMatched, notExpired, trustedIssuer, passed: domainMatched && notExpired && trustedIssuer }
}

/** ClientHello */
export function sendClientHello(s: TlsState): TlsState {
  return {
    ...s,
    phase: 'client-hello',
    messages: [...s.messages, msg('ClientHello', `TLS${s.protocol.slice(3)} · 套件列表 · 客户端随机数 ${s.clientRandom.slice(0, 8)}… · SNI=www.example.com`)],
    log: [...s.log, '客户端发送 ClientHello:版本、加密套件、客户端随机数、SNI'],
  }
}

/** ServerHello + Certificate(携带证书) */
export function sendServerHello(s: TlsState): TlsState {
  const serverRandom = rand(7)
  return {
    ...s,
    serverRandom,
    phase: 'server-hello',
    messages: [...s.messages, msg('ServerHello', `选定套件 · 服务端随机数 ${serverRandom.slice(0, 8)}…`), msg('Certificate', `站点证书:${s.cert.subject}(公钥)`)],
    log: [...s.log, '服务端返回 ServerHello 与证书(含公钥)'],
  }
}

/** 本地验证证书;失败则握手终止(告警) */
export function verifyCertificate(s: TlsState, visiting: string): TlsState {
  const r = validateCert(s.cert, visiting)
  if (!r.passed) {
    const reason =
      s.cert.status === 'expired' ? '证书已过期'
      : s.cert.status === 'hostname-mismatch' ? '域名与证书不匹配'
      : '签发 CA 不受信任(自签名)'
    return {
      ...s,
      phase: 'cert-failed',
      domainMatched: r.domainMatched,
      notExpired: r.notExpired,
      trustedIssuer: r.trustedIssuer,
      chainVerified: r.chainVerified,
      log: [...s.log, `证书验证失败:${reason} —— 浏览器拦截并告警,握手终止`],
    }
  }
  return {
    ...s,
    phase: 'cert-validate',
    domainMatched: r.domainMatched,
    notExpired: r.notExpired,
    trustedIssuer: r.trustedIssuer,
    chainVerified: r.chainVerified,
    log: [...s.log, '证书验证通过:签发链可信 + 域名匹配 + 未过期'],
  }
}

/** 密钥交换:客户端生成预主密钥并用公钥加密发送 */
export function sendKeyExchange(s: TlsState): TlsState {
  const preMaster = rand(11)
  return {
    ...s,
    preMaster,
    phase: 'key-exchange',
    messages: [...s.messages, msg('KeyExchange', `预主密钥(用证书公钥加密)${preMaster.slice(0, 8)}…`)],
    log: [...s.log, '客户端生成预主密钥,用证书公钥加密发送 —— 只有持私钥的服务端能解开'],
  }
}

/** 双方推导会话密钥 */
export function deriveSessionKey(s: TlsState): TlsState {
  const key = rand((s.clientRandom.length + s.serverRandom.length + s.preMaster.length) % 16)
  return {
    ...s,
    sessionKey: key,
    phase: 'derive',
    log: [...s.log, `双方用「客户端随机数 + 服务端随机数 + 预主密钥」推导出相同的会话密钥 ${key.slice(0, 8)}…`],
  }
}

/** Finished 交换与建立 */
export function exchangeFinished(s: TlsState): TlsState {
  if (!s.sessionKey) return s
  return {
    ...s,
    phase: 'established',
    established: true,
    messages: [...s.messages, msg('FinishedC', '已加密的 Finished(校验握手完整性)'), msg('FinishedS', '已加密的 Finished(校验握手完整性)')],
    log: [...s.log, '双方交换 Finished 并校验通过 —— 加密通道建立,之后的 HTTP 报文全部对称加密'],
  }
}
