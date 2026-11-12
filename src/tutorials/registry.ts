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
