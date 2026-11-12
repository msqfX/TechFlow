<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight, Clock } from '@lucide/vue'
import { laboratories } from '@/content/labs'
import { categories } from '@/content/categories'
import { difficultyLabel } from '@/utils/format'
import { usePageMeta } from '@/composables/usePageMeta'
import AppIcon from '@/components/common/AppIcon.vue'

usePageMeta({
  title: '在线实验室',
  description:
    'TechFlow 在线实验室:IPv4 计算器、子网划分、TCP 握手/挥手模拟器、DNS 查询模拟器、网络拓扑模拟器、排序可视化、JVM 内存模拟器,全部可直接操作。',
})

const grouped = computed(() =>
  categories
    .map(c => ({
      category: c,
      labs: laboratories.filter(l => l.category === c.id),
    }))
    .filter(g => g.labs.length > 0),
)
</script>

<template>
  <div class="lab-list container">
    <header class="page-head">
      <h1>在线实验室</h1>
      <p>
        独立于教程的可操作实验工具。每个实验都支持输入参数、执行、观察结果和重置 ——
        直接在浏览器里「动手」理解原理。
      </p>
    </header>

    <section v-for="g in grouped" :key="g.category.id" class="lab-group">
      <h2 class="group-title">
        <AppIcon :name="g.category.icon" :size="17" />
        {{ g.category.name }}
      </h2>
      <div class="lab-grid">
        <RouterLink
          v-for="lab in g.labs"
          :key="lab.slug"
          :to="`/laboratory/${lab.slug}`"
          class="lab-card panel"
        >
          <div class="card-head">
            <h3 class="card-title">{{ lab.title }}</h3>
            <span class="badge" :class="`badge--${lab.difficulty}`">
              <span class="difficulty-dot" />
              {{ difficultyLabel[lab.difficulty] }}
            </span>
          </div>
          <p class="card-desc">{{ lab.description }}</p>
          <div class="card-foot">
            <span class="card-tags">
              <span v-for="tag in lab.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
            </span>
            <span class="card-meta">
              <Clock :size="13" />
              {{ lab.duration }} 分钟
              <ChevronRight :size="14" class="go" />
            </span>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lab-list {
  padding-top: 40px;
}

.page-head h1 {
  font-size: 28px;
}

.page-head p {
  margin-top: 8px;
  color: var(--text-2);
  font-size: 14px;
  max-width: 640px;
}

.lab-group {
  margin-top: 36px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: var(--text-1);
}

.lab-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.lab-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px;
  text-decoration: none;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}

.lab-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  text-decoration: none;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.card-title {
  font-size: 15.5px;
  font-weight: 650;
  color: var(--text-1);
}

.card-desc {
  color: var(--text-2);
  font-size: 13px;
  flex: 1;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.card-tags {
  display: flex;
  gap: 6px;
}

.tag {
  font-size: 11.5px;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--bg-hover);
  color: var(--text-3);
}

.card-meta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-3);
}

.go {
  color: var(--accent-bright);
}

@media (max-width: 820px) {
  .lab-grid {
    grid-template-columns: 1fr;
  }
}
</style>
