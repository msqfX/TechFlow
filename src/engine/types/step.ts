import type { TutorialScene } from './scene'

/** 教程步骤定义 */
export interface SceneStep {
  id: string
  title: string
  description: string
  /** 原理讲解(Markdown) */
  explanation: string
  /** 自动播放时该步骤持续时间(ms),动画本身另有时长 */
  duration?: number
  /** 动作标识:场景据此计算状态转移 */
  action: string
}

/**
 * 步骤状态转移函数:必须为纯函数。
 * 场景状态通过从初始状态开始逐步折叠得到,
 * 因此任意步骤都可以直接重建(goToStep 不依赖连续动画)。
 */
export type StepTransition<S> = (state: S, action: string, stepIndex: number) => S

/** 场景渲染函数:render(state, { animate }) */
export interface RenderOptions {
  /** true:用 GSAP 过渡;false:直接设置为该状态(跳转/恢复) */
  animate: boolean
  /** 渲染来源:上一个状态索引(animate 时可用作差量动画参考) */
  fromIndex: number
}

/** 场景模块默认导出(供注册表加载) */
export interface SceneModule {
  create: () => TutorialScene
}
