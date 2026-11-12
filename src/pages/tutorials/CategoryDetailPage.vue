<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight, Clock, MousePointerClick } from '@lucide/vue'
import { getCategory } from '@/content/categories'
import { tutorialsByCategory } from '@/content'
import { usePageMeta } from '@/composables/usePageMeta'
import AppIcon from '@/components/common/AppIcon.vue'
import type { Difficulty } from '@/types/content'

const props = defineProps<{ categoryId: string }>()

const category = computed(() => getCategory(props.categoryId))
const tutorials = computed(() =>
  category.value ? tutorialsByCategory(category.value.id) : [],
)

const difficultyLabel: Record<Difficulty, string> = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高级',
}

usePageMeta({
  title: category.value?.name ?? '分类',
  description: category.value?.description,
})
</script>

<template>
  <div v-if="category" class="category-page container">
    <header class="cat-head">
      <span class="cat-icon"><AppIcon :name="category.icon" :size="26" /></span>
      <div>
        <h1>{{ category.name }}</h1>
        <p>{{ category.description }}</p>
      </div>
    </header>

    <section v-if="tutorials.length" class="cat-section">
      <h2 class="section-title">已上线教程<span class="en">TUTORIALS</span></h2>
      <div class="tut-list">
        <RouterLink
          v-for="t in tutorials"
          :key="t.meta.slug"
          :to="`/tutorials/${t.meta.slug}`"
          class="tut-row panel"
        >
          <div class="row-main">
            <div class="row-title-row">
              <h3 class="row-title">{{ t.meta.title }}</h3>
              <span class="badge" :class="`badge--${t.meta.difficulty}`">
                <span class="difficulty-dot" />
                {{ difficultyLabel[t.meta.difficulty] }}
              </span>
              <span class="badge badge--interactive">
                <MousePointerClick :size="12" />
                交互实验
              </span>
            </div>
            <p class="row-desc">{{ t.meta.description }}</p>
          </div>
          <div class="row-side">
            <span class="row-duration">
              <Clock :size="13" />
              约 {{ t.meta.duration }} 分钟
            </span>
            <span class="row-go">开始学习<ChevronRight :size="15" /></span>
          </div>
        </RouterLink>
      </div>
    </section>

    <section v-if="category.plannedTutorials.length" class="cat-section">
      <h2 class="section-title">规划中的教程<span class="en">ROADMAP</span></h2>
      <p class="planned-hint">以下主题已纳入规划,将按阶段逐步上线:</p>
      <div class="planned-grid">
        <span v-for="t in category.plannedTutorials" :key="t" class="planned-item">
          {{ t }}
        </span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.category-page {
  padding-top: 40px;
}

.cat-head {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.cat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent-bright);
  flex-shrink: 0;
}

.cat-head h1 {
  font-size: 26px;
}

.cat-head p {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 14px;
  max-width: 640px;
}

.cat-section {
  margin-top: 40px;
}

.tut-list {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tut-row {
  display: flex;
  gap: 18px;
  padding: 18px 20px;
  text-decoration: none;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}

.tut-row:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
  text-decoration: none;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.row-title {
  font-size: 16px;
  font-weight: 650;
}

.badge--interactive {
  color: var(--accent-purple);
  border-color: color-mix(in srgb, var(--accent-purple) 40%, transparent);
}

.row-desc {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 13.5px;
}

.row-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.row-duration {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-3);
}

.row-go {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  color: var(--accent-bright);
}

.planned-hint {
  margin-top: 12px;
  color: var(--text-3);
  font-size: 13px;
}

.planned-grid {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.planned-item {
  padding: 4px 12px;
  border: 1px dashed var(--border-1);
  border-radius: var(--radius-pill);
  font-size: 12.5px;
  color: var(--text-3);
}

@media (max-width: 720px) {
  .tut-row {
    flex-direction: column;
  }
}
</style>
