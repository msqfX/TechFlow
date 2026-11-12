<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { getCategory } from '@/content/categories'
import { getTutorial } from '@/content'
import CategoryDetailPage from './CategoryDetailPage.vue'
import TutorialDetailPage from './TutorialDetailPage.vue'

/**
 * /tutorials/:id 双语义解析:
 * 先按分类 id 匹配,再按教程 slug 匹配,二者不允许冲突(validate-content 校验)。
 */
const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))

const category = computed(() => getCategory(id.value))
const tutorial = computed(() => (category.value ? undefined : getTutorial(id.value)))
</script>

<template>
  <CategoryDetailPage v-if="category" :category-id="category.id" />
  <TutorialDetailPage v-else-if="tutorial" :slug="tutorial.meta.slug" />
  <div v-else class="missing container">
    <h1>未找到「{{ id }}」</h1>
    <p>它既不是技术分类,也不是教程。可以从 <RouterLink to="/tutorials">全部教程</RouterLink> 里找找。</p>
  </div>
</template>

<style scoped>
.missing {
  padding: 80px 28px;
}

.missing h1 {
  font-size: 24px;
}

.missing p {
  margin-top: 10px;
  color: var(--text-2);
}
</style>
