<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import { learningPaths } from '@/content/paths'
import { usePageMeta } from '@/composables/usePageMeta'
import AppIcon from '@/components/common/AppIcon.vue'

usePageMeta({
  title: '学习路线',
  description:
    'TechFlow 学习路线:计算机网络、Java 后端原理、Go 底层原理、云原生与数据库原理,按阶段组织,配合交互教程学习。',
})
</script>

<template>
  <div class="paths container">
    <header class="page-head">
      <h1>学习路线</h1>
      <p>按依赖关系组织的阶段式路线,每个阶段都尽量对应一篇可交互的教程。</p>
    </header>

    <div class="path-list">
      <RouterLink
        v-for="p in learningPaths"
        :key="p.slug"
        :to="`/learning-paths/${p.slug}`"
        class="path-row panel"
      >
        <span class="path-icon"><AppIcon :name="p.icon" :size="22" /></span>
        <div class="path-body">
          <h2 class="path-title">{{ p.title }}</h2>
          <p class="path-desc">{{ p.description }}</p>
          <div class="path-tags">
            <span v-for="t in p.tags" :key="t" class="tag">{{ t }}</span>
          </div>
        </div>
        <div class="path-side">
          <span class="path-stat">{{ p.steps.length }} 个阶段</span>
          <span class="path-stat">建议 {{ p.durationWeeks }} 周</span>
          <span class="path-go">查看路线<ChevronRight :size="15" /></span>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.paths {
  padding-top: 40px;
}

.page-head h1 {
  font-size: 28px;
}

.page-head p {
  margin-top: 8px;
  color: var(--text-2);
  font-size: 14px;
}

.path-list {
  margin-top: 26px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.path-row {
  display: flex;
  gap: 18px;
  padding: 20px 22px;
  text-decoration: none;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}

.path-row:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  text-decoration: none;
}

.path-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent-bright);
  flex-shrink: 0;
}

.path-body {
  flex: 1;
  min-width: 0;
}

.path-title {
  font-size: 17px;
  font-weight: 650;
  color: var(--text-1);
}

.path-desc {
  margin-top: 5px;
  color: var(--text-2);
  font-size: 13.5px;
}

.path-tags {
  margin-top: 10px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  font-size: 11.5px;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  background: var(--bg-hover);
  color: var(--text-3);
}

.path-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  flex-shrink: 0;
}

.path-stat {
  font-size: 12px;
  color: var(--text-3);
}

.path-go {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--accent-bright);
  font-size: 13px;
}

@media (max-width: 720px) {
  .path-row {
    flex-direction: column;
  }

  .path-side {
    flex-direction: row;
    align-items: center;
    gap: 14px;
  }
}
</style>
