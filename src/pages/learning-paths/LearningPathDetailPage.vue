<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowRight, Clock, CircleCheck } from '@lucide/vue'
import { getLearningPath, learningPaths } from '@/content/paths'
import { getTutorial } from '@/content'
import { usePageMeta } from '@/composables/usePageMeta'

const route = useRoute()
const path = computed(() => getLearningPath(String(route.params.slug ?? '')))

const steps = computed(() =>
  (path.value?.steps ?? []).map(s => ({
    ...s,
    linked: s.tutorial ? getTutorial(s.tutorial) : undefined,
  })),
)

usePageMeta({
  title: path.value?.title ?? '学习路线',
  description: path.value?.description,
})

const others = computed(() =>
  learningPaths.filter(p => p.slug !== path.value?.slug).slice(0, 2),
)
</script>

<template>
  <div v-if="path" class="path-detail container">
    <header class="head">
      <p class="crumb">
        <RouterLink to="/learning-paths">学习路线</RouterLink>
        <span>/</span>
        {{ path.title }}
      </p>
      <h1>{{ path.title }}</h1>
      <p class="desc">{{ path.description }}</p>
      <div class="meta">
        <span class="badge"><Clock :size="12" /> 建议 {{ path.durationWeeks }} 周</span>
        <span class="badge">{{ path.steps.length }} 个阶段</span>
        <span v-for="t in path.tags" :key="t" class="badge">{{ t }}</span>
      </div>
    </header>

    <section class="steps">
      <h2 class="section-title">路线阶段<span class="en">STAGES</span></h2>
      <ol class="step-list">
        <li v-for="(s, i) in steps" :key="s.title" class="step panel">
          <span class="step-index">{{ i + 1 }}</span>
          <div class="step-body">
            <h3 class="step-title">{{ s.title }}</h3>
            <p class="step-desc">{{ s.description }}</p>
            <RouterLink
              v-if="s.linked"
              :to="`/tutorials/${s.linked.meta.slug}`"
              class="step-link"
            >
              <CircleCheck :size="14" />
              配套教程:{{ s.linked.meta.title }}
              <ArrowRight :size="13" />
            </RouterLink>
            <span v-else class="step-planned">配套教程制作中,可先按描述自行查阅资料</span>
          </div>
        </li>
      </ol>
    </section>

    <section v-if="others.length" class="more">
      <h2 class="section-title">其他路线<span class="en">MORE</span></h2>
      <div class="more-grid">
        <RouterLink
          v-for="p in others"
          :key="p.slug"
          :to="`/learning-paths/${p.slug}`"
          class="more-card panel"
        >
          <h3>{{ p.title }}</h3>
          <p>{{ p.description }}</p>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.path-detail {
  padding-top: 36px;
}

.crumb {
  display: flex;
  gap: 8px;
  font-size: 13px;
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
  font-size: 26px;
}

.desc {
  margin-top: 8px;
  color: var(--text-2);
  max-width: 640px;
}

.meta {
  margin-top: 14px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.meta .badge {
  gap: 6px;
}

.steps {
  margin-top: 40px;
}

.step-list {
  list-style: none;
  margin-top: 18px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  counter-reset: step;
}

.step {
  display: flex;
  gap: 16px;
  padding: 18px 20px;
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border-2);
  color: var(--accent-bright);
  font-family: var(--font-mono);
  font-size: 13px;
  flex-shrink: 0;
}

.step-body {
  flex: 1;
}

.step-title {
  font-size: 15.5px;
  font-weight: 650;
}

.step-desc {
  margin-top: 4px;
  color: var(--text-2);
  font-size: 13.5px;
}

.step-link {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--success);
  font-size: 13px;
}

.step-link:hover {
  text-decoration: none;
  color: var(--success);
  filter: brightness(1.15);
}

.step-planned {
  margin-top: 10px;
  display: inline-flex;
  font-size: 12px;
  color: var(--text-3);
}

.more {
  margin-top: 44px;
}

.more-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.more-card {
  padding: 16px 18px;
  text-decoration: none;
}

.more-card:hover {
  border-color: var(--accent);
  text-decoration: none;
}

.more-card h3 {
  font-size: 14.5px;
}

.more-card p {
  margin-top: 4px;
  color: var(--text-3);
  font-size: 12.5px;
}
</style>
