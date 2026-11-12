import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

/**
 * 渲染 Markdown 为 HTML。
 * 内容均为仓库内可信作者编写,不引入用户输入。
 */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false })
  return typeof html === 'string' ? html : ''
}
