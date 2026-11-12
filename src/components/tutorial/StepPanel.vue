<script setup lang="ts">
import { CheckCircle2, Circle, CircleAlert, LoaderCircle } from '@lucide/vue'
import type { SceneStep } from '@/engine/types/step'
import type { PlayerState } from '@/engine/player/PlayerState'
import type { StepStatus } from '@/engine/types/scene'

defineProps<{
  steps: readonly SceneStep[]
  state: PlayerState
  /** 当前视图聚焦的步骤(点击步骤后的高亮) */
}>()

const emit = defineEmits<{ (e: 'select', index: number): void }>()

const statusIcon: Record<StepStatus, unknown> = {
  pending: Circle,
  active: LoaderCircle,
  completed: CheckCircle2,
  error: CircleAlert,
}
</script>

<template>
  <ol class="step-list">
    <li v-for="(step, i) in steps" :key="step.id">
      <button
        type="button"
        class="step-item"
        :class="`is-${state.stepStatuses[i] ?? 'pending'}`"
        :aria-current="state.stepStatuses[i] === 'active' ? 'step' : undefined"
        @click="emit('select', i)"
      >
        <span class="step-status">
          <component :is="statusIcon[state.stepStatuses[i] ?? 'pending']" :size="15" :class="{ spin: state.stepStatuses[i] === 'active' }" />
        </span>
        <span class="step-body">
          <span class="step-num">STEP {{ i + 1 }}</span>
          <span class="step-title">{{ step.title }}</span>
          <span class="step-desc">{{ step.description }}</span>
        </span>
      </button>
    </li>
  </ol>
</template>

<style scoped>
.step-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-item {
  display: flex;
  gap: 10px;
  width: 100%;
  text-align: left;
  padding: 10px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: background-color 0.15s var(--ease-out), border-color 0.15s var(--ease-out);
}

.step-item:hover {
  background: var(--bg-hover);
}

.step-item.is-active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
}

.step-item.is-completed .step-title,
.step-item.is-completed:hover {
  cursor: pointer;
}

.step-status {
  color: var(--text-3);
  flex-shrink: 0;
  padding-top: 2px;
}

.is-completed .step-status {
  color: var(--success);
}

.is-active .step-status {
  color: var(--accent-bright);
}

.spin {
  animation: step-spin 1s linear infinite;
}

@keyframes step-spin {
  to {
    transform: rotate(360deg);
  }
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.step-num {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--text-3);
}

.step-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
}

.is-pending .step-title {
  color: var(--text-2);
}

.step-desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none !important;
  }
}
</style>
