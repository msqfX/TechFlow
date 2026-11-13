import type { SceneModule } from '@/engine/types/step'

/**
 * 场景注册表:sceneType → 动态加载器。
 * 场景代码按需加载,不进入首屏包(docs §5.7 动画资源按需加载)。
 */
export const sceneLoaders: Record<string, () => Promise<SceneModule>> = {
  'engine-test': () => import('./dev/engine-test.scene').then(m => m.default),
  'ip-address': () => import('./network/ip-address/scene').then(m => m.default),
  'subnet-cidr': () => import('./network/subnet-cidr/scene').then(m => m.default),
  'tcp-handshake': () => import('./network/tcp-handshake/scene').then(m => m.default),
  'tcp-teardown': () => import('./network/tcp-teardown/scene').then(m => m.default),
  'tcp-reliable': () => import('./network/tcp-reliable/scene').then(m => m.default),
  'tls-cert': () => import('./network/tls-cert-verification/scene').then(m => m.default),
  'udp': () => import('./network/udp-protocol/scene').then(m => m.default),
  'bubble-sort': () => import('./algorithm/bubble-sort/scene').then(m => m.default),
  'quick-sort': () => import('./algorithm/quick-sort/scene').then(m => m.default),
  'stack-queue': () => import('./algorithm/stack-queue/scene').then(m => m.default),
  'linked-list': () => import('./algorithm/linked-list/scene').then(m => m.default),
  'array': () => import('./algorithm/array/scene').then(m => m.default),
  'hash-table': () => import('./algorithm/hash-table/scene').then(m => m.default),
  'merge-sort': () => import('./algorithm/merge-sort/scene').then(m => m.default),
  'btree-index': () => import('./database/btree-index/scene').then(m => m.default),
  'mysql-architecture': () => import('./database/mysql-architecture/scene').then(m => m.default),
  'raft-consensus': () => import('./cloud-native/raft-consensus/scene').then(m => m.default),
  'service-discovery': () => import('./cloud-native/service-discovery/scene').then(m => m.default),
  'arp': () => import('./network/arp-protocol/scene').then(m => m.default),
  'dns-resolution': () => import('./infrastructure/dns-resolution/scene').then(m => m.default),
  'switch': () => import('./network/switch-working/scene').then(m => m.default),
  'http-flow': () => import('./infrastructure/http-request-flow/scene').then(m => m.default),
  'tls-handshake': () => import('./network/tls-handshake/scene').then(m => m.default),
  'cdn': () => import('./infrastructure/cdn-working/scene').then(m => m.default),
  'cpu-exec': () => import('./computer/cpu-executes-program/scene').then(m => m.default),
  'process-thread': () => import('./computer/process-thread/scene').then(m => m.default),
  'tomcat': () => import('./middleware/tomcat-internals/scene').then(m => m.default),
  'jvm-memory': () => import('./runtime/jvm-memory-model/scene').then(m => m.default),
  'sorting': () => import('./algorithm/sorting-visualizer/scene').then(m => m.default),
}
