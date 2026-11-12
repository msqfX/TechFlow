<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { AlertTriangle, FlaskConical } from '@lucide/vue'
import TutorialStage from '@/components/tutorial/TutorialStage.vue'
import PlayerControls from '@/components/player/PlayerControls.vue'
import StepPanel from '@/components/tutorial/StepPanel.vue'
import InfoPanel from '@/components/tutorial/InfoPanel.vue'
import type { Player } from '@/engine/player/Player'
import { usePageMeta } from '@/composables/usePageMeta'
import { usePlayerState } from '@/composables/usePlayerState'

/**
 * 动画引擎验收页(Phase 3):
 * 完整执行播放、暂停、单步、上一步、跳转、重置、速度调整。
 * 未列入站点导航,仅作为开发验证工具。
 */
usePageMeta({ title: '引擎验收 · 测试场景' })

// shallowRef:避免 Vue 对 class 实例做深层 UnwrapRef(会剥掉私有字段破坏类型)
const player = shallowRef<Player | null>(null)
const error = ref<string | null>(null)
const state = usePlayerState(player)

const steps = computed(() => player.value?.steps ?? [])

function onReady(p: Player) {
  player.value = p
}

function onSelect(index: number) {
  player.value?.goToStep(index)
}
</script>

<template>
  <div class="engine-test container">
    <header class="head">
      <h1><FlaskConical :size="22" /> 动画引擎验收场景</h1>
      <p>验证播放、暂停、单步、上一步、跳转、重置与速度调整。</p>
    </header>

    <div v-if="error" class="error panel">
      <AlertTriangle :size="18" />
      场景加载失败:{{ error }}
    </div>

    <div class="grid">
      <div class="main">
        <TutorialStage scene-type="engine-test" @ready="onReady" @error="error = $event" />
        <PlayerControls v-if="player" :player="player" />
      </div>
      <aside class="side">
        <section class="panel side-block">
          <h3>步骤</h3>
          <StepPanel v-if="state" :steps="steps" :state="state" @select="onSelect" />
        </section>
        <section class="panel side-block">
          <h3>实时信息</h3>
          <InfoPanel v-if="state" :data="state.data" />
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.engine-test {
  padding-top: 36px;
}

.head h1 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 22px;
}

.head p {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 14px;
}

.error {
  margin-top: 16px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
}

.grid {
  margin-top: 20px;
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 16px;
  align-items: start;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.side-block {
  padding: 14px 16px;
}

.side-block h3 {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

@media (max-width: 960px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
