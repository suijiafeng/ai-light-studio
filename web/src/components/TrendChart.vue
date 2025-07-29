<template>
  <div class="trend-chart">
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="chart-svg">
      <!-- 网格线 -->
      <line v-for="i in 4" :key="'g' + i" :x1="PAD" :x2="W - PAD"
        :y1="PAD + ((H - PAD * 2) / 4) * i" :y2="PAD + ((H - PAD * 2) / 4) * i"
        class="grid" />
      <!-- 柱状：新增用户 -->
      <rect v-for="(d, i) in data" :key="'b' + i"
        :x="x(i) - barW / 2" :y="y(d.newUsers)" :width="barW"
        :height="Math.max(H - PAD - y(d.newUsers), d.newUsers > 0 ? 2 : 0)"
        rx="3" class="bar" />
      <!-- 折线：生成次数 -->
      <polyline :points="linePoints" class="line" />
      <circle v-for="(d, i) in data" :key="'c' + i" :cx="x(i)" :cy="y(d.generations)" r="3.5" class="dot" />
      <!-- 数值标注（非零才标） -->
      <text v-for="(d, i) in data" :key="'t' + i" v-show="d.generations > 0"
        :x="x(i)" :y="y(d.generations) - 8" text-anchor="middle" class="val">{{ d.generations }}</text>
    </svg>
    <div class="x-axis">
      <span v-for="d in data" :key="d.date">{{ d.date }}</span>
    </div>
    <div class="legend">
      <span class="lg"><i class="sw line-sw"></i>生成次数</span>
      <span class="lg"><i class="sw bar-sw"></i>新增用户</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ data: { type: Array, default: () => [] } })

const W = 700, H = 220, PAD = 24
const max = computed(() => Math.max(4, ...props.data.map(d => Math.max(d.generations, d.newUsers))))
const x = i => PAD + ((W - PAD * 2) / Math.max(props.data.length - 1, 1)) * i
const y = v => H - PAD - ((H - PAD * 2) * v) / max.value
const barW = computed(() => Math.min(28, (W - PAD * 2) / Math.max(props.data.length, 1) * 0.4))
const linePoints = computed(() => props.data.map((d, i) => `${x(i)},${y(d.generations)}`).join(' '))
</script>

<style scoped lang="scss">
.trend-chart { width: 100%; }
.chart-svg { width: 100%; height: 220px; display: block; }
.grid { stroke: var(--mk-border); stroke-width: 1; }
.bar { fill: rgba(77, 208, 225, 0.55); }
.line { fill: none; stroke: var(--mk-primary); stroke-width: 2.5; stroke-linejoin: round; }
.dot { fill: var(--mk-primary); stroke: var(--mk-card); stroke-width: 1.5; }
.val { font-size: 11px; fill: var(--mk-text-2); }
.x-axis {
  display: flex; justify-content: space-between;
  padding: 4px 10px 0; font-size: 11px; color: var(--mk-text-2);
}
.legend {
  display: flex; gap: 18px; justify-content: center; margin-top: 8px; font-size: 12px; color: var(--mk-text-2);
  .lg { display: flex; align-items: center; gap: 6px; }
  .sw { width: 14px; height: 8px; border-radius: 2px; display: inline-block; }
  .line-sw { background: var(--mk-primary); height: 3px; }
  .bar-sw { background: rgba(77, 208, 225, 0.55); }
}
</style>
