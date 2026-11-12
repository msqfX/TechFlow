<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { RouterLink } from 'vue-router'
import { AlertTriangle, BookOpen, ChevronRight, Clock, GraduationCap, ListChecks, MousePointerClick } from '@lucide/vue'
import TutorialStage from '@/components/tutorial/TutorialStage.vue'
import PlayerControls from '@/components/player/PlayerControls.vue'
import StepPanel from '@/components/tutorial/StepPanel.vue'
import InfoPanel from '@/components/tutorial/InfoPanel.vue'
import ActionPanel from '@/components/tutorial/ActionPanel.vue'
import type { Player } from '@/engine/player/Player'
import { getTutorial } from '@/content'
import { getCategory } from '@/content/categories'
import { difficultyLabel } from '@/utils/format'
import { renderMarkdown } from '@/utils/markdown'
import { usePageMeta } from '@/composables/usePageMeta'
import { usePlayerState } from '@/composables/usePlayerState'

const props = defineProps<{ slug: string }>()

const tutorial = getTutorial(props.slug)
const category = computed(() =>
  tutorial ? getCategory(tutorial.meta.category) : undefined,
)

usePageMeta({
  title: tutorial?.meta.title ?? '教程',
  description: tutorial?.meta.description,
})

// 播放器与场景
const player = shallowRef<Player | null>(null)
const sceneError = ref<string | null>(null)
const state = usePlayerState(player)

const steps = computed(() => player.value?.steps ?? [])
const mode = ref<'teach' | 'lab' | 'challenge'>('teach')
const actions = computed(() => player.value?.getActions() ?? [])
const teachActions = computed(() => actions.value.filter(a => !a.danger))
const challengeActions = computed(() => actions.value.filter(a => a.danger))
const hasInteractive = computed(() => player.value?.interactive ?? false)

/** 当前正在讲解的步骤(最近完成的一步;未开始时为 -1) */
const currentStepIndex = computed(() => {
  if (!state.value) return -1
  const done = state.value.completedSteps
  if (done === 0) return -1
  return Math.min(done, steps.value.length) - 1
})

const explanationHtml = computed(() => {
  const idx = currentStepIndex.value
  if (idx < 0) return ''
  const step = steps.value[idx]
  return step ? renderMarkdown(step.explanation) : ''
})

function onReady(p: Player) {
  player.value = p
  sceneError.value = null
}

function onSelectStep(index: number) {
  player.value?.goToStep(index)
}

function setMode(m: 'teach' | 'lab' | 'challenge') {
  mode.value = m
}

const prereqTutorials = computed(() =>
  (tutorial?.meta.prerequisites ?? [])
    .map(slug => getTutorial(slug))
    .filter((t): t is NonNullable<typeof t> => Boolean(t)),
)

const relatedTutorials = computed(() =>
  (tutorial?.meta.relatedTutorials ?? [])
    .map(slug => getTutorial(slug))
    .filter((t): t is NonNullable<typeof t> => Boolean(t)),
)
</script>

