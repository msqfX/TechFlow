<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ChevronRight, Clock, MousePointerClick } from '@lucide/vue'
import { categories, getCategory } from '@/content/categories'
import { tutorials, tutorialsByCategory } from '@/content'
import { usePageMeta } from '@/composables/usePageMeta'
import AppIcon from '@/components/common/AppIcon.vue'
import type { Difficulty } from '@/types/content'

const route = useRoute()
const router = useRouter()

const activeCategory = computed<string | null>(() => {
  const id = route.query.category
  return typeof id === 'string' && getCategory(id) ? id : null
})

const difficultyLabel: Record<Difficulty, string> = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高级',
}

const shown = computed(() =>
  activeCategory.value ? tutorialsByCategory(activeCategory.value) : tutorials,
)

function selectCategory(id: string | null) {
  router.push({ path: '/tutorials', query: id ? { category: id } : {} })
}

usePageMeta({
  title: '原理教程',
  description:
    '浏览 TechFlow 全部交互式原理教程:IP 地址、子网划分、TCP 握手、DNS 解析、交换机、HTTP、CPU、Tomcat、JVM 内存模型。',
})
</script>

<template>
  <div class="list-page container">
    <header class="page-head">
      <h1>原理教程</h1>
      <p>每篇教程都是一个可观察、可操作的交互式实验,而不只是一篇文章。</p>
    </header>

    <div class="list-body">
      <aside class="side-nav panel" aria-label="技术分类导航">
        <button
          type="button"
          class="side-item"
          :class="{ active: activeCategory === null }"
          @click="selectCategory(null)"
        >
          全部教程
          <span class="side-count">{{ tutorials.length }}</span>
        </button>
        <button
          v-for="c in categories"
          :key="c.id"
          type="button"
          class="side-item"
          :class="{ active: activeCategory === c.id }"
          @click="selectCategory(c.id)"
        >
          <span class="side-icon"><AppIcon :name="c.icon" :size="15" /></span>
          {{ c.name }}
          <span class="side-count">
            {{ tutorialsByCategory(c.id).length }}
          </span>
        </button>
      </aside>

      <section class="list-main">
        <template v-if="shown.length > 0">
          <RouterLink
            v-for="t in shown"
            :key="t.meta.slug"
            :to="`/tutorials/${t.meta.slug}`"
            class="tutorial-row panel"
          >
            <div class="row-main">
              <div class="row-title-row">
                <h3 class="row-title">{{ t.meta.title }}</h3>
                <span class="badge" :class="`badge--${t.meta.difficulty}`">
                  <span class="difficulty-dot" />
                  {{ difficultyLabel[t.meta.difficulty] }}
                </span>
                <span
                  v-if="t.meta.sceneType"
                  class="badge badge--interactive"
                  title="包含可操作的动画实验"
                >
                  <MousePointerClick :size="12" />
                  交互实验
                </span>
              </div>
              <p class="row-desc">{{ t.meta.description }}</p>
              <div class="row-tags">
                <span v-for="tag in t.meta.tags.slice(0, 4)" :key="tag" class="tag">
                  {{ tag }}
                </span>
              </div>
            </div>
            <div class="row-side">
              <span class="row-duration">
                <Clock :size="13" />
                约 {{ t.meta.duration }} 分钟
              </span>
              <span class="row-go">
                开始学习
                <ChevronRight :size="15" />
              </span>
            </div>
          </RouterLink>
        </template>

        <div v-else class="empty panel">
          <p>该分类的教程正在制作中,先看看其他分类吧。</p>
          <button type="button" class="btn-text" @click="selectCategory(null)">
            查看全部教程
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.list-page {
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

.list-body {
  margin-top: 26px;
  display: grid;
  grid-template-columns: 230px 1fr;
  gap: 20px;
  align-items: start;
}

.side-nav {
  padding: 10px;
  position: sticky;
  top: calc(var(--nav-height) + 16px);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.side-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  color: var(--text-2);
  text-align: left;
  transition: background-color 0.15s var(--ease-out), color 0.15s var(--ease-out);
}

.side-item:hover {
  background: var(--bg-hover);
  color: var(--text-1);
}

.side-item.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent-bright);
}

.side-icon {
  display: inline-flex;
}

.side-count {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.list-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tutorial-row {
  display: flex;
  gap: 18px;
  padding: 18px 20px;
  text-decoration: none;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}

.tutorial-row:hover {
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
  font-size: 16.5px;
  font-weight: 650;
  color: var(--text-1);
}

.badge--interactive {
  color: var(--accent-purple);
  border-color: color-mix(in srgb, var(--accent-purple) 40%, transparent);
}

.row-desc {
  margin-top: 6px;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.6;
}

.row-tags {
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

.empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--text-2);
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.btn-text {
  color: var(--accent-bright);
  font-size: 14px;
}

@media (max-width: 860px) {
  .list-body {
    grid-template-columns: 1fr;
  }

  .side-nav {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .side-count {
    margin-left: 4px;
  }

  .tutorial-row {
    flex-direction: column;
  }

  .row-side {
    flex-direction: row;
    align-items: center;
  }
}
</style>
