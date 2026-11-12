<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  broadcastAddress,
  ipToBits,
  ipToString,
  isPrivate,
  networkAddress,
  parseIPv4,
  prefixToMask,
  usableRange,
} from '@/tutorials/network/ip-address/model'

/** IPv4 地址计算器:输入实时计算,复用教程模拟模型 */

const ipInput = ref('192.168.1.100')
const prefix = ref(24)

const parsed = computed(() => parseIPv4(ipInput.value))
const ip = computed(() => (parsed.value.ok ? parsed.value.value : null))

const bits = computed(() => (ip.value ? ipToBits(ip.value) : ''))
const mask = computed(() => prefixToMask(prefix.value))
const network = computed(() => (ip.value ? ipToString(networkAddress(ip.value, prefix.value)) : '—'))
const broadcast = computed(() => (ip.value && prefix.value < 31 ? ipToString(broadcastAddress(ip.value, prefix.value)) : '特殊前缀'))
const range = computed(() => (ip.value ? usableRange(ip.value, prefix.value) : null))
const bitType = (i: number) => (i < prefix.value ? 'net' : 'host')

const quickPrefixes = [8, 16, 20, 24, 26, 28, 30, 31, 32]
</script>

<template>
  <div class="ipcalc">
    <div class="inputs">
      <label class="field">
        <span class="field-label">IPv4 地址</span>
        <input v-model="ipInput" type="text" class="field-input mono" spellcheck="false" placeholder="192.168.1.100" />
      </label>
      <label class="field grow">
        <span class="field-label">CIDR 前缀:{{ prefix }} 位网络位 / {{ 32 - prefix }} 位主机位</span>
        <input v-model.number="prefix" type="range" min="1" max="32" class="range" />
      </label>
      <div class="quick">
        <button
          v-for="p in quickPrefixes"
          :key="p"
          type="button"
          class="quick-btn"
          :class="{ active: prefix === p }"
          @click="prefix = p"
        >
          /{{ p }}
        </button>
      </div>
    </div>

    <div v-if="!parsed.ok" class="error panel">{{ parsed.error }}</div>

    <template v-else-if="ip">
      <div class="bits">
        <div v-for="(octet, o) in bits.match(/.{8}/g)" :key="o" class="octet">
          <span class="octet-num">{{ ip.octets[o] }}</span>
          <div class="bit-row">
            <span
              v-for="(bit, b) in octet.split('')"
              :key="b"
              class="bit"
              :class="bitType(o * 8 + b)"
            >{{ bit }}</span>
          </div>
        </div>
        <div class="legend">
          <span class="legend-item net">网络位(前 {{ prefix }})</span>
          <span class="legend-item host">主机位(后 {{ 32 - prefix }})</span>
        </div>
      </div>

      <div class="results">
        <div class="result-row">
          <span class="r-label">子网掩码</span>
          <span class="r-value mono">{{ ipToString(mask) }}</span>
        </div>
        <div class="result-row">
          <span class="r-label">网络地址</span>
          <span class="r-value mono accent">{{ network }}</span>
        </div>
        <div class="result-row">
          <span class="r-label">广播地址</span>
          <span class="r-value mono">{{ broadcast }}</span>
        </div>
        <div class="result-row">
          <span class="r-label">可用范围</span>
          <span class="r-value mono">
            {{ range?.first }} ~ {{ range?.last }}
            <em v-if="range?.note" class="note">{{ range.note }}</em>
          </span>
        </div>
        <div class="result-row">
          <span class="r-label">可用数量</span>
          <span class="r-value mono">{{ range?.count }} 个</span>
        </div>
        <div class="result-row">
          <span class="r-label">地址类型</span>
          <span class="r-value" :class="isPrivate(ip) ? 'success' : ''">
            {{ isPrivate(ip) ? '私有地址(RFC 1918)' : '公有地址' }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ipcalc {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field.grow {
  flex: 1;
  min-width: 220px;
}

.field-label {
  font-size: 12.5px;
  color: var(--text-3);
}

.field-input {
  height: 38px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  background: var(--bg-elevated);
  color: var(--text-1);
}

.field-input:focus {
  outline: none;
  border-color: var(--accent);
}

.mono {
  font-family: var(--font-mono);
}

.range {
  width: 100%;
  accent-color: var(--accent);
}

.quick {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.quick-btn {
  padding: 7px 11px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-2);
}

.quick-btn:hover {
  border-color: var(--border-2);
  color: var(--text-1);
}

.quick-btn.active {
  color: var(--accent-bright);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.error {
  padding: 14px 18px;
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
}

.bits {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.octet {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.octet-num {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-1);
  font-weight: 600;
}

.bit-row {
  display: flex;
  gap: 2px;
}

.bit {
  width: 24px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 13px;
}

.bit.net {
  background: color-mix(in srgb, var(--accent) 22%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--text-1);
}

.bit.host {
  background: color-mix(in srgb, var(--accent-purple) 20%, var(--bg-panel));
  border: 1px solid color-mix(in srgb, var(--accent-purple) 50%, transparent);
  color: var(--text-1);
}

.legend {
  display: flex;
  gap: 12px;
  width: 100%;
}

.legend-item {
  font-size: 12px;
}

.legend-item.net {
  color: var(--accent-bright);
}

.legend-item.host {
  color: var(--accent-purple);
}

.results {
  display: flex;
  flex-direction: column;
}

.result-row {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 10px 4px;
  border-bottom: 1px dashed var(--border-1);
}

.result-row:last-child {
  border-bottom: none;
}

.r-label {
  width: 110px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-3);
}

.r-value {
  font-size: 14px;
  color: var(--text-1);
}

.r-value.accent {
  color: var(--accent-bright);
}

.r-value.success {
  color: var(--success);
}

.note {
  font-style: normal;
  font-size: 12px;
  color: var(--warning);
  margin-left: 8px;
}

@media (max-width: 640px) {
  .bit {
    width: 18px;
    height: 26px;
    font-size: 11px;
  }
}
</style>
