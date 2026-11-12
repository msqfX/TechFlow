import type { TutorialContent, TutorialMetadata } from '@/types/content'

/**
 * 教程内容注册表。
 * 每篇教程位于 src/content/tutorials/<domain>/<slug>.ts,
 * 默认导出 TutorialContent;场景代码位于 src/tutorials/<domain>/ 下,
 * 通过 sceneType 动态加载,与内容解耦。
 */
const modules = import.meta.glob<{ default: TutorialContent }>(
  './tutorials/**/*.ts',
  { eager: true },
)

export const tutorials: TutorialContent[] = Object.values(modules)
  .map(m => m.default)
  .filter((t): t is TutorialContent => Boolean(t))
  .sort((a, b) => a.meta.order - b.meta.order)

const bySlug = new Map(tutorials.map(t => [t.meta.slug, t]))

export function getTutorial(slug: string): TutorialContent | undefined {
  return bySlug.get(slug)
}

export function tutorialsByCategory(categoryId: string): TutorialContent[] {
  return tutorials.filter(t => t.meta.category === categoryId)
}

export function featuredTutorials(): TutorialContent[] {
  return tutorials.filter(t => t.meta.featured)
}

export function allTutorialMeta(): TutorialMetadata[] {
  return tutorials.map(t => t.meta)
}
