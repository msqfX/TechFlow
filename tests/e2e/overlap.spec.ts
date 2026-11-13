import { expect, test } from '@playwright/test'

/**
 * 全站文字重叠扫描:逐页收集场景内「可见 SVG 文本」的包围盒,断言无相交。
 * 这是标签重叠类 bug 的回归防线(此前已抓到 5 处:统计标签堆叠、
 * 叶节点溢出、镜像分层压框、链表 head/游标挤占、Buffer Pool 值撞标签)。
 */

const SCENE_TUTORIALS = [
  'ip-address', 'subnet-cidr', 'tcp-handshake', 'tcp-teardown', 'switch-working',
  'arp-protocol', 'tcp-reliable', 'tls-handshake', 'tls-cert-verification', 'udp-protocol',
  'dns-resolution', 'cdn-working', 'http-request-flow',
  'cpu-executes-program', 'process-thread',
  'tomcat-internals', 'jvm-memory-model',
  'bubble-sort', 'quick-sort', 'stack-queue', 'linked-list', 'array', 'hash-table', 'merge-sort',
  'bst', 'bfs-dfs', 'btree-index', 'mysql-architecture',
  'raft-consensus', 'service-discovery',
  'docker-container', 'docker-image', 'nginx-working', 'message-queue',
  'mysql-query-execution',
]

const SCENE_LABS = [
  'tcp-handshake', 'tcp-teardown', 'dns-simulator', 'network-simulator',
  'sorting-visualizer', 'jvm-memory',
]

const PAGES = [
  ...SCENE_TUTORIALS.map(s => `/tutorials/${s}`),
  ...SCENE_LABS.map(s => `/laboratory/${s}`),
]

test.describe.configure({ mode: 'serial' })

test('全站场景文字无重叠(包围盒相交检测)', async ({ page }) => {
  test.setTimeout(300_000)
  const violations: Array<{ path: string; pairs: string[] }> = []

  for (const path of PAGES) {
    await page.goto(path)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1800) // 场景懒加载 + 首次渲染
    const result = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('.tf-scene text, .tf-scene-host text'))
        .map(t => {
          const cs = getComputedStyle(t)
          const styleOpacity = (t as HTMLElement).style?.opacity ?? '1'
      if (cs.fill === 'rgba(0, 0, 0, 0)' || cs.opacity === '0' || styleOpacity === '0') return null
          const r = t.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return null
          // 视口内才检测(视口外滚动后再判)
          if (r.top > window.innerHeight || r.bottom < 0) return null
          return { text: (t.textContent || '').slice(0, 12), x1: r.left, y1: r.top, x2: r.right, y2: r.bottom }
        })
        .filter((t): t is NonNullable<typeof t> => t !== null)
      const pairs: string[] = []
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const a = visible[i]!
          const b = visible[j]!
          const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
          const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
          // 阈值:水平 6px 垂直 8px 以上相交才算重叠(避免相邻贴边的误报)
          if (ox > 6 && oy > 8) pairs.push(`"${a.text}" × "${b.text}"`)
        }
      }
      return pairs
    })
    if (result.length > 0) violations.push({ path, pairs: result })
  }

  expect(
    violations,
    `文字重叠:\n${violations.map(v => `${v.path}: ${v.pairs.join('; ')}`).join('\n')}`,
  ).toEqual([])
})
