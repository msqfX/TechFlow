<script setup lang="ts">
/**
 * Hero 背景动态拓扑动画。
 * 轻量实现:纯 SVG + SMIL animateMotion + CSS 动画,不加载 GSAP,不阻塞首屏。
 */
const nodes = [
  { id: 'client', label: '客户端', x: 60, y: 340 },
  { id: 'switch', label: '交换机', x: 200, y: 250 },
  { id: 'router', label: '路由器', x: 330, y: 340 },
  { id: 'dns', label: 'DNS', x: 210, y: 120 },
  { id: 'edge', label: 'CDN', x: 430, y: 130 },
  { id: 'lb', label: '负载均衡', x: 470, y: 250 },
  { id: 'web', label: 'Web 服务器', x: 560, y: 180 },
  { id: 'db', label: '数据库', x: 560, y: 330 },
] as const

const links = [
  'client switch',
  'switch router',
  'switch dns',
  'router dns',
  'router lb',
  'lb edge',
  'lb web',
  'edge web',
  'web db',
  'lb db',
] as const

type NodeId = (typeof nodes)[number]['id']

function nodeById(id: NodeId) {
  return nodes.find(n => n.id === id)!
}

function pathFor(link: string): string {
  const [a, b] = link.split(' ') as [NodeId, NodeId]
  const na = nodeById(a)
  const nb = nodeById(b)
  const mx = (na.x + nb.x) / 2
  const my = (na.y + nb.y) / 2 - 22
  return `M ${na.x} ${na.y} Q ${mx} ${my} ${nb.x} ${nb.y}`
}

const packets = [
  { path: pathFor('client switch'), dur: '2.4s', begin: '0s' },
  { path: pathFor('switch router'), dur: '2.8s', begin: '-0.9s' },
  { path: pathFor('switch dns'), dur: '3.2s', begin: '-1.6s' },
  { path: pathFor('router lb'), dur: '3s', begin: '-0.4s' },
  { path: pathFor('lb web'), dur: '2.6s', begin: '-1.9s' },
  { path: pathFor('lb edge'), dur: '3.4s', begin: '-2.4s' },
  { path: pathFor('web db'), dur: '3.6s', begin: '-1.1s' },
  { path: pathFor('lb db'), dur: '3.8s', begin: '-2.9s' },
]
</script>

<template>
  <div class="topology" aria-hidden="true">
    <svg viewBox="0 0 640 420" class="topo-svg">
      <defs>
        <radialGradient id="topo-glow" cx="55%" cy="45%" r="60%">
          <stop offset="0%" stop-color="#318BFF" stop-opacity="0.14" />
          <stop offset="60%" stop-color="#318BFF" stop-opacity="0.04" />
          <stop offset="100%" stop-color="#318BFF" stop-opacity="0" />
        </radialGradient>
      </defs>

      <rect width="640" height="420" fill="url(#topo-glow)" />

      <!-- 连线 -->
      <g class="links">
        <path
          v-for="(l, i) in links"
          :key="l + i"
          :d="pathFor(l)"
          class="link"
          :style="{ animationDelay: `${(i % 5) * -1.4}s` }"
        />
      </g>

      <!-- 数据包 -->
      <g class="packets">
        <circle v-for="(p, i) in packets" :key="i" r="3.2" class="packet" :class="`packet-${i % 3}`">
          <animateMotion :dur="p.dur" :begin="p.begin" repeatCount="indefinite" :path="p.path" />
        </circle>
      </g>

      <!-- 节点(动画延迟使用确定性值,保证 SSR 水合一致) -->
      <g
        v-for="(n, i) in nodes"
        :key="n.id"
        class="node"
        :style="{ animationDelay: `${(i % 5) * -0.9}s` }"
      >
        <circle :cx="n.x" :cy="n.y" r="14" class="node-halo" />
        <rect
          :x="n.x - 9"
          :y="n.y - 9"
          width="18"
          height="18"
          rx="5"
          class="node-box"
        />
        <circle :cx="n.x" :cy="n.y" r="3" class="node-dot" />
        <text :x="n.x" :y="n.y + 30" class="node-label">{{ n.label }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.topology {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.topo-svg {
  width: 100%;
  max-width: 680px;
  overflow: visible;
}

.link {
  fill: none;
  stroke: var(--border-2);
  stroke-width: 1.2;
  stroke-dasharray: 4 6;
  animation: dashflow 1.6s linear infinite;
}

@keyframes dashflow {
  to {
    stroke-dashoffset: -10;
  }
}

.packet {
  fill: var(--accent-bright);
}

.packet-1 {
  fill: var(--accent-purple);
}

.packet-2 {
  fill: var(--success);
}

.node-halo {
  fill: color-mix(in srgb, var(--accent) 10%, transparent);
  animation: haloPulse 4.5s ease-in-out infinite;
}

@keyframes haloPulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

.node-box {
  fill: var(--bg-panel);
  stroke: var(--border-2);
  stroke-width: 1.2;
}

.node-dot {
  fill: var(--accent-bright);
  animation: dotPulse 2.8s ease-in-out infinite;
}

@keyframes dotPulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}

.node-label {
  fill: var(--text-3);
  font-size: 11px;
  text-anchor: middle;
  font-family: var(--font-sans);
}

@media (prefers-reduced-motion: reduce) {
  .link,
  .packet,
  .node-halo,
  .node-dot {
    animation: none !important;
  }

  .packets {
    display: none;
  }
}
</style>
