import type { TutorialScene } from '../types/scene'
import type { SceneModule } from '../types/step'
import { sceneLoaders } from '@/tutorials/registry'

/**
 * 场景管理器:按 sceneType 动态加载场景模块并管理挂载。
 * 场景代码与教程内容解耦;加载失败抛出可读错误。
 */
export class SceneManager {
  /** 加载并挂载场景;返回场景实例(由调用方负责 destroy) */
  static async mount(sceneType: string, container: HTMLElement): Promise<TutorialScene> {
    const loader = sceneLoaders[sceneType]
    if (!loader) {
      throw new Error(`SceneManager: 未注册的场景类型 "${sceneType}"`)
    }
    const module = (await loader()) as SceneModule
    const scene = module.create()
    await scene.init(container)
    return scene
  }

  /** 是否存在该场景 */
  static has(sceneType: string): boolean {
    return sceneType in sceneLoaders
  }
}
