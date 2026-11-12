/** 页面级 title / description 更新(仅客户端;预渲染时由脚本注入静态标签) */

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function usePageMeta(options: { title: string; description?: string }) {
  if (typeof document === 'undefined') return
  document.title = `${options.title} - TechFlow`
  if (options.description) {
    upsertMeta('name', 'description', options.description)
  }
}
