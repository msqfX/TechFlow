<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowRight, ChevronRight, FlaskConical, MousePointerClick, Route as RouteIcon } from '@lucide/vue'
import { categories } from '@/content/categories'
import { featuredTutorials, tutorials } from '@/content'
import { laboratories } from '@/content/labs'
import { learningPaths } from '@/content/paths'
import { difficultyLabel } from '@/utils/format'
import { usePageMeta } from '@/composables/usePageMeta'
import AppIcon from '@/components/common/AppIcon.vue'
import HeroTopology from '@/components/home/HeroTopology.vue'

usePageMeta({
  title: '用动画理解技术',
  description:
    'TechFlow 是计算机原理可视化交互学习平台:从 CPU 执行指令到网络数据传输,通过动态可视化动画和交互实验理解技术本质。',
})

const featured = computed(() => featuredTutorials().slice(0, 5))

const stats = computed(() => [
  { value: `${tutorials.length}+`, label: '交互式教程' },
  { value: `${categories.length}`, label: '技术分类' },
  { value: `${laboratories.length}`, label: '在线实验' },
  { value: `${learningPaths.length}`, label: '学习路线' },
])
</script>

<template>
  <div class="home">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-inner container">
        <div class="hero-copy">
          <p class="hero-kicker">COMPUTER SCIENCE, VISUALIZED</p>
          <h1 class="hero-title">让复杂的计算机原理,<br />变得看得见。</h1>
          <p class="hero-sub">
            从 CPU 执行指令到网络数据传输,从 DNS 解析到 JVM
            内存管理,通过动态可视化和交互实验理解技术本质。
          </p>
          <div class="hero-actions">
            <RouterLink to="/tutorials" class="btn-primary">
              探索原理教程
              <ArrowRight :size="16" />
            </RouterLink>
            <RouterLink to="/laboratory" class="btn-ghost">
              <FlaskConical :size="16" />
              进入在线实验室
            </RouterLink>
          </div>
          <dl class="hero-stats">
            <div v-for="s in stats" :key="s.label" class="stat">
              <dt class="stat-value">{{ s.value }}</dt>
              <dd class="stat-label">{{ s.label }}</dd>
            </div>
          </dl>
        </div>
        <div class="hero-visual">
          <HeroTopology />
        </div>
      </div>
    </section>

    <!-- 核心推荐教程 -->
    <section v-if="featured.length" class="section container">
      <div class="section-head">
        <h2 class="section-title">核心推荐教程<span class="en">FEATURED</span></h2>
        <RouterLink to="/tutorials" class="section-more">
          全部教程<ChevronRight :size="15" />
        </RouterLink>
      </div>
      <div class="bento">
        <RouterLink
          v-for="(t, i) in featured"
          :key="t.meta.slug"
          :to="`/tutorials/${t.meta.slug}`"
          class="bento-card panel"
          :class="{ 'bento-hero': i === 0 }"
        >
          <div class="bento-top">
            <span class="bento-cat">{{ t.meta.category }}</span>
            <span class="badge" :class="`badge--${t.meta.difficulty}`">
              <span class="difficulty-dot" />
              {{ difficultyLabel[t.meta.difficulty] }}
            </span>
          </div>
          <h3 class="bento-title">{{ t.meta.title }}</h3>
          <p class="bento-desc">{{ t.meta.description }}</p>
          <div class="bento-foot">
            <span class="badge badge--interactive">
              <MousePointerClick :size="12" />
              交互实验
            </span>
            <span class="bento-go">开始学习<ArrowRight :size="14" /></span>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- 技术分类 -->
    <section class="section container">
      <div class="section-head">
        <h2 class="section-title">技术分类<span class="en">CATEGORIES</span></h2>
        <RouterLink to="/tutorials" class="section-more">
          浏览全部<ChevronRight :size="15" />
        </RouterLink>
      </div>
      <div class="category-grid">
        <RouterLink
          v-for="c in categories"
          :key="c.id"
          :to="`/tutorials/${c.id}`"
          class="category-card panel"
        >
          <span class="category-icon"><AppIcon :name="c.icon" :size="22" /></span>
          <span class="category-name">{{ c.name }}</span>
          <span class="category-desc">{{ c.description }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- 在线实验室 -->
    <section class="section container">
      <div class="section-head">
        <h2 class="section-title">在线实验室<span class="en">LABORATORY</span></h2>
        <RouterLink to="/laboratory" class="section-more">
          全部实验<ChevronRight :size="15" />
        </RouterLink>
      </div>
      <div class="lab-grid">
        <RouterLink
          v-for="lab in laboratories"
          :key="lab.slug"
          :to="`/laboratory/${lab.slug}`"
          class="lab-card panel"
        >
          <span class="lab-icon"><FlaskConical :size="18" :stroke-width="1.8" /></span>
          <span class="lab-title">{{ lab.title }}</span>
          <span class="lab-desc">{{ lab.description }}</span>
          <span class="lab-go">打开实验<ChevronRight :size="14" /></span>
        </RouterLink>
      </div>
    </section>

    <!-- 学习路线 -->
    <section class="section container">
      <div class="section-head">
        <h2 class="section-title">学习路线<span class="en">LEARNING PATHS</span></h2>
        <RouterLink to="/learning-paths" class="section-more">
          查看路线<ChevronRight :size="15" />
        </RouterLink>
      </div>
      <div class="path-grid">
        <RouterLink
          v-for="p in learningPaths"
          :key="p.slug"
          :to="`/learning-paths/${p.slug}`"
          class="path-card panel"
        >
          <span class="path-icon"><RouteIcon :size="18" :stroke-width="1.8" /></span>
          <div class="path-body">
            <span class="path-title">{{ p.title }}</span>
            <span class="path-desc">{{ p.description }}</span>
            <span class="path-meta">
              <AppIcon :name="p.icon" :size="13" />
              {{ p.steps.length }} 个阶段 · 建议 {{ p.durationWeeks }} 周
            </span>
          </div>
          <ChevronRight :size="16" class="path-arrow" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  padding-bottom: 20px;
}

