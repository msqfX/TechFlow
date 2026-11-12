/** 纯前端本地搜索:标题/描述/标签/分类,子串 + 子序列模糊匹配打分 */

export interface SearchableItem {
  id: string
  title: string
  description: string
  tags: string[]
  /** 额外可匹配字段(如分类名) */
  extra?: string
}

export interface SearchResult<T> {
  item: T
  score: number
}

/** 子序列匹配:query 的每个字符按顺序出现在 text 中 */
function fuzzySubsequence(text: string, query: string): boolean {
  let i = 0
  for (const ch of text.toLowerCase()) {
    if (ch === query[i]) i++
    if (i === query.length) return true
  }
  return false
}

function scoreItem(item: SearchableItem, query: string): number {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const title = item.title.toLowerCase()
  const desc = item.description.toLowerCase()
  const tags = item.tags.map(t => t.toLowerCase()).join(' ')
  const extra = (item.extra ?? '').toLowerCase()

  let score = 0
  if (title === q) score += 100
  if (title.startsWith(q)) score += 60
  if (title.includes(q)) score += 40
  if (tags.includes(q)) score += 25
  if (desc.includes(q)) score += 15
  if (extra.includes(q)) score += 10
  if (score === 0 && fuzzySubsequence(title, q)) score += 20
  if (score === 0 && fuzzySubsequence(desc + ' ' + tags, q)) score += 5
  return score
}

export function searchItems<T extends SearchableItem>(
  items: T[],
  query: string,
  limit = 12,
): SearchResult<T>[] {
  return items
    .map(item => ({ item, score: scoreItem(item, query) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
