<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { usePageMeta } from '@/composables/usePageMeta'

usePageMeta({ title: '页面不存在' })
</script>

<template>
  <div class="notfound">
    <p class="code">404</p>
    <h1>页面不存在</h1>
    <p class="desc">你访问的地址不存在,或已被移动。</p>
    <RouterLink to="/" class="back">返回首页</RouterLink>
  </div>
</template>

<style scoped>
.notfound {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 24px;
  text-align: center;
}

.code {
  font-family: var(--font-mono);
  font-size: 56px;
  font-weight: 700;
  color: var(--accent);
  opacity: 0.85;
}

.desc {
  color: var(--text-2);
}

.back {
  margin-top: 14px;
  padding: 9px 18px;
  border: 1px solid var(--border-2);
  border-radius: var(--radius-md);
  color: var(--text-1);
  text-decoration: none;
}

.back:hover {
  background: var(--bg-hover);
  text-decoration: none;
}
</style>
