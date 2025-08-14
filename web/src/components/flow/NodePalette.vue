<template>
  <div class="palette">
    <div class="palette-title">节点</div>
    <div
      v-for="type in PALETTE"
      :key="type"
      class="palette-item"
      draggable="true"
      :style="{ '--accent': NODE_TYPES[type].accent }"
      @dragstart="onDragStart($event, type)"
    >
      <el-icon class="pi-ic"><component :is="icon(type)" /></el-icon>
      <div class="pi-meta">
        <div class="pi-name">{{ NODE_TYPES[type].label }}</div>
        <div class="pi-desc">{{ NODE_TYPES[type].desc }}</div>
      </div>
    </div>
    <div class="palette-hint">拖拽节点到画布，连线搭建流程</div>
  </div>
</template>

<script setup>
import * as Icons from '@element-plus/icons-vue'
import { NODE_TYPES, PALETTE } from './nodeTypes'

const icon = type => Icons[NODE_TYPES[type].icon] || Icons.Box

const onDragStart = (e, type) => {
  e.dataTransfer.setData('application/vueflow', type)
  e.dataTransfer.effectAllowed = 'move'
}
</script>

<style scoped>
.palette { display: flex; flex-direction: column; gap: 9px; padding: 14px; }
.palette-title { font-size: 12px; font-weight: 700; color: var(--mk-text-2); letter-spacing: .04em; }
.palette-item {
  display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 10px; cursor: grab;
  border: 1px solid var(--mk-border); background: var(--mk-card); transition: .15s;
  border-left: 3px solid var(--accent);
}
.palette-item:hover { border-color: var(--accent); transform: translateX(2px); }
.palette-item:active { cursor: grabbing; }
.pi-ic { color: var(--accent); font-size: 17px; }
.pi-name { font-size: 13px; font-weight: 650; color: var(--mk-text); }
.pi-desc { font-size: 11px; color: var(--mk-text-2); margin-top: 2px; line-height: 1.4; }
.palette-hint { font-size: 11px; color: var(--mk-text-2); margin-top: 6px; line-height: 1.5; }
</style>
