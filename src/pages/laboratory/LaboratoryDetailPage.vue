<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { AlertTriangle, ChevronRight, Clock, FlaskConical, MousePointerClick } from '@lucide/vue'
import TutorialStage from '@/components/tutorial/TutorialStage.vue'
import PlayerControls from '@/components/player/PlayerControls.vue'
import InfoPanel from '@/components/tutorial/InfoPanel.vue'
import ActionPanel from '@/components/tutorial/ActionPanel.vue'
import LabIpCalculator from '@/laboratory/ip-calculator/LabIpCalculator.vue'
import LabSubnetCalculator from '@/laboratory/subnet-calculator/LabSubnetCalculator.vue'
import type { Player } from '@/engine/player/Player'
import { getLaboratory, laboratories } from '@/content/labs'
import { difficultyLabel } from '@/utils/format'
import { usePageMeta } from '@/composables/usePageMeta'
import { usePlayerState } from '@/composables/usePlayerState'

const props = defineProps<{ slug: string }>()

const lab = computed(() => getLaboratory(props.slug))
const meta = computed(() => lab.value)

usePageMeta({
  title: lab.value?.title ?? '实验室',
  description: lab.value?.description,
})

// 场景型实验
const player = shallowRef<Player | null>(null)
const sceneError = ref<string | null>(null)
const state = usePlayerState(player)
const teachActions = computed(() => (player.value?.getActions() ?? []).filter(a => !a.danger))
const dangerActions = computed(() => (player.value?.getActions() ?? []).filter(a => a.danger))
const hasSteps = computed(() => (player.value?.steps.length ?? 0) > 0)

function onReady(p: Player) {
  player.value = p
  sceneError.value = null
}

const related = computed(() =>
  laboratories.filter(l => l.slug !== props.slug).slice(0, 4),
)
</script>

<template>
  <div v-if="meta" class="lab-detail">
    <div class="container">
      <header class="head">
        <nav class="crumb" aria-label="面包屑">
          <RouterLink to="/">首页</RouterLink>
          <ChevronRight :size="12" />
          <RouterLink to="/laboratory">在线实验室</RouterLink>
          <ChevronRight :size="12" />
          {{ meta.title }}
        </nav>
        <h1><FlaskConical :size="24" /> {{ meta.title }}</h1>
        <p class="desc">{{ meta.description }}</p>
        <div class="meta">
          <span class="badge" :class="`badge--${meta.difficulty}`">
            <span class="difficulty-dot" />
            {{ difficultyLabel[meta.difficulty] }}
          </span>
          <span class="badge"><Clock :size="12" /> {{ meta.duration }} 分钟</span>
          <span class="badge"><MousePointerClick :size="12" /> 可直接操作</span>
          <span v-for="tag in meta.tags" :key="tag" class="badge">{{ tag }}</span>
        </div>
      </header>

      <!-- 计算器类实验 -->
      <div v-if="meta.slug === 'ip-calculator'" class="lab-body panel">
        <LabIpCalculator />
      </div>
      <div v-else-if="meta.slug === 'subnet-calculator'" class="lab-body panel">
        <LabSubnetCalculator />
      </div>

      <!-- 场景型实验 -->
      <template v-else-if="meta.sceneType">
        <div v-if="sceneError" class="scene-error panel">
          <AlertTriangle :size="18" />
          场景加载失败:{{ sceneError }}
        </div>
        <template v-else>
          <TutorialStage :scene-type="meta.sceneType" @ready="onReady" @error="sceneError = $event" />
          <PlayerControls v-if="player" :player="player" :hide-progress="!hasSteps" />
        </template>

        <div class="lab-grid">
          <div class="panel lab-block">
            <p class="col-title">实时信息</p>
            <InfoPanel v-if="state" :data="state.data" />
          </div>
          <div class="panel lab-block">
            <ActionPanel v-if="player" :player="player" :actions="teachActions" title="实验操作" />
          </div>
          <div v-if="dangerActions.length" class="panel lab-block">
            <ActionPanel v-if="player" :player="player" :actions="dangerActions" title="故障模拟" />
          </div>
        </div>
      </template>

      <div class="usage">
        <p class="usage-title">使用说明</p>
        <p>
          实验的每个操作都会真实改变内部模拟状态 —— 不是演示视频,也不是静态图片。
          想理解原理,请配合对应教程一起使用;实验中的动画均为教学模拟模型,实际实现以官方文档为准。
        </p>
      </div>

      <section class="more">
        <h2 class="section-title">其他实验<span class="en">MORE LABS</span></h2>
        <div class="more-grid">
          <RouterLink
            v-for="l in related"
            :key="l.slug"
            :to="`/laboratory/${l.slug}`"
            class="more-card panel"
          >
            <h3>{{ l.title }}</h3>
            <p>{{ l.description }}</p>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.lab-detail {
  padding-top: 28px;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-3);
}

.crumb a {
  color: var(--text-3);
}

.crumb a:hover {
  color: var(--accent-bright);
  text-decoration: none;
}

.head h1 {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 24px;
}

.desc {
  margin-top: 8px;
  color: var(--text-2);
  max-width: 720px;
}

.meta {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.lab-body {
  margin-top: 20px;
  padding: 22px 24px;
}

.scene-error {
  margin-top: 20px;
  padding: 40px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--danger);
}

.lab-detail > .container > template + *,
.lab-detail .tutorial-stage {
  margin-top: 20px;
}

.lab-detail > .container > .lab-grid,
.lab-detail > .container > .usage {
  margin-top: 16px;
}

.lab-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}

.lab-block {
  padding: 16px 18px;
}

.col-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.usage {
  margin-top: 28px;
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
}

.usage-title {
  font-size: 13.5px;
  font-weight: 650;
  color: var(--accent-bright);
  margin-bottom: 6px;
}

.usage p {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.7;
}

.more {
  margin-top: 44px;
}

.more-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.more-card {
  padding: 16px;
  text-decoration: none;
}

.more-card:hover {
  border-color: var(--accent);
  text-decoration: none;
}

.more-card h3 {
  font-size: 14px;
}

.more-card p {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--text-3);
}

@media (max-width: 900px) {
  .more-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 560px) {
  .more-grid {
    grid-template-columns: 1fr;
  }
}
</style>
