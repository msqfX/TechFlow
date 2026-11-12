<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppTopNav from '@/components/layout/AppTopNav.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
</script>

<template>
  <div class="layout">
    <AppTopNav />
    <main class="layout-main">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout-main {
  flex: 1;
  padding-top: var(--nav-height);
}
</style>
