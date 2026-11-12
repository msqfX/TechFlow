/**
 * 预渲染 + SEO 资源生成管线:
 * 1. 对每个路由做 SSR 渲染,写入 dist/<route>/index.html(含独立 title/description/canonical/OG/JSON-LD)
 * 2. 生成 dist/sitemap.xml 与 dist/robots.txt
 *
 * 用法:npm run build && npm run build-ssr && SITE_URL=https://xxx npm run prerender
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToString } from 'vue/server-renderer'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const dist = path.join(root, 'dist')
const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:4173').replace(/\/$/, '')

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

if (!existsSync(dist)) {
  console.error('[prerender] 缺少 dist/,请先运行 npm run build')
  process.exit(1)
}

const ssrEntry = path.join(root, 'dist-ssr', 'entry-server.js')
if (!existsSync(ssrEntry)) {
  console.error('[prerender] 缺少 dist-ssr/entry-server.js,请先运行 npm run build-ssr')
  process.exit(1)
}

interface RouteMeta {
  title: string
  description: string
  jsonLd: Record<string, unknown> | null
}

type ServerModule = {
  createAppServer: (url: string) => { app: import('vue').App; router: { isReady: () => Promise<void> } }
  getPrerenderRoutes: () => Array<{ path: string }>
  collectRouteMeta: (paths: string[]) => Record<string, RouteMeta>
}

const server = (await import(ssrEntry)) as ServerModule

/**
 * 模板缓存:dist/index.html 会被 '/' 路由的渲染结果覆盖,
 * 重复运行 prerender 时必须使用未被注入过的原始模板。
 */
const templatePath = path.join(dist, 'index.html')
const pristinePath = path.join(dist, '.index-template.html')
let template: string
if (existsSync(pristinePath) && readFileSync(pristinePath, 'utf8').includes('<div id="app"></div>')) {
  template = readFileSync(pristinePath, 'utf8')
} else {
  template = readFileSync(templatePath, 'utf8')
  writeFileSync(pristinePath, template)
}

const routes = server.getPrerenderRoutes()
const metas = server.collectRouteMeta(routes.map(r => r.path))

console.log(`[prerender] 共 ${routes.length} 个路由,SITE_URL=${SITE_URL}`)

for (const { path: routePath } of routes) {
  const { app, router } = server.createAppServer(routePath)
  await router.isReady()
  const html = await renderToString(app)
  const meta = metas[routePath]
  if (!meta) {
    console.warn(`[prerender] 路由 ${routePath} 缺少 meta,跳过`)
    continue
  }

  const canonical = `${SITE_URL}${routePath}`
  const headParts = [
    `<title>${escapeHtml(meta.title)} - TechFlow</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    '<meta property="og:site_name" content="TechFlow" />',
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:type" content="${routePath.startsWith('/tutorials/') ? 'article' : 'website'}" />`,
    '<meta property="og:image" content="/og-default.svg" />',
    meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>` : '',
  ].filter(Boolean)

  const page = template
    // 剥离模板默认的 title / description,避免重复标签
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, '')
    .replace('</head>', `    ${headParts.join('\n    ')}\n  </head>`)
    .replace('<div id="app"></div>', () => `<div id="app">${html}</div>`)

  const outDir = routePath === '/' ? dist : path.join(dist, routePath.replace(/^\//, ''))
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'index.html'), page)
  console.log(`[prerender] ${routePath} → ${path.relative(dist, path.join(outDir, 'index.html'))}`)
}

// sitemap.xml
const sitemapItems = routes
  .map(({ path: p }) => {
    const isTutorial = p.startsWith('/tutorials/') && !p.includes('category')
    const priority = p === '/' ? '1.0' : isTutorial ? '0.9' : p.startsWith('/laboratory/') ? '0.8' : '0.7'
    return `  <url><loc>${SITE_URL}${p === '/' ? '/' : p}</loc><changefreq>weekly</changefreq><priority>${priority}</priority></url>`
  })
  .join('\n')
writeFileSync(
  path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapItems}\n</urlset>\n`,
)
console.log('[prerender] sitemap.xml 已生成')

// robots.txt(Sitemap 必须是绝对 URL,由 SITE_URL 决定)
writeFileSync(
  path.join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /dev/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
)
console.log('[prerender] robots.txt 已生成')
console.log('[prerender] 完成 ✓')
