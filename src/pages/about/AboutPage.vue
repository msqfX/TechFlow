<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Eye, MousePointerClick, TrendingUp, FlaskConical } from '@lucide/vue'
import { usePageMeta } from '@/composables/usePageMeta'

usePageMeta({
  title: '关于本站',
  description:
    'TechFlow 是一个纯前端的计算机原理可视化交互学习平台:看得见、能操作、可追踪、能理解、可实验。',
})

const principles = [
  {
    icon: Eye,
    title: '看得见',
    desc: '通过动态动画呈现抽象技术原理,而不是静态架构图。',
  },
  {
    icon: MousePointerClick,
    title: '能操作',
    desc: '调整参数、点击组件、发起模拟请求,观察运行结果。',
  },
  {
    icon: TrendingUp,
    title: '可追踪',
    desc: '完整展示技术运行的每个步骤与数据流转。',
  },
  {
    icon: FlaskConical,
    title: '可实验',
    desc: '支持正常流程、异常流程和故障模拟。',
  },
]

const techStack = [
  { name: 'Vue 3', desc: '组件化 UI 框架' },
  { name: 'TypeScript', desc: '严格模式类型系统' },
  { name: 'Vite', desc: '构建与开发服务' },
  { name: 'GSAP', desc: '动画编排引擎' },
  { name: 'SVG / Canvas', desc: '可视化渲染' },
  { name: 'Pinia', desc: '状态管理' },
]
</script>

<template>
  <div class="about container">
    <header class="head">
      <h1>关于本站</h1>
      <p class="lead">
        TechFlow 不是一个传统技术博客,而是一个运行在浏览器中的计算机原理实验室。它把 CPU
        指令执行、网络数据传输、DNS 解析、JVM 内存管理这些抽象原理,变成可以观察、可以操作、可以实验的动态场景。
      </p>
    </header>

    <section class="principles">
      <div v-for="p in principles" :key="p.title" class="principle panel">
        <span class="p-icon"><component :is="p.icon" :size="20" :stroke-width="1.8" /></span>
        <h3>{{ p.title }}</h3>
        <p>{{ p.desc }}</p>
      </div>
    </section>

    <section class="block">
      <h2>它是纯前端项目</h2>
      <p>
        所有教程内容、动画配置和模拟计算均在浏览器本地执行:没有后端服务、没有数据库、没有账号体系,也不采集任何个人数据。
        你可以通过 URL 参数分享特定的实验配置。整个站点可以静态部署,一键 Docker 启动。
      </p>
    </section>

    <section class="block">
      <h2>技术栈</h2>
      <div class="stack-grid">
        <div v-for="t in techStack" :key="t.name" class="stack-item panel">
          <span class="stack-name">{{ t.name }}</span>
          <span class="stack-desc">{{ t.desc }}</span>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>动画的正确性声明</h2>
      <p>
        所有动画均为<strong>教学模拟模型</strong>:它们忠实呈现协议状态机、数据结构与运行机制的核心逻辑,
        但对真实实现做了简化(例如 JVM 的 GC 使用教学模型,而非复现某个真实垃圾回收器的全部细节)。
        每篇教程都会明确标注这类简化,生产实践请以官方文档为准。
      </p>
    </section>

    <section class="block cta">
      <h2>开始探索</h2>
      <div class="cta-links">
        <RouterLink to="/tutorials" class="btn-primary">浏览原理教程</RouterLink>
        <RouterLink to="/laboratory" class="btn-ghost">进入在线实验室</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.about {
  padding-top: 40px;
  max-width: 860px;
}

.head h1 {
  font-size: 28px;
}

.lead {
  margin-top: 14px;
  color: var(--text-2);
  font-size: 15px;
  line-height: 1.8;
}

.principles {
  margin-top: 32px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.principle {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.p-icon {
  color: var(--accent-bright);
}

.principle h3 {
  font-size: 14.5px;
}

.principle p {
  font-size: 12.5px;
  color: var(--text-3);
  line-height: 1.6;
}

.block {
  margin-top: 40px;
}

.block h2 {
  font-size: 19px;
  margin-bottom: 12px;
}

.block p {
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.8;
}

.stack-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stack-item {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stack-name {
  font-family: var(--font-mono);
  font-size: 13.5px;
  color: var(--text-1);
}

.stack-desc {
  font-size: 12px;
  color: var(--text-3);
}

.cta-links {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-primary {
  display: inline-flex;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
}

.btn-primary:hover {
  filter: brightness(1.1);
  text-decoration: none;
}

.btn-ghost {
  display: inline-flex;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-2);
  color: var(--text-1);
  font-size: 14px;
  text-decoration: none;
}

.btn-ghost:hover {
  background: var(--bg-hover);
  text-decoration: none;
}

@media (max-width: 860px) {
  .principles {
    grid-template-columns: repeat(2, 1fr);
  }

  .stack-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 560px) {
  .principles,
  .stack-grid {
    grid-template-columns: 1fr;
  }
}
</style>