<template>
  <div v-if="tutorial" class="tutorial-page">
    <div class="container">
      <!-- 页头 -->
      <header class="head">
        <nav class="crumb" aria-label="面包屑">
          <RouterLink to="/">首页</RouterLink>
          <ChevronRight :size="12" />
          <RouterLink to="/tutorials">原理教程</RouterLink>
          <ChevronRight :size="12" />
          <RouterLink v-if="category" :to="`/tutorials/${category.id}`" class="crumb-link">
            {{ category.name }}
          </RouterLink>
          <span v-else>{{ tutorial.meta.category }}</span>
        </nav>
        <h1>{{ tutorial.meta.title }}</h1>
        <p class="desc">{{ tutorial.meta.description }}</p>
        <div class="meta">
          <span class="badge" :class="`badge--${tutorial.meta.difficulty}`">
            <span class="difficulty-dot" />
            {{ difficultyLabel[tutorial.meta.difficulty] }}
          </span>
          <span class="badge"><Clock :size="12" /> 约 {{ tutorial.meta.duration }} 分钟</span>
          <span class="badge"><MousePointerClick :size="12" /> 交互实验</span>
          <span v-for="tag in tutorial.meta.tags.slice(0, 5)" :key="tag" class="badge">{{ tag }}</span>
        </div>

        <!-- 模式切换 -->
        <div class="modes" role="tablist" aria-label="学习模式">
          <button
            type="button"
            role="tab"
            class="mode-btn"
            :class="{ active: mode === 'teach' }"
            :aria-selected="mode === 'teach'"
            @click="setMode('teach')"
          >
            <GraduationCap :size="15" />
            教学模式
          </button>
          <button
            type="button"
            role="tab"
            class="mode-btn"
            :class="{ active: mode === 'lab', disabled: !hasInteractive }"
            :aria-selected="mode === 'lab'"
            :disabled="!hasInteractive"
            @click="setMode('lab')"
          >
            <MousePointerClick :size="15" />
            实验模式
          </button>
          <button
            type="button"
            role="tab"
            class="mode-btn"
            :class="{ active: mode === 'challenge', disabled: !hasInteractive || challengeActions.length === 0 }"
            :aria-selected="mode === 'challenge'"
            :disabled="!hasInteractive || challengeActions.length === 0"
            @click="setMode('challenge')"
          >
            <AlertTriangle :size="15" />
            挑战模式
          </button>
        </div>
        <p v-if="mode === 'teach'" class="mode-hint">
          跟随步骤学习:播放动画、单步执行、点击左侧步骤随时跳转。
        </p>
        <p v-else-if="mode === 'lab'" class="mode-hint">
          自由调整参数,观察模拟结果如何变化。
        </p>
        <p v-else class="mode-hint">制造故障,观察异常现象,理解系统如何应对。</p>
      </header>

      <!-- 三栏主体 -->
      <div class="layout">
        <aside class="col-left panel" aria-label="课程步骤导航">
          <p class="col-title"><ListChecks :size="14" /> 步骤</p>
          <StepPanel :steps="steps" :state="state!" @select="onSelectStep" />
        </aside>

        <section class="col-center">
          <div v-if="sceneError" class="scene-error panel">
            <AlertTriangle :size="18" />
            场景加载失败:{{ sceneError }}
          </div>
          <TutorialStage
            v-else
            :scene-type="tutorial.meta.sceneType"
            @ready="onReady"
            @error="sceneError = $event"
          />

          <PlayerControls v-if="player" :player="player" />

          <!-- 原理解讲 -->
          <div class="explain panel">
            <p class="explain-title">
              {{ currentStepIndex >= 0 ? `STEP ${currentStepIndex + 1} · ${steps[currentStepIndex]?.title}` : '开始学习' }}
            </p>
            <div v-if="currentStepIndex >= 0" class="explain-body" v-html="explanationHtml" />
            <div v-else class="explain-body">
              <p>
                点击 <strong>播放</strong> 或 <strong>下一步</strong> 开始。每一步动画都对应一条原理解释,
                右侧面板展示来自模拟器的实时数据;学完动画后,页面底部有完整图文正文。
              </p>
              <p v-if="tutorial.objectives.length">
                <strong>本教程目标:</strong>
                {{ tutorial.objectives.join(';') }}。
              </p>
            </div>
          </div>
        </section>

        <aside class="col-right" aria-label="实时信息与实验操作">
          <div class="panel right-block">
            <p class="col-title"><BookOpen :size="14" /> 实时信息</p>
            <InfoPanel v-if="state" :data="state.data" />
          </div>
          <div v-if="mode === 'lab' && hasInteractive" class="panel right-block">
            <ActionPanel v-if="player" :player="player" :actions="teachActions" title="实验操作" />
          </div>
          <div v-if="mode === 'challenge' && hasInteractive && challengeActions.length" class="panel right-block">
            <ActionPanel v-if="player" :player="player" :actions="challengeActions" title="故障模拟" />
          </div>
        </aside>
      </div>

      <!-- 底部图文正文 -->
      <section class="articles">
        <h2 class="section-title">图文正文<span class="en">ARTICLE</span></h2>
        <p class="articles-hint">即使不播放动画,也可以通过以下内容理解本教程的知识点。</p>
        <article v-for="chapter in tutorial.chapters" :key="chapter.id" class="chapter panel">
          <h3>{{ chapter.title }}</h3>
          <div class="chapter-body" v-html="renderMarkdown(chapter.body)" />
        </article>

        <div v-if="prereqTutorials.length || relatedTutorials.length" class="related">
          <div v-if="prereqTutorials.length" class="related-block panel">
            <p class="col-title">前置知识</p>
            <RouterLink
              v-for="t in prereqTutorials"
              :key="t.meta.slug"
              :to="`/tutorials/${t.meta.slug}`"
              class="related-link"
            >
              {{ t.meta.title }}<ChevronRight :size="13" />
            </RouterLink>
          </div>
          <div v-if="relatedTutorials.length" class="related-block panel">
            <p class="col-title">相关教程</p>
            <RouterLink
              v-for="t in relatedTutorials"
              :key="t.meta.slug"
              :to="`/tutorials/${t.meta.slug}`"
              class="related-link"
            >
              {{ t.meta.title }}<ChevronRight :size="13" />
            </RouterLink>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tutorial-page {
  padding-top: 28px;
}

