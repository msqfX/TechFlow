<script setup lang="ts">
import { computed } from 'vue'
import type { InfoRow } from '@/engine/types/scene'

const props = defineProps<{
  /** 场景实时数据(期望 { rows: InfoRow[] }) */
  data: Record<string, unknown>
}>()

const rows = computed<InfoRow[]>(() => {
  const raw = props.data.rows
  if (Array.isArray(raw)) return raw as InfoRow[]
  // 兜底:普通键值对
  return Object.entries(props.data)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => ({ label: k, value: String(v) }))
})
</script>

<template>
  <div class="info-panel">
    <div v-if="rows.length === 0" class="info-empty">暂无实时数据</div>
    <div v-for="(row, i) in rows" :key="row.label + i" class="info-row">
      <span class="info-label">{{ row.label }}</span>
      <span class="info-value" :class="`tone-${row.tone ?? 'default'}`">{{ row.value }}</span>
    </div>
  </div>
</template>

<style scoped>
.info-panel {
  display: flex;
  flex-direction: column;
}

.info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 2px;
  border-bottom: 1px dashed var(--border-1);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.info-value {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-1);
  text-align: right;
  word-break: break-all;
}

.tone-accent {
  color: var(--accent-bright);
}

.tone-success {
  color: var(--success);
}

.tone-warning {
  color: var(--warning);
}

.tone-danger {
  color: var(--danger);
}

.info-empty {
  padding: 18px 0;
  text-align: center;
  color: var(--text-3);
  font-size: 12.5px;
}
</style>
