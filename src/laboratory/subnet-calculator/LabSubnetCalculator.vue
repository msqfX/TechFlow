<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  broadcastAddress,
  ipToString,
  parseIPv4,
  prefixToMask,
  sameSubnet,
  usableRange,
} from '@/tutorials/network/ip-address/model'
import type { IPv4 } from '@/tutorials/network/ip-address/model'

/** 子网划分计算器:借位拆分子网 + 同网段判断 */

const baseInput = ref('192.168.1.0')
const basePrefix = ref(24)
const newPrefix = ref(26)
const checkA = ref('192.168.1.20')
const checkB = ref('192.168.1.200')

const baseParsed = computed(() => parseIPv4(baseInput.value))
const base = computed<IPv4 | null>(() => (baseParsed.value.ok ? baseParsed.value.value : null))

interface SubnetRow {
  index: number
  network: string
  broadcast: string
  first: string
  last: string
  count: number
}

const subnets = computed<SubnetRow[]>(() => {
  if (!base.value) return []
  const np = newPrefix.value
  const bp = basePrefix.value
  if (np <= bp || np > 30) return []
  const count = Math.min(16, 2 ** (np - bp))
  const blockSize = 2 ** (32 - np)
  const baseNum = base.value.octets.reduce((acc, o) => acc * 256 + o, 0)
  return Array.from({ length: count }, (_, i) => {
    const num = baseNum + i * blockSize
    const net: IPv4 = {
      octets: [
        Math.floor(num / 16777216) % 256,
        Math.floor(num / 65536) % 256,
        Math.floor(num / 256) % 256,
        num % 256,
      ],
    }
    const range = usableRange(net, np)
    return {
      index: i,
      network: `${ipToString(net)}/${np}`,
      broadcast: ipToString(broadcastAddress(net, np)),
      first: range.first,
      last: range.last,
      count: range.count,
    }
  })
})

const checkResult = computed(() => {
  const a = parseIPv4(checkA.value)
  const b = parseIPv4(checkB.value)
  if (!a.ok || !b.ok) return null
  return sameSubnet(a.value, b.value, newPrefix.value)
})
</script>

<template>
  <div class="subnet">
    <div class="inputs">
      <label class="field">
        <span class="field-label">起始网段</span>
        <input v-model="baseInput" type="text" class="field-input mono" spellcheck="false" />
      </label>
      <label class="field">
        <span class="field-label">原前缀</span>
        <select v-model.number="basePrefix" class="field-input">
          <option v-for="p in [8, 12, 16, 20, 22, 24]" :key="p" :value="p">/{{ p }}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">新前缀(借位后)</span>
        <select v-model.number="newPrefix" class="field-input">
          <option v-for="p in [16, 18, 20, 22, 24, 25, 26, 27, 28, 29, 30]" :key="p" :value="p">/{{ p }}</option>
        </select>
      </label>
    </div>

    <p v-if="newPrefix <= basePrefix" class="hint warn">
      新前缀必须大于原前缀才能划分子网(借出子网位)。
    </p>

    <template v-else>
      <div class="summary">
        <div class="summary-item">
          <span class="s-label">借位</span>
          <span class="s-value mono">{{ newPrefix - basePrefix }} 位 → {{ 2 ** (newPrefix - basePrefix) }} 个子网</span>
        </div>
        <div class="summary-item">
          <span class="s-label">块大小</span>
          <span class="s-value mono">{{ 2 ** (32 - newPrefix) }}</span>
        </div>
        <div class="summary-item">
          <span class="s-label">新掩码</span>
          <span class="s-value mono">{{ ipToString(prefixToMask(newPrefix)) }}</span>
        </div>
        <div class="summary-item">
          <span class="s-label">每子网可用</span>
          <span class="s-value mono">{{ 2 ** (32 - newPrefix) - 2 }} 个</span>
        </div>
      </div>

      <div class="table-wrap">
        <table class="subtable">
          <thead>
            <tr>
              <th>#</th>
              <th>网络地址</th>
              <th>广播地址</th>
              <th>可用范围</th>
              <th>可用数</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in subnets" :key="row.index">
              <td class="mono idx">{{ row.index }}</td>
              <td class="mono">{{ row.network }}</td>
              <td class="mono">{{ row.broadcast }}</td>
              <td class="mono">{{ row.first }} ~ {{ row.last }}</td>
              <td class="mono">{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="subnets.length === 0" class="hint">借位超过 16 个子网时只展示前 16 个。</p>
      </div>
    </template>

    <div class="check">
      <p class="check-title">同网段判断(使用原前缀 {{ basePrefix }} 位的掩码)</p>
      <div class="check-inputs">
        <label class="field">
          <span class="field-label">IP A</span>
          <input v-model="checkA" type="text" class="field-input mono" />
        </label>
        <label class="field">
          <span class="field-label">IP B</span>
          <input v-model="checkB" type="text" class="field-input mono" />
        </label>
        <div class="check-result" :class="checkResult === true ? 'ok' : checkResult === false ? 'bad' : ''">
          <template v-if="checkResult === true">✓ 同一子网</template>
          <template v-else-if="checkResult === false">✗ 不同子网(需经过路由器)</template>
          <template v-else>输入合法 IP 后自动判断</template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.subnet {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  min-width: 150px;
}

.field-input:focus {
  outline: none;
  border-color: var(--accent);
}

.mono {
  font-family: var(--font-mono);
}

.hint {
  font-size: 13px;
  color: var(--text-3);
}

.hint.warn {
  color: var(--warning);
}

.summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.summary-item {
  background: var(--bg-elevated);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.s-label {
  font-size: 12px;
  color: var(--text-3);
}

.s-value {
  font-size: 14px;
  color: var(--text-1);
  font-weight: 600;
}

.table-wrap {
  overflow-x: auto;
}

.subtable {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.subtable th,
.subtable td {
  border: 1px solid var(--border-1);
  padding: 8px 12px;
  text-align: left;
}

.subtable th {
  background: var(--bg-hover);
  color: var(--text-1);
  font-weight: 600;
}

.subtable td {
  color: var(--text-2);
}

.idx {
  color: var(--accent-bright);
}

.check {
  border-top: 1px solid var(--border-1);
  padding-top: 16px;
}

.check-title {
  font-size: 14px;
  font-weight: 650;
  color: var(--text-1);
  margin-bottom: 12px;
}

.check-inputs {
  display: flex;
  gap: 14px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.check-result {
  height: 38px;
  display: inline-flex;
  align-items: center;
  padding: 0 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  font-family: var(--font-mono);
  font-size: 13.5px;
  color: var(--text-3);
}

.check-result.ok {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
}

.check-result.bad {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 45%, transparent);
}

@media (max-width: 760px) {
  .summary {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
