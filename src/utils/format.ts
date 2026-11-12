import type { Difficulty } from '@/types/content'

export const difficultyLabel: Record<Difficulty, string> = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高级',
}

export function formatDuration(minutes: number): string {
  return `约 ${minutes} 分钟`
}