.head h1 {
  margin-top: 10px;
  font-size: 25px;
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

.desc {
  margin-top: 8px;
  color: var(--text-2);
  font-size: 14px;
  max-width: 760px;
}

.meta {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.meta .badge {
  gap: 5px;
}

.modes {
  margin-top: 18px;
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-2);
  transition: background-color 0.15s var(--ease-out), color 0.15s var(--ease-out);
}

.mode-btn:hover:not(:disabled) {
  color: var(--text-1);
  background: var(--bg-hover);
}

.mode-btn.active {
  background: var(--accent);
  color: #fff;
}

.mode-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mode-hint {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--text-3);
}

.layout {
  margin-top: 20px;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr) 292px;
  gap: 16px;
  align-items: start;
}

.col-left {
  padding: 14px;
  position: sticky;
  top: calc(var(--nav-height) + 12px);
  max-height: calc(100vh - var(--nav-height) - 24px);
  overflow-y: auto;
}

.col-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: calc(var(--nav-height) + 12px);
}

.right-block {
  padding: 14px 16px;
}

.col-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.col-center {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.scene-error {
  padding: 40px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  color: var(--danger);
}

.explain {
  padding: 16px 18px;
}

.explain-title {
  font-size: 14px;
  font-weight: 650;
  color: var(--accent-bright);
}

.explain-body {
  margin-top: 10px;
  font-size: 13.5px;
  color: var(--text-2);
  line-height: 1.75;
}

.explain-body :deep(p + p) {
  margin-top: 8px;
}

.explain-body :deep(code) {
  color: var(--accent-bright);
}

.explain-body :deep(strong) {
  color: var(--text-1);
}

.articles {
  margin-top: 48px;
}

.articles-hint {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-3);
}

.chapter {
  margin-top: 18px;
  padding: 22px 26px;
}

.chapter h3 {
  font-size: 17px;
  margin-bottom: 12px;
}

.chapter-body {
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.85;
}

.chapter-body :deep(p + p) {
  margin-top: 10px;
}

.chapter-body :deep(code) {
  color: var(--accent-bright);
}

.chapter-body :deep(strong) {
  color: var(--text-1);
}

.chapter-body :deep(table) {
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 13px;
}

.chapter-body :deep(th),
.chapter-body :deep(td) {
  border: 1px solid var(--border-1);
  padding: 6px 12px;
  text-align: left;
}

.chapter-body :deep(th) {
  color: var(--text-1);
  background: var(--bg-hover);
}

.related {
  margin-top: 24px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.related-block {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.related-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13.5px;
  color: var(--accent-bright);
}

@media (max-width: 1180px) {
  .layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .col-right {
    grid-column: 1 / -1;
    position: static;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}

@media (max-width: 780px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .col-left {
    position: static;
    max-height: none;
  }

  .related {
    grid-template-columns: 1fr;
  }
}
</style>
