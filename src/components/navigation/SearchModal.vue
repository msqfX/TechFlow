<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { BookOpen, FileText, Search } from '@lucide/vue'
import { categories } from '@/content/categories'
import { tutorials } from '@/content'
import type { SearchableItem } from '@/utils/search'
import { searchItems } from '@/utils/search'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const query = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

type Entry = SearchableItem & { to: string; kind: 'tutorial' | 'category' }

const index = computed<Entry[]>(() => [
  ...tutorials.map<Entry>(t => ({
    id: t.meta.slug,
    title: t.meta.title,
    description: t.meta.description,
    tags: t.meta.tags,
    extra: t.meta.category,
    to: `/tutorials/${t.meta.slug}`,
    kind: 'tutorial',
  })),
  ...categories.map<Entry>(c => ({
    id: c.id,
    title: c.name,
    description: c.description,
    tags: ['分类'],
    extra: '技术分类',
    to: `/tutorials/${c.id}`,
    kind: 'category',
  })),
])

const results = computed(() => (query.value ? searchItems(index.value, query.value) : []))

watch(
  () => props.open,
  open => {
    if (open) {
      query.value = ''
      requestAnimationFrame(() => inputEl.value?.focus())
    }
  },
)

function close() {
  emit('update:open', false)
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    emit('update:open', !props.open)
  } else if (e.key === 'Escape' && props.open) {
    close()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="search-fade">
      <div v-if="open" class="search-overlay" @click.self="close">
        <div class="search-panel" role="dialog" aria-label="搜索">
          <div class="search-input-row">
            <Search :size="17" :stroke-width="1.8" class="search-icon" />
            <input
              ref="inputEl"
              v-model="query"
              class="search-input"
              type="text"
              placeholder="搜索教程、分类、标签…"
              spellcheck="false"
            />
            <kbd class="kbd">Esc</kbd>
          </div>

          <div class="search-results">
            <template v-if="results.length > 0">
              <RouterLink
                v-for="r in results"
                :key="r.item.kind + ':' + r.item.id"
                :to="r.item.to"
                class="result-item"
                @click="close"
              >
                <span class="result-kind" :class="r.item.kind">
                  <FileText v-if="r.item.kind === 'tutorial'" :size="14" />
                  <BookOpen v-else :size="14" />
                </span>
                <span class="result-body">
                  <span class="result-title">{{ r.item.title }}</span>
                  <span class="result-desc">{{ r.item.description }}</span>
                </span>
              </RouterLink>
            </template>
            <p v-else-if="query" class="search-empty">没有匹配「{{ query }}」的结果</p>
            <p v-else class="search-empty">输入关键词,搜索全部教程与分类</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(4, 8, 18, 0.62);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  padding: 12vh 20px 0;
}

.search-panel {
  width: 100%;
  max-width: 620px;
  max-height: 62vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-1);
}

.search-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 15px;
  color: var(--text-1);
}

.search-input::placeholder {
  color: var(--text-3);
}

.kbd {
  font-size: 11px;
  color: var(--text-3);
  border: 1px solid var(--border-1);
  border-radius: 4px;
  padding: 1px 5px;
}

.search-results {
  overflow-y: auto;
  padding: 8px;
}

.result-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  text-decoration: none;
}

.result-item:hover {
  background: var(--bg-hover);
  text-decoration: none;
}

.result-kind {
  display: inline-flex;
  margin-top: 3px;
  color: var(--accent-bright);
}

.result-kind.category {
  color: var(--accent-purple);
}

.result-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.result-title {
  color: var(--text-1);
  font-size: 14px;
  font-weight: 600;
}

.result-desc {
  color: var(--text-3);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-empty {
  padding: 26px 12px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}

.search-fade-enter-active,
.search-fade-leave-active {
  transition: opacity 0.16s var(--ease-out);
}

.search-fade-enter-active .search-panel,
.search-fade-leave-active .search-panel {
  transition: transform 0.16s var(--ease-out);
}

.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
}

.search-fade-enter-from .search-panel,
.search-fade-leave-to .search-panel {
  transform: translateY(-8px) scale(0.985);
}
</style>
