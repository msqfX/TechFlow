import { describe, expect, it } from 'vitest'
import { categories } from '@/content/categories'
import { featuredTutorials, getTutorial, tutorials } from '@/content'
import { laboratories } from '@/content/labs'
import { learningPaths } from '@/content/paths'
import { sceneLoaders } from '@/tutorials/registry'

/** 内容完整性校验(docs §8 内容管理规范 + §16 验收) */

describe('内容校验', () => {
  it('分类 id 唯一且为 8 个', () => {
    expect(categories.length).toBe(8)
    expect(new Set(categories.map(c => c.id)).size).toBe(8)
  })

  it('教程 slug 唯一,且不与分类 id 冲突(/tutorials/:id 双语义)', () => {
    const slugs = tutorials.map(t => t.meta.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const categoryIds = new Set(categories.map(c => c.id))
    for (const slug of slugs) {
      expect(categoryIds.has(slug), `教程 slug "${slug}" 与分类 id 冲突`).toBe(false)
    }
  })

  it('交付 15 个教程(首批 10 + 二批 5)', () => {
    expect(tutorials.length).toBe(15)
  })

  it('每篇教程的分类都存在', () => {
    const ids = new Set(categories.map(c => c.id))
    for (const t of tutorials) {
      expect(ids.has(t.meta.category), `${t.meta.slug} 引用了不存在的分类 ${t.meta.category}`).toBe(true)
    }
  })

  it('前置知识与相关教程的 slug 都真实存在', () => {
    for (const t of tutorials) {
      for (const p of t.meta.prerequisites) {
        expect(getTutorial(p), `${t.meta.slug} 的前置知识 "${p}" 不存在`).toBeDefined()
      }
      for (const r of t.meta.relatedTutorials) {
        expect(getTutorial(r), `${t.meta.slug} 的相关教程 "${r}" 不存在`).toBeDefined()
      }
    }
  })

  it('每篇教程有至少 3 个章节且内容非空', () => {
    for (const t of tutorials) {
      expect(t.chapters.length, `${t.meta.slug} 章节数不足`).toBeGreaterThanOrEqual(3)
      for (const c of t.chapters) {
        expect(c.body.trim().length, `${t.meta.slug}/${c.id} 正文为空`).toBeGreaterThan(80)
        expect(c.body, `${t.meta.slug}/${c.id} 疑似占位文本`).not.toMatch(/TODO|待补充|placeholder/i)
      }
    }
  })

  it('推荐教程至少 4 个(DNS/TCP/交换机/JVM)', () => {
    const featured = featuredTutorials()
    expect(featured.length).toBeGreaterThanOrEqual(4)
    const titles = featured.map(t => t.meta.title)
    for (const expected of ['DNS 域名解析', 'TCP 三次握手', '交换机工作原理', 'JVM 内存模型']) {
      expect(titles, `缺少推荐教程 ${expected}`).toContain(expected)
    }
  })

  it('已实现教程不应再出现在分类的规划列表中', () => {
    const implemented = new Set(tutorials.map(t => t.meta.title))
    for (const c of categories) {
      for (const planned of c.plannedTutorials) {
        expect(implemented.has(planned), `"${planned}" 已实现,应从 ${c.id} 的规划列表移除`).toBe(false)
      }
    }
  })

  it('实验室场景类型都已注册;共 8 个实验', () => {
    expect(laboratories.length).toBe(8)
    for (const lab of laboratories) {
      if (lab.sceneType) {
        expect(sceneLoaders[lab.sceneType], `实验 ${lab.slug} 的场景 ${lab.sceneType} 未注册`).toBeDefined()
      }
    }
  })

  it('学习路线引用的教程真实存在', () => {
    for (const p of learningPaths) {
      for (const step of p.steps) {
        if (step.tutorial) {
          expect(getTutorial(step.tutorial), `路线 ${p.slug} 引用了不存在的教程 ${step.tutorial}`).toBeDefined()
        }
      }
    }
  })

  it('每篇教程的场景类型都已注册(内容与场景解耦的连接点)', () => {
    for (const t of tutorials) {
      expect(sceneLoaders[t.meta.sceneType], `教程 ${t.meta.slug} 的场景 ${t.meta.sceneType} 未注册`).toBeDefined()
    }
  })
})
