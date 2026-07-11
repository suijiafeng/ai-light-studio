<template>
  <div class="palette">
    <div class="palette-title">节点库</div>
    <div
      v-for="type in PALETTE"
      :key="type"
      class="palette-item"
      draggable="true"
      :style="{ '--accent': NODE_TYPES[type].accent }"
      @dragstart="onDragStart($event, type)"
    >
      <span class="pi-chip"><el-icon><component :is="icon(type)" /></el-icon></span>
      <div class="pi-meta">
        <div class="pi-name">{{ NODE_TYPES[type].label }}</div>
        <div class="pi-desc">{{ NODE_TYPES[type].desc }}</div>
      </div>
      <span class="pi-grip">
        <i></i><i></i><i></i><i></i><i></i><i></i>
      </span>
    </div>

    <div class="palette-tips">
      <div class="pt-title">快捷操作</div>
      <div class="pt-row"><span>拖拽</span>添加节点到画布</div>
      <div class="pt-row"><kbd>⌘Z</kbd>撤销 · <kbd>⇧⌘Z</kbd>重做</div>
      <div class="pt-row"><kbd>⌘D</kbd>复制选中节点</div>
      <div class="pt-row"><kbd>Del</kbd>删除选中节点</div>
    </div>
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
.palette { display: flex; flex-direction: column; gap: 8px; padding: 16px 14px; }
.palette-title {
  font-size: 11px; font-weight: 700; color: var(--mk-text-2);
  letter-spacing: .12em; text-transform: uppercase; margin-bottom: 2px;
}

.palette-item {
  position: relative;
  display: flex; align-items: center; gap: 10px; padding: 11px 10px; border-radius: 12px;
  cursor: grab; border: 1px solid var(--mk-border); background: var(--mk-card);
  transition: border-color .15s, box-shadow .15s, transform .15s;
}
.palette-item:hover {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 14%, transparent);
  transform: translateY(-1px);
}
.palette-item:active { cursor: grabbing; transform: translateY(0); }

/* 图标芯片：品类色的圆角方块，替代裸图标+左侧色条的旧样式 */
.pi-chip {
  width: 32px; height: 32px; flex: none; border-radius: 9px;
  display: grid; place-items: center; font-size: 16px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent);
}
.pi-meta { min-width: 0; }
.pi-name { font-size: 13px; font-weight: 650; color: var(--mk-text); }
.pi-desc {
  font-size: 11px; color: var(--mk-text-2); margin-top: 2px; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* 抓握点：hover 时浮现，暗示"这是可拖的" */
.pi-grip {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  display: grid; grid-template-columns: repeat(2, 3px); gap: 2.5px;
  opacity: 0; transition: opacity .15s;
}
.pi-grip i { width: 3px; height: 3px; border-radius: 50%; background: var(--mk-text-2); }
.palette-item:hover .pi-grip { opacity: .6; }

.palette-tips {
  margin-top: 10px; padding: 11px 12px; border-radius: 12px;
  background: color-mix(in srgb, var(--mk-primary) 5%, transparent);
  border: 1px dashed color-mix(in srgb, var(--mk-primary) 22%, transparent);
}
.pt-title { font-size: 11px; font-weight: 700; color: var(--mk-text-2); margin-bottom: 7px; letter-spacing: .05em; }
.pt-row { font-size: 11px; color: var(--mk-text-2); line-height: 2; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.pt-row span { font-weight: 650; color: var(--mk-text); }
.pt-row kbd {
  font: 600 10px/1 ui-monospace, monospace; color: var(--mk-text);
  background: var(--mk-card); border: 1px solid var(--mk-border); border-bottom-width: 2px;
  border-radius: 5px; padding: 3px 5px;
}
</style>
