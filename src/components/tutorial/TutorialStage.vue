<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SceneManager } from '@/engine/core/SceneManager'
import { Player } from '@/engine/player/Player'

const props = defineProps<{ sceneType: string }>()
const emit = defineEmits<{
  (e: 'ready', player: Player): void
  (e: 'error', message: string): void
}>()

const container = ref<HTMLElement | null>(null)
let player: Player | null = null
let loadSeq = 0

async function mount(sceneType: string) {
  const seq = ++loadSeq
  player?.destroy()
  player = null
  if (!container.value) return
  try {
    const scene = await SceneManager.mount(sceneType, container.value)
    if (seq !== loadSeq) {
      // 场景类型已变化,丢弃旧场景
      scene.destroy()
      return
    }
    player = new Player(scene)
    emit('ready', player)
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  }
}

onMounted(() => mount(props.sceneType))
watch(() => props.sceneType, t => mount(t))
onBeforeUnmount(() => {
  // 页面切换时销毁场景、停止动画、清理监听(docs §5.6-11)
  player?.destroy()
  player = null
})
</script>

<template>
  <div class="tutorial-stage">
    <div ref="container" class="stage-container" />
  </div>
</template>

<style scoped>
.tutorial-stage {
  width: 100%;
}

.stage-container {
  width: 100%;
  min-height: 340px;
}
</style>
