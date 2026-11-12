<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from '@lucide/vue'
import type { Player } from '@/engine/player/Player'
import type { PlayerState } from '@/engine/player/PlayerState'

const props = defineProps<{ player: Player; hideProgress?: boolean }>()

const state = ref<PlayerState>(props.player.getSnapshot())
let unsub: (() => void) | undefined
onMounted(() => {
  unsub = props.player.subscribe(s => (state.value = s))
})
onUnmounted(() => unsub?.())

const speeds = [0.5, 1, 1.5, 2]

const isPlaying = computed(() => state.value.status === 'playing')
const atEnd = computed(() => state.value.totalSteps > 0 && state.value.completedSteps >= state.value.totalSteps)
const atStart = computed(() => state.value.completedSteps === 0 && state.value.status === 'idle')
const progress = computed(() =>
  state.value.totalSteps === 0 ? 0 : Math.round((state.value.completedSteps / state.value.totalSteps) * 100),
)

function togglePlay() {
  if (isPlaying.value) props.player.pause()
  else props.player.play()
}
</script>

<template>
  <div class="controls">
    <div class="ctl-buttons">
      <button
        class="ctl-btn"
        type="button"
        title="重置"
        aria-label="重置"
        :disabled="atStart"
        @click="player.reset()"
      >
        <RotateCcw :size="16" />
      </button>
      <button
        class="ctl-btn"
        type="button"
        title="上一步"
        aria-label="上一步"
        :disabled="state.completedSteps === 0 || isPlaying"
        @click="player.prev()"
      >
        <SkipBack :size="16" />
      </button>
      <button
        class="ctl-btn ctl-btn--primary"
        type="button"
        :title="isPlaying ? '暂停' : '播放'"
        :aria-label="isPlaying ? '暂停' : '播放'"
        @click="togglePlay"
      >
        <Pause v-if="isPlaying" :size="18" />
        <Play v-else :size="18" />
      </button>
      <button
        class="ctl-btn"
        type="button"
        title="下一步"
        aria-label="下一步"
        :disabled="atEnd"
        @click="player.next()"
      >
        <SkipForward :size="16" />
      </button>
    </div>

    <div v-if="!hideProgress" class="ctl-progress">
      <div class="ctl-bar">
        <div class="ctl-bar-fill" :style="{ width: progress + '%' }" />
      </div>
      <span class="ctl-step-label">
        {{ state.completedSteps }} / {{ state.totalSteps }}
      </span>
    </div>

    <div class="ctl-speed" role="group" aria-label="播放速度">
      <button
        v-for="s in speeds"
        :key="s"
        type="button"
        class="speed-btn"
        :class="{ active: state.speed === s }"
        @click="player.setSpeed(s)"
      >
        {{ s }}x
      </button>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  background: var(--bg-panel);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.ctl-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  color: var(--text-2);
  transition: color 0.15s var(--ease-out), border-color 0.15s var(--ease-out), background-color 0.15s var(--ease-out);
}

.ctl-btn:hover:not(:disabled) {
  color: var(--text-1);
  border-color: var(--border-2);
  background: var(--bg-hover);
}

.ctl-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ctl-btn--primary {
  width: 40px;
  height: 40px;
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.ctl-btn--primary:hover:not(:disabled) {
  background: var(--accent);
  filter: brightness(1.12);
  color: #fff;
}

.ctl-progress {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 140px;
}

.ctl-bar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--bg-hover);
  overflow: hidden;
}

.ctl-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent-bright));
  transition: width 0.3s var(--ease-out);
}

.ctl-step-label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.ctl-speed {
  display: flex;
  gap: 4px;
}

.speed-btn {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-1);
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-3);
  transition: color 0.15s var(--ease-out), border-color 0.15s var(--ease-out), background-color 0.15s var(--ease-out);
}

.speed-btn:hover {
  color: var(--text-1);
  border-color: var(--border-2);
}

.speed-btn.active {
  color: var(--accent-bright);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
</style>
