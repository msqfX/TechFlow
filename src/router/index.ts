import { createRouter } from 'vue-router'
import { createWebHistory } from 'vue-router'
import type { RouterHistory, RouteRecordRaw } from 'vue-router'
import DefaultLayout from '@/components/layout/DefaultLayout.vue'

/**
 * 路由表(对应 docs §2.1 信息架构)。
 * /tutorials/:id 同时承载「分类详情」与「教程详情」:
 * 由 TutorialResolverPage 根据注册表解析,分类 id 与教程 slug 不允许冲突。
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: DefaultLayout,
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/pages/home/HomePage.vue'),
        meta: { title: '用动画理解技术' },
      },
      {
        path: 'tutorials',
        name: 'tutorial-list',
        component: () => import('@/pages/tutorials/TutorialListPage.vue'),
        meta: { title: '原理教程' },
      },
      {
        path: 'tutorials/:id',
        name: 'tutorial-or-category',
        component: () => import('@/pages/tutorials/TutorialResolverPage.vue'),
        meta: { title: '教程' },
      },
      {
        path: 'laboratory',
        name: 'laboratory-list',
        component: () => import('@/pages/laboratory/LaboratoryListPage.vue'),
        meta: { title: '在线实验室' },
      },
      {
        path: 'laboratory/:slug',
        name: 'laboratory-detail',
        component: () => import('@/pages/laboratory/LaboratoryDetailPage.vue'),
        meta: { title: '实验室' },
      },
      {
        path: 'learning-paths',
        name: 'learning-paths',
        component: () => import('@/pages/learning-paths/LearningPathsPage.vue'),
        meta: { title: '学习路线' },
      },
      {
        path: 'learning-paths/:slug',
        name: 'learning-path-detail',
        component: () => import('@/pages/learning-paths/LearningPathDetailPage.vue'),
        meta: { title: '学习路线' },
      },
      {
        path: 'about',
        name: 'about',
        component: () => import('@/pages/about/AboutPage.vue'),
        meta: { title: '关于本站' },
      },
      {
        path: 'dev/engine',
        name: 'dev-engine',
        component: () => import('@/pages/dev/EngineTestPage.vue'),
        meta: { title: '引擎验收', devOnly: true },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    meta: { title: '页面不存在' },
  },
]

/** 创建路由实例(客户端 web history / 服务端 memory history) */
export function createAppRouter(history: RouterHistory) {
  const router = createRouter({
    history,
    routes,
    scrollBehavior(_to, _from, savedPosition) {
      return savedPosition ?? { top: 0 }
    },
  })

  router.afterEach(to => {
    const title = to.meta.title as string | undefined
    if (typeof document !== 'undefined') {
      document.title = title ? `${title} - TechFlow` : 'TechFlow'
    }
  })

  return router
}

/**
 * 浏览器端默认实例(懒创建)。
 * 不能在模块顶层直接 createWebHistory():SSR 打包后该模块也会在 Node 中加载,
 * 而 createWebHistory 依赖 window。
 */
let clientRouter: ReturnType<typeof createAppRouter> | null = null
export function getRouter() {
  if (!clientRouter) {
    clientRouter = createAppRouter(createWebHistory())
  }
  return clientRouter
}
