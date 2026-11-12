/**
 * 首屏主题预设:在 CSS 渲染前设置 <html data-theme>,避免暗色用户闪屏。
 * 以外链 <script> 在 <head> 中阻塞加载(线上 CSP script-src 'self' 不允许内联脚本)。
 * 默认 light;用户切换过的主题持久化在 localStorage('techflow:theme')。
 */
try {
  var saved = localStorage.getItem('techflow:theme')
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light'
} catch (e) {
  document.documentElement.dataset.theme = 'light'
}
