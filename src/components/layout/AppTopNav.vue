<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Menu, Moon, Search, Sun, X } from '@lucide/vue'
import { useUiStore } from '@/stores/ui'
import SearchModal from '@/components/navigation/SearchModal.vue'

const ui = useUiStore()
const route = useRoute()
const searchOpen = ref(false)
const mobileOpen = ref(false)

const navLinks = [
  { to: '/', label: '首页', exact: true },
  { to: '/tutorials', label: '原理教程', exact: false },
  { to: '/laboratory', label: '在线实验室', exact: false },
  { to: '/learning-paths', label: '学习路线', exact: false },
]

function isActive(exact: boolean, to: string): boolean {
  if (exact) return route.path === '/'
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <header class="topnav">
    <div class="topnav-inner container">
      <RouterLink to="/" class="brand" @click="mobileOpen = false">
        <svg class="brand-logo" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#0D1628" stroke="#318BFF" stroke-opacity="0.5" />
          <path
            d="M8 22 H14 M18 22 H24 M8 22 C 11 22 12 12 16 12 S 21 16 24 16"
            stroke="#318BFF"
            stroke-width="2"
            fill="none"
            stroke-linecap="round"
          />
          <circle cx="8" cy="22" r="2.4" fill="#42B8FF" />
          <circle cx="16" cy="12" r="2.4" fill="#8B7CFF" />
          <circle cx="24" cy="16" r="2.4" fill="#20D6A0" />
        </svg>
        <span class="brand-name">TechFlow</span>
        <span class="brand-slogan">用动画理解技术</span>
      </RouterLink>

      <nav class="nav-links" :class="{ open: mobileOpen }" aria-label="主导航">
        <RouterLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="nav-link"
          :class="{ active: isActive(link.exact, link.to) }"
          @click="mobileOpen = false"
        >
          {{ link.label }}
        </RouterLink>
      </nav>

      <div class="nav-actions">
        <button
          class="icon-btn search-trigger"
          type="button"
          aria-label="搜索(Ctrl+K)"
          @click="searchOpen = true"
        >
          <Search :size="17" :stroke-width="1.8" />
          <kbd class="kbd">Ctrl K</kbd>
        </button>
        <button
          class="icon-btn"
          type="button"
          :aria-label="ui.theme === 'dark' ? '切换到亮色主题' : '切换到深色主题'"
          @click="ui.toggleTheme()"
        >
          <Sun v-if="ui.theme === 'dark'" :size="17" :stroke-width="1.8" />
          <Moon v-else :size="17" :stroke-width="1.8" />
        </button>
        <button
          class="icon-btn mobile-toggle"
          type="button"
          aria-label="打开菜单"
          @click="mobileOpen = !mobileOpen"
        >
          <X v-if="mobileOpen" :size="18" :stroke-width="1.8" />
          <Menu v-else :size="18" :stroke-width="1.8" />
        </button>
      </div>
    </div>

    <SearchModal v-model:open="searchOpen" />
  </header>
</template>

<style scoped>
.topnav {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 100;
  height: var(--nav-height);
  background: color-mix(in srgb, var(--bg-page) 82%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border-1);
}

.topnav-inner {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-1);
  text-decoration: none;
}

.brand:hover {
  text-decoration: none;
}

.brand-logo {
  width: 30px;
  height: 30px;
}

.brand-name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.brand-slogan {
  font-size: 12px;
  color: var(--text-3);
  padding-left: 12px;
  border-left: 1px solid var(--border-1);
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}

.nav-link {
  padding: 6px 13px;
  border-radius: var(--radius-pill);
  font-size: 14px;
  color: var(--text-2);
  text-decoration: none;
  transition: color 0.15s var(--ease-out), background-color 0.15s var(--ease-out);
}

.nav-link:hover {
  color: var(--text-1);
  background: var(--bg-hover);
  text-decoration: none;
}

.nav-link.active {
  color: var(--accent-bright);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.nav-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  color: var(--text-2);
  background: transparent;
  transition: color 0.15s var(--ease-out), border-color 0.15s var(--ease-out), background-color 0.15s var(--ease-out);
}

.icon-btn:hover {
  color: var(--text-1);
  border-color: var(--border-2);
  background: var(--bg-hover);
}

.kbd {
  font-size: 11px;
  color: var(--text-3);
  border: 1px solid var(--border-1);
  border-radius: 4px;
  padding: 1px 5px;
  background: var(--bg-elevated);
}

.mobile-toggle {
  display: none;
}

@media (max-width: 860px) {
  .brand-slogan {
    display: none;
  }

  .nav-links {
    position: fixed;
    top: var(--nav-height);
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: stretch;
    padding: 10px 20px 16px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border-1);
    transform: translateY(-8px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s var(--ease-out), transform 0.18s var(--ease-out);
  }

  .nav-links.open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }

  .nav-link {
    padding: 11px 12px;
    border-radius: var(--radius-md);
  }

  .mobile-toggle {
    display: inline-flex;
  }

  .kbd {
    display: none;
  }
}
</style>
