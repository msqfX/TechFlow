<script setup lang="ts">
import type { Component } from 'vue'
import {
  Binary,
  Braces,
  Cloud,
  Cpu,
  Database,
  Layers,
  Network,
  Server,
} from '@lucide/vue'

const props = defineProps<{
  name: string
  size?: number
}>()

const icons: Record<string, Component> = {
  binary: Binary,
  braces: Braces,
  cloud: Cloud,
  cpu: Cpu,
  database: Database,
  layers: Layers,
  network: Network,
  server: Server,
}

const resolved = icons[props.name] ?? Cpu
</script>

<template>
  <component :is="resolved" :size="size ?? 20" :stroke-width="1.8" />
</template>
