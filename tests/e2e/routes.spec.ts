import { expect, test } from '@playwright/test'

/**
 * 全路由冒烟:逐页断言「真实渲染标记存在 + 无场景错误 + 无页面异常」。
 * 这是 props 空白类 bug 的回归防线(此类 bug 不抛错,只渲染空壳)。
 */

const CATEGORIES = ['computer', 'network', 'infrastructure', 'runtime', 'middleware', 'cloud-native', 'database', 'algorithm']

const TUTORIALS = [
  'ip-address', 'subnet-cidr', 'tcp-handshake', 'tcp-teardown', 'switch-working',
  'arp-protocol', 'tcp-reliable', 'tls-handshake', 'tls-cert-verification', 'udp-protocol',
  'dns-resolution', 'cdn-working', 'http-request-flow',
  'cpu-executes-program', 'process-thread',
  'tomcat-internals', 'jvm-memory-model',
  'bubble-sort', 'quick-sort', 'stack-queue', 'linked-list', 'array', 'hash-table', 'merge-sort',
  'bst', 'bfs-dfs', 'btree-index', 'mysql-architecture',
  'raft-consensus', 'service-discovery',
  'docker-container', 'docker-image', 'nginx-working', 'message-queue',
].map(slug => ({ path: `/tutorials/${slug}`, marker: '.tf-scene-host' }))

const LABS = [
  { path: '/laboratory/ip-calculator', marker: '.ipcalc' },
  { path: '/laboratory/subnet-calculator', marker: '.subtable' },
  { path: '/laboratory/tcp-handshake', marker: '.tf-scene-host' },
  { path: '/laboratory/tcp-teardown', marker: '.tf-scene-host' },
  { path: '/laboratory/dns-simulator', marker: '.tf-scene-host' },
  { path: '/laboratory/network-simulator', marker: '.tf-scene-host' },
  { path: '/laboratory/sorting-visualizer', marker: '.tf-scene-canvas' },
  { path: '/laboratory/jvm-memory', marker: '.tf-scene-host' },
]

const STATIC_ROUTES = [
  { path: '/', marker: '.bento' },
  { path: '/tutorials', marker: '.tutorial-row' },
  { path: '/laboratory', marker: '.lab-card' },
  { path: '/learning-paths', marker: '.path-row' },
  { path: '/about', marker: '.principles' },
  ...CATEGORIES.map(c => ({ path: `/tutorials/${c}`, marker: '.cat-head' })),
  ...['network', 'java-backend', 'go-internals', 'cloud-native', 'database'].map(p => ({
    path: `/learning-paths/${p}`,
    marker: '.step-list',
  })),
]

export const ALL = [...STATIC_ROUTES, ...TUTORIALS, ...LABS]

test.describe.configure({ mode: 'serial' })

test('静态路由:渲染标记 + 标题', async ({ page }) => {
  for (const r of STATIC_ROUTES) {
    await page.goto(r.path)
    await expect(page.locator(r.marker).first()).toBeVisible()
    expect(await page.title(), r.path).toMatch('TechFlow')
  }
})

test('分类页:8 个分类全部渲染', async ({ page }) => {
  for (const c of CATEGORIES) {
    await page.goto(`/tutorials/${c}`)
    await expect(page.locator('.cat-head')).toBeVisible()
    await expect(page.locator('.planned-item').first()).toBeVisible()
  }
})

test('全部教程页:场景挂载 + 无错误 + 无页面异常', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', e => pageErrors.push(String(e)))
  for (const t of TUTORIALS) {
    await page.goto(t.path)
    await expect(page.locator(t.marker).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.step-list .step-item').first()).toBeVisible()
    // 用 evaluate 精确检查(确定性,无 locator 重试竞态)
    const hasSceneError = await page.evaluate(() => (document.body.textContent || '').includes('场景加载失败'))
    expect(hasSceneError, `${t.path} 出现场景加载失败`).toBe(false)
  }
  expect(pageErrors, pageErrors.join('\n')).toEqual([])
})

test('全部实验室:场景/表单挂载 + 无错误', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', e => pageErrors.push(String(e)))
  for (const l of LABS) {
    await page.goto(l.path)
    await expect(page.locator(l.marker).first()).toBeVisible({ timeout: 15_000 })
    const hasSceneError = await page.evaluate(() => (document.body.textContent || '').includes('场景加载失败'))
    expect(hasSceneError, `${l.path} 出现场景加载失败`).toBe(false)
  }
  expect(pageErrors, pageErrors.join('\n')).toEqual([])
})

test('404:未知路径渲染NotFound', async ({ page }) => {
  await page.goto('/no-such-page-xyz')
  await expect(page.getByText('页面不存在')).toBeVisible()
})
