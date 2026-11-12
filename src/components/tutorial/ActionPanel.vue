<script setup lang="ts">
import { reactive } from 'vue'
import { AlertTriangle, Play } from '@lucide/vue'
import type { Player } from '@/engine/player/Player'
import type { SceneAction } from '@/engine/types/scene'

const props = defineProps<{
  player: Player
  actions: SceneAction[]
  /** 面板标题(实验操作 / 故障模拟) */
  title: string
}>()

/** 每个动作的参数输入值:name -> param.name -> string */
const inputs = reactive<Record<string, Record<string, string>>>({})

for (const action of props.actions) {
  inputs[action.name] = {}
  for (const p of action.params ?? []) {
    inputs[action.name]![p.name] = p.type === 'select' ? (p.options?.[0]?.value ?? '') : ''
  }
}

function run(action: SceneAction) {
  const params: Record<string, unknown> = {}
  for (const p of action.params ?? []) {
    const raw = inputs[action.name]?.[p.name] ?? ''
    params[p.name] = p.type === 'number' ? Number(raw) : raw
  }
  props.player.performAction(action.name, params)
}
</script>

<template>
  <div class="action-panel">
    <p class="action-title">{{ title }}</p>
    <div v-if="actions.length === 0" class="action-empty">该教程暂未提供此模式的操作。</div>
    <div v-for="action in actions" :key="action.name" class="action-item" :class="{ danger: action.danger }">
      <p class="action-label">
        <AlertTriangle v-if="action.danger" :size="13" class="danger-icon" />
        {{ action.label }}
      </p>
      <p v-if="action.description" class="action-desc">{{ action.description }}</p>
      <div class="action-form">
        <label v-for="p in action.params ?? []" :key="p.name" class="action-field">
          <span class="field-label">{{ p.label }}</span>
          <select
            v-if="p.type === 'select'"
            v-model="inputs[action.name]![p.name]"
            class="field-input"
          >
            <option v-for="o in p.options ?? []" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <input
            v-else
            v-model="inputs[action.name]![p.name]"
            class="field-input"
            :type="p.type === 'number' ? 'number' : 'text'"
            :placeholder="p.placeholder"
            :min="p.min"
            :max="p.max"
          />
        </label>
        <button type="button" class="action-run" :class="{ danger: action.danger }" @click="run(action)">
          <Play :size="12" />
          执行
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.action-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.action-empty {
  font-size: 12.5px;
  color: var(--text-3);
  padding: 10px 0;
}

.action-item {
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: var(--bg-elevated);
}

.action-item.danger {
  border-color: color-mix(in srgb, var(--danger) 35%, transparent);
}

.action-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.danger-icon {
  color: var(--danger);
}

.action-desc {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
}

.action-form {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
}

.action-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.field-label {
  font-size: 11px;
  color: var(--text-3);
}

.field-input {
  height: 30px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-1);
  background: var(--bg-page);
  color: var(--text-1);
  font-size: 12.5px;
  font-family: var(--font-mono);
}

.field-input:focus {
  outline: none;
  border-color: var(--accent);
}

select.field-input {
  appearance: none;
}

.action-run {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  transition: filter 0.15s var(--ease-out);
}

.action-run:hover {
  filter: brightness(1.12);
}

.action-run.danger {
  background: var(--danger);
}
</style>