/* Hero */
.hero {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--border-1);
  background:
    radial-gradient(900px 420px at 85% 10%, rgba(49, 139, 255, 0.08), transparent 65%),
    radial-gradient(600px 360px at 10% 90%, rgba(139, 124, 255, 0.06), transparent 60%);
}

.hero-inner {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 32px;
  align-items: center;
  padding-top: 72px;
  padding-bottom: 64px;
}

.hero-kicker {
  font-size: 12px;
  letter-spacing: 0.22em;
  color: var(--accent-bright);
  font-weight: 600;
}

.hero-title {
  margin-top: 14px;
  font-size: clamp(28px, 4.2vw, 44px);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.hero-sub {
  margin-top: 16px;
  max-width: 560px;
  color: var(--text-2);
  font-size: 15.5px;
}

.hero-actions {
  margin-top: 26px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  transition: filter 0.15s var(--ease-out);
}

.btn-primary:hover {
  filter: brightness(1.1);
  text-decoration: none;
}

.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-2);
  color: var(--text-1);
  font-size: 14px;
  text-decoration: none;
  transition: background-color 0.15s var(--ease-out);
}

.btn-ghost:hover {
  background: var(--bg-hover);
  text-decoration: none;
}

.hero-stats {
  margin-top: 36px;
  display: flex;
  gap: 36px;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
  color: var(--text-1);
}

.stat-label {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-3);
}

.hero-visual {
  min-height: 380px;
}

/* 区块通用 */
.section {
  margin-top: 56px;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.section-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 22px;
  font-weight: 650;
}

.section-title .en {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}

.section-more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  color: var(--text-3);
}

.section-more:hover {
  color: var(--accent-bright);
  text-decoration: none;
}

/* Bento 推荐教程 */
.bento {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 14px;
}

.bento-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  text-decoration: none;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}

.bento-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  text-decoration: none;
}

.bento-hero {
  grid-column: span 2;
  grid-row: span 2;
}

.bento-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.bento-cat {
  font-size: 12px;
  color: var(--accent-bright);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.bento-title {
  font-size: 17px;
  font-weight: 650;
  color: var(--text-1);
}

.bento-hero .bento-title {
  font-size: 21px;
}

.bento-desc {
  color: var(--text-2);
  font-size: 13px;
  flex: 1;
}

.bento-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.badge--interactive {
  color: var(--accent-purple);
  border-color: color-mix(in srgb, var(--accent-purple) 40%, transparent);
}

.bento-go {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent-bright);
  font-size: 13px;
}

/* 分类 */
.category-grid {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.category-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  text-decoration: none;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}

.category-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  text-decoration: none;
}

.category-icon {
  color: var(--accent-bright);
}

.category-name {
  color: var(--text-1);
  font-weight: 650;
  font-size: 15px;
}

.category-desc {
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.55;
}

/* 实验室 */
.lab-grid {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.lab-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 16px;
  text-decoration: none;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}

.lab-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  text-decoration: none;
}

.lab-icon {
  color: var(--success);
}

.lab-title {
  color: var(--text-1);
  font-weight: 600;
  font-size: 14.5px;
}

.lab-desc {
  color: var(--text-3);
  font-size: 12.5px;
  flex: 1;
  line-height: 1.55;
}

.lab-go {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--accent-bright);
  font-size: 12.5px;
  margin-top: 4px;
}

/* 学习路线 */
.path-grid {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.path-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  text-decoration: none;
  transition: border-color 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}

.path-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  text-decoration: none;
}

.path-icon {
  color: var(--accent-bright);
  flex-shrink: 0;
}

.path-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.path-title {
  color: var(--text-1);
  font-weight: 650;
  font-size: 15px;
}

.path-desc {
  color: var(--text-2);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: 11.5px;
}

.path-arrow {
  margin-left: auto;
  color: var(--text-3);
  flex-shrink: 0;
}

/* 响应式 */
@media (max-width: 1020px) {
  .hero-inner {
    grid-template-columns: 1fr;
  }

  .hero-visual {
    display: none;
  }

  .bento {
    grid-template-columns: repeat(2, 1fr);
  }

  .category-grid,
  .lab-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .bento,
  .category-grid,
  .lab-grid,
  .path-grid {
    grid-template-columns: 1fr;
  }

  .bento-hero {
    grid-column: span 1;
    grid-row: span 1;
  }

  .hero {
    padding-bottom: 8px;
  }

  .hero-stats {
    gap: 22px;
    flex-wrap: wrap;
  }
}
</style>
