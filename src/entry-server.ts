import { createSSRApp } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import App from './App.vue'
import { createAppRouter, routes } from './router'
import { categories } from './content/categories'
import { tutorials } from './content'
import { laboratories } from './content/labs'
import { learningPaths } from './content/paths'

/** SSR 入口:为预渲染脚本创建内存路由的应用实例 */
export function createAppServer(url: string) {
  const app = createSSRApp(App)
  const router = createAppRouter(createMemoryHistory())
  router.push(url)
  app.use(router)
  app.use(createPinia())
  return { app, router }
}

/** 需要预渲染的完整路由清单(含内容驱动的动态路由) */
export function getPrerenderRoutes(): Array<{ path: string }> {
  const paths = new Set<string>(['/', '/tutorials', '/laboratory', '/learning-paths', '/about'])
  for (const c of categories) paths.add(`/tutorials/${c.id}`)
  for (const t of tutorials) paths.add(`/tutorials/${t.meta.slug}`)
  for (const l of laboratories) paths.add(`/laboratory/${l.slug}`)
  for (const p of learningPaths) paths.add(`/learning-paths/${p.slug}`)
  return [...paths].map(path => ({ path }))
}

export interface RouteMeta {
  title: string
  description: string
  /** 结构化数据(Schema.org) */
  jsonLd: Record<string, unknown> | null
  /** 面包屑(用于 BreadcrumbList) */
  breadcrumbs: Array<{ name: string; path: string }>
}

const SITE_NAME = 'TechFlow'

function metaFor(path: string): RouteMeta {
  const crumbs: Array<{ name: string; path: string }> = [{ name: '首页', path: '/' }]
  let title = SITE_NAME
  let description = 'TechFlow 是计算机原理可视化交互学习平台:通过动态可视化动画和交互实验理解技术本质。'
  let jsonLd: Record<string, unknown> | null = null

  const tutorial = tutorials.find(t => `/tutorials/${t.meta.slug}` === path)
  const category = categories.find(c => `/tutorials/${c.id}` === path)
  const lab = laboratories.find(l => `/laboratory/${l.slug}` === path)
  const learningPath = learningPaths.find(p => `/learning-paths/${p.slug}` === path)

  if (tutorial) {
    title = tutorial.meta.title
    description = tutorial.meta.description
    crumbs.push({ name: '原理教程', path: '/tutorials' })
    crumbs.push({ name: tutorial.meta.title, path: `/tutorials/${tutorial.meta.slug}` })
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: tutorial.meta.title,
      description: tutorial.meta.description,
      keywords: tutorial.meta.tags.join(', '),
      timeRequired: `PT${tutorial.meta.duration}M`,
      proficiencyLevel: tutorial.meta.difficulty,
      author: { '@type': 'Organization', name: SITE_NAME },
    }
  } else if (category) {
    title = `${category.name}教程`
    description = category.description
    crumbs.push({ name: '原理教程', path: '/tutorials' }, { name: category.name, path: `/tutorials/${category.id}` })
  } else if (lab) {
    title = lab.title
    description = lab.description
    crumbs.push({ name: '在线实验室', path: '/laboratory' }, { name: lab.title, path: `/laboratory/${lab.slug}` })
  } else if (learningPath) {
    title = learningPath.title
    description = learningPath.description
    crumbs.push({ name: '学习路线', path: '/learning-paths' }, { name: learningPath.title, path: `/learning-paths/${learningPath.slug}` })
  } else {
    const staticMeta: Record<string, { title: string; description: string }> = {
      '/': { title: '用动画理解技术', description: '从 CPU 执行指令到网络数据传输,通过动态可视化和交互实验理解计算机原理。' },
      '/tutorials': { title: '原理教程', description: '浏览全部交互式原理教程:IP、子网、TCP、DNS、交换机、HTTP、CPU、Tomcat、JVM。' },
      '/laboratory': { title: '在线实验室', description: 'IP 计算器、子网划分、TCP 握手模拟器、DNS 模拟器等可操作实验工具。' },
      '/learning-paths': { title: '学习路线', description: '计算机网络、Java 后端、Go 底层、云原生与数据库原理的学习路线。' },
      '/about': { title: '关于本站', description: 'TechFlow 是一个纯前端的计算机原理可视化交互学习平台。' },
    }
    const m = staticMeta[path]
    if (m) {
      title = m.title
      description = m.description
    }
  }

  if (jsonLd && crumbs.length > 1) {
    return {
      title,
      description,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          jsonLd,
          {
            '@type': 'BreadcrumbList',
            itemListElement: crumbs.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: c.name,
            })),
          },
        ],
      },
      breadcrumbs: crumbs,
    }
  }

  return { title, description, jsonLd, breadcrumbs: crumbs }
}

/** 预渲染脚本用:批量取路由 meta */
export function collectRouteMeta(paths: string[]): Record<string, RouteMeta> {
  const map: Record<string, RouteMeta> = {}
  for (const p of paths) map[p] = metaFor(p)
  return map
}

// 供预渲染脚本核对路由完整性
export { routes }
