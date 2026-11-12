import { onUnmounted, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { Player } from '@/engine/player/Player'
import type { PlayerState } from '@/engine/player/PlayerState'

/**
 * 订阅播放器状态。
 * Player 实例的内部状态是可变的,持有方(页面)必须订阅才能响应更新;
 * 不要直接依赖 getSnapshot() 的返回值做响应式渲染。
 */
export function usePlayerState(player: Ref<Player | null>) {
  const state = shallowRef<PlayerState | null>(null)
  let unsub: (() => void) | null = null

  function bind(p: Player | null) {
    unsub?.()
    unsub = null
    if (p) {
      state.value = p.getSnapshot()
      unsub = p.subscribe(s => (state.value = s))
    } else {
      state.value = null
    }
  }

  // 支持异步就绪:player ref 变化时重新绑定
  const stopWatch = watch(player, bind, { immediate: true })
  onUnmounted(() => {
    unsub?.()
    stopWatch()
  })

  return state
}
