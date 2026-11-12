<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { categories } from '@/content/categories'

const year = new Date().getFullYear()

const siteLinks = [
  { to: '/tutorials', label: '原理教程' },
  { to: '/laboratory', label: '在线实验室' },
  { to: '/learning-paths', label: '学习路线' },
  { to: '/about', label: '关于本站' },
]
</script>

<template>
  <footer class="footer">
    <div class="footer-inner container">
      <div class="footer-brand">
        <p class="footer-name">TechFlow</p>
        <p class="footer-desc">
          计算机原理可视化交互学习平台。用动态动画和交互实验,让每一个抽象的计算机原理都看得见、能操作、可追踪。
        </p>
        <p class="footer-disclaimer">
          免责声明:本站内容仅用于技术学习,动画均为教学模拟模型,实际实现请以官方文档为准。
        </p>
      </div>

      <nav class="footer-col" aria-label="技术分类">
        <p class="footer-col-title">技术分类</p>
        <RouterLink
          v-for="c in categories"
          :key="c.id"
          :to="`/tutorials/${c.id}`"
          class="footer-link"
        >
          {{ c.name }}
        </RouterLink>
      </nav>

      <nav class="footer-col" aria-label="站内导航">
        <p class="footer-col-title">站内导航</p>
        <RouterLink v-for="l in siteLinks" :key="l.to" :to="l.to" class="footer-link">
          {{ l.label }}
        </RouterLink>
      </nav>
    </div>

    <div class="footer-bottom">
      <p>© {{ year }} TechFlow · 纯前端开源学习项目</p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  border-top: 1px solid var(--border-1);
  background: var(--bg-elevated);
  margin-top: 60px;
}

.footer-inner {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 40px;
  padding-top: 44px;
  padding-bottom: 32px;
}

.footer-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
}

.footer-desc {
  margin-top: 10px;
  font-size: 13px;
  color: var(--text-2);
  max-width: 420px;
}

.footer-disclaimer {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-3);
}

.footer-col-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: 12px;
}

.footer-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.footer-link {
  font-size: 13px;
  color: var(--text-3);
  text-decoration: none;
}

.footer-link:hover {
  color: var(--accent-bright);
  text-decoration: none;
}

.footer-bottom {
  border-top: 1px solid var(--border-1);
  padding: 16px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 720px) {
  .footer-inner {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
