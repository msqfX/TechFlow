/** 内容层类型定义(分类 / 教程 / 实验室 / 学习路线) */

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export interface Category {
  id: string
  name: string
  description: string
  /** lucide 图标键名,通过 AppIcon 组件映射 */
  icon: string
  order: number
  /** 规划中的教程标题(尚未实现,仅在分类页展示) */
  plannedTutorials: string[]
}

export interface TutorialMetadata {
  id: string
  slug: string
  title: string
  description: string
  /** 分类 id */
  category: string
  difficulty: Difficulty
  /** 预计学习时间(分钟) */
  duration: number
  tags: string[]
  prerequisites: string[]
  relatedTutorials: string[]
  /** 场景类型,用于动态加载对应动画场景 */
  sceneType: string
  featured: boolean
  /** 同分类内排序 */
  order: number
}

export interface TutorialChapter {
  id: string
  title: string
  /** Markdown 正文(用于底部原理讲解与 SEO 静态内容) */
  body: string
}

export interface TutorialContent {
  meta: TutorialMetadata
  /** 教学目标 */
  objectives: string[]
  /** 静态图文正文(即使不播放动画也能学懂基本知识) */
  chapters: TutorialChapter[]
}

export interface LaboratoryMeta {
  slug: string
  title: string
  description: string
  category: string
  difficulty: Difficulty
  duration: number
  tags: string[]
  featured: boolean
  order: number
  /** 场景型实验绑定的 sceneType;计算器类实验为空 */
  sceneType?: string
}

export interface LearningPathStep {
  title: string
  /** 可选:关联教程 slug */
  tutorial?: string
  description: string
}

export interface LearningPath {
  slug: string
  title: string
  description: string
  icon: string
  /** 建议学习周期(周) */
  durationWeeks: number
  tags: string[]
  steps: LearningPathStep[]
}
