import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { getRouter } from './router'
import { initTheme } from './stores/ui'

import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/main.css'

/**
 * 预渲染策略:构建时由 scripts/prerender.ts 输出各路由的完整 HTML(SEO/首屏),
 * 客户端用 createApp 正常挂载接管页面。不使用 hydration ——
 * 异步路由组件 + 动画场景的水合极易失配,预渲染 + 重渲染是静态内容站的标准做法。
 */
const app = createApp(App)
app.use(createPinia())
initTheme()
const router = getRouter()
app.use(router)

await router.isReady()
app.mount('#app')
