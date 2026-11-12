<script setup lang="ts">
/**
 * 首页主推卡的 TCP 三次握手动态预览。
 * 纯 SVG + SMIL + CSS 动画,零 JS、零 GSAP —— 首页性能友好(docs §3.2 动画需轻量)。
 * 循环周期 4.5s:SYN(5%~27%)→ SYN+ACK(38%~60%)→ ACK(72%~94%),状态芯片同步迁移。
 */
const LOOP = '4.5s'

const clientStates = [
  { text: 'SYN_SENT', from: 0, to: 0.6 },
  { text: 'ESTABLISHED', from: 0.6, to: 1 },
]
const serverStates = [
  { text: 'LISTEN', from: 0, to: 0.27 },
  { text: 'SYN_RCVD', from: 0.27, to: 0.94 },
  { text: 'ESTABLISHED', from: 0.94, to: 1 },
]
</script>

<template>
  <div class="hs-preview" aria-hidden="true">
    <svg viewBox="0 0 640 300" class="hs-svg">
      <!-- 双方主机 -->
      <g class="host">
        <rect x="90" y="34" width="120" height="44" rx="9" class="hs-host" />
        <text x="150" y="61" class="hs-host-label">客户端</text>
      </g>
      <g class="host">
        <rect x="430" y="34" width="120" height="44" rx="9" class="hs-host" />
        <text x="490" y="61" class="hs-host-label">服务端</text>
      </g>

      <!-- 时序泳道 -->
      <line x1="150" y1="92" x2="150" y2="262" class="hs-lane" />
      <line x1="490" y1="92" x2="490" y2="262" class="hs-lane" />

      <!-- 报文:SMIL 沿水平路径依次飞行 -->
      <g class="pkts">
        <g class="pkt pkt-syn">
          <rect x="-32" y="-13" width="64" height="26" rx="7" class="hs-pkt-box syn" />
          <text y="5" class="hs-pkt-text">SYN</text>
          <animateMotion
            :dur="LOOP"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;0;1;1"
            keyTimes="0;0.05;0.27;1"
            path="M 150 150 L 490 150"
          />
          <animate
            attributeName="opacity"
            :dur="LOOP"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.04;0.27;0.31"
          />
        </g>
        <g class="pkt pkt-synack">
          <rect x="-40" y="-13" width="80" height="26" rx="7" class="hs-pkt-box synack" />
          <text y="5" class="hs-pkt-text">SYN+ACK</text>
          <animateMotion
            :dur="LOOP"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;0;1;1"
            keyTimes="0;0.38;0.6;1"
            path="M 490 190 L 150 190"
          />
          <animate
            attributeName="opacity"
            :dur="LOOP"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.37;0.6;0.64"
          />
        </g>
        <g class="pkt pkt-ack">
          <rect x="-32" y="-13" width="64" height="26" rx="7" class="hs-pkt-box ack" />
          <text y="5" class="hs-pkt-text">ACK</text>
          <animateMotion
            :dur="LOOP"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;0;1;1"
            keyTimes="0;0.72;0.94;1"
            path="M 150 230 L 490 230"
          />
          <animate
            attributeName="opacity"
            :dur="LOOP"
            repeatCount="indefinite"
            values="0;1;1;0"
            keyTimes="0;0.71;0.94;0.98"
          />
        </g>
      </g>

      <!-- 状态芯片:随报文时序迁移 -->
      <g class="chip">
        <template v-for="(s, i) in clientStates" :key="s.text">
          <text x="150" y="292" class="hs-chip" :class="`client-state-${i}`">
            {{ s.text }}
          </text>
        </template>
      </g>
      <g class="chip">
        <template v-for="(s, i) in serverStates" :key="s.text">
          <text x="490" y="292" class="hs-chip" :class="`server-state-${i}`">
            {{ s.text }}
          </text>
        </template>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.hs-preview {
  width: 100%;
}

.hs-svg {
  width: 100%;
  max-width: 620px;
  overflow: visible;
}

.hs-host {
  fill: var(--bg-panel);
  stroke: var(--border-2);
}

.hs-host-label {
  fill: var(--text-1);
  font-size: 14px;
  font-weight: 600;
  text-anchor: middle;
  font-family: var(--font-sans);
}

.hs-lane {
  stroke: var(--border-1);
  stroke-width: 1.5;
  stroke-dasharray: 4 5;
}

.hs-pkt-box {
  stroke-width: 1.4;
}

.hs-pkt-box.syn {
  fill: color-mix(in srgb, var(--accent) 22%, var(--bg-panel));
  stroke: var(--accent-bright);
}

.hs-pkt-box.synack {
  fill: color-mix(in srgb, var(--accent-purple) 22%, var(--bg-panel));
  stroke: var(--accent-purple);
}

.hs-pkt-box.ack {
  fill: color-mix(in srgb, var(--success) 18%, var(--bg-panel));
  stroke: var(--success);
}

.hs-pkt-text {
  fill: var(--text-1);
  font-size: 12px;
  font-weight: 700;
  text-anchor: middle;
  font-family: var(--font-mono);
}

.hs-chip {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-mono);
  text-anchor: middle;
  opacity: 0;
}

/* 状态时序:与报文飞行节点对齐(周期 4.5s) */
.hs-chip.client-state-0 {
  fill: var(--accent-bright);
  animation: hs-client-a 4.5s steps(1, end) infinite;
}

.hs-chip.client-state-1 {
  fill: var(--success);
  animation: hs-client-b 4.5s steps(1, end) infinite;
}

.hs-chip.server-state-0 {
  fill: var(--text-3);
  animation: hs-server-a 4.5s steps(1, end) infinite;
}

.hs-chip.server-state-1 {
  fill: var(--accent-bright);
  animation: hs-server-b 4.5s steps(1, end) infinite;
}

.hs-chip.server-state-2 {
  fill: var(--success);
  animation: hs-server-c 4.5s steps(1, end) infinite;
}

@keyframes hs-client-a {
  0%, 59% {
    opacity: 1;
  }
  60%, 100% {
    opacity: 0;
  }
}

@keyframes hs-client-b {
  0%, 59% {
    opacity: 0;
  }
  60%, 100% {
    opacity: 1;
  }
}

@keyframes hs-server-a {
  0%, 26% {
    opacity: 1;
  }
  27%, 100% {
    opacity: 0;
  }
}

@keyframes hs-server-b {
  0%, 26% {
    opacity: 0;
  }
  27%, 93% {
    opacity: 1;
  }
  94%, 100% {
    opacity: 0;
  }
}

@keyframes hs-server-c {
  0%, 93% {
    opacity: 0;
  }
  94%, 100% {
    opacity: 1;
  }
}

/* 无动画偏好:隐藏飞行报文,静态显示最终状态(ESTABLISHED) */
@media (prefers-reduced-motion: reduce) {
  .pkts {
    display: none;
  }

  .hs-chip {
    animation: none !important;
  }

  .hs-chip.client-state-0,
  .hs-chip.server-state-0,
  .hs-chip.server-state-1 {
    opacity: 0;
  }

  .hs-chip.client-state-1,
  .hs-chip.server-state-2 {
    opacity: 1;
  }
}
</style>
