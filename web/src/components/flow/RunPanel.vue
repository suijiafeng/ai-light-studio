<template>
  <div class="run-panel">
    <div v-if="nodeStatuses.length" class="rp-dots">
      <span
        v-for="n in nodeStatuses"
        :key="n.id"
        class="rp-dot"
        :class="n.status"
        :title="dotTitle(n)"
      >
        <el-icon v-if="n.status === 'running'" class="rp-spin"><Loading /></el-icon>
        <el-icon v-else-if="n.status === 'success'"><CircleCheckFilled /></el-icon>
        <el-icon v-else-if="n.status === 'cached'"><Lightning /></el-icon>
        <el-icon v-else-if="n.status === 'failed'"><CircleCloseFilled /></el-icon>
        <el-icon v-else-if="n.status === 'skipped'"><Remove /></el-icon>
      </span>
    </div>

        <div v-if="runPhase === 'success' && results.length" class="rp-results">
      <el-image
        v-for="(r, i) in results"
        :key="r.nodeId || i"
        class="rp-result-thumb"
        :src="r.url"
        fit="contain"
        :preview-src-list="results.map(x => x.url)"
        :initial-index="i"
        preview-teleported
      />
    </div>

    <div class="rp-mid">
      <span v-if="estimating" class="rp-cost rp-muted">计算中…</span>
      <span v-else-if="estimate != null" class="rp-cost">预估消耗 <b>{{ estimate }}</b> 算力</span>
      <span v-else class="rp-cost rp-muted">--</span>
      <span v-if="phaseText" class="rp-phase" :class="runPhase">{{ phaseText }}</span>
    </div>

    <div class="rp-actions">
      <el-button v-if="!running" class="mk-btn-gradient" size="small" :disabled="!canRun" @click="$emit('run')">
        <el-icon><CaretRight /></el-icon>&nbsp;运行
      </el-button>
      <el-button v-else type="danger" plain size="small" @click="$emit('cancel')">
        <el-icon><CircleClose /></el-icon>&nbsp;取消
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  Loading, CircleCheckFilled, CircleCloseFilled, Lightning, Remove, CaretRight, CircleClose
} from '@element-plus/icons-vue'

const props = defineProps({
  nodeCount: { type: Number, default: 0 },
  estimate: { type: Number, default: null },
  estimating: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  runPhase: { type: String, default: 'idle' }, // idle|running|success|failed|canceled
  nodeStatuses: { type: Array, default: () => [] }, // [{id,label,status,error}]
  results: { type: Array, default: () => [] } // [{nodeId, image, url}]，运行成功后的最终产物
})
defineEmits(['run', 'cancel'])

// 未保存不再挡运行——run() 自己会先保存/创建再执行，用户无需理解"保存"这个中间态
const canRun = computed(() => props.nodeCount > 0 && !props.estimating && !props.running)

const PHASE_TEXT = { running: '运行中…', success: '运行成功', failed: '运行失败', canceled: '已取消' }
const phaseText = computed(() => PHASE_TEXT[props.runPhase] || '')

const STATUS_LABEL = { pending: '待运行', running: '运行中', success: '成功', cached: '命中缓存', failed: '失败', skipped: '已跳过' }
const dotTitle = n => `${n.label}：${STATUS_LABEL[n.status] || n.status}${n.error ? '（' + n.error + '）' : ''}`
</script>

<style scoped>
.run-panel {
  position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 14px; padding: 8px 16px;
  background: var(--mk-card); border: 1px solid var(--mk-border); border-radius: 999px;
  box-shadow: 0 8px 24px rgba(20, 20, 50, .16); z-index: 5;
  max-width: min(680px, calc(100% - 32px));
}

.rp-dots { display: flex; align-items: center; gap: 5px; overflow-x: auto; max-width: 220px; padding: 2px 0; }
.rp-dots::-webkit-scrollbar { height: 4px; }
.rp-dot {
  width: 18px; height: 18px; border-radius: 50%; flex: none; display: grid; place-items: center;
  background: var(--mk-bg); border: 1px solid var(--mk-border); color: #fff; font-size: 11px;
}
.rp-dot.pending { background: var(--mk-bg); }
.rp-dot.running { background: #409eff; border-color: #409eff; }
.rp-dot.success { background: #67c23a; border-color: #67c23a; }
.rp-dot.cached { background: #7c6cff; border-color: #7c6cff; }
.rp-dot.failed { background: #f56c6c; border-color: #f56c6c; }
.rp-dot.skipped { background: var(--mk-text-2); border-color: var(--mk-text-2); opacity: .6; }
.rp-spin { animation: rp-spin 1s linear infinite; }
@keyframes rp-spin { to { transform: rotate(360deg); } }

.rp-results { display: flex; gap: 6px; flex: none; }
.rp-result-thumb {
  width: 34px; height: 34px; border-radius: 6px; overflow: hidden; flex: none;
  border: 1px solid var(--mk-border); cursor: zoom-in; background: rgba(0, 0, 0, .12);
  transition: border-color .15s, transform .15s;
}
.rp-result-thumb:hover { border-color: var(--mk-primary); transform: scale(1.08); }

.rp-mid { display: flex; flex-direction: column; gap: 1px; min-width: 118px; }
.rp-cost { font-size: 12.5px; color: var(--mk-text); white-space: nowrap; }
.rp-cost b { color: var(--mk-primary); font-variant-numeric: tabular-nums; }
.rp-muted { color: var(--mk-text-2); }
.rp-hint { font-size: 12px; color: var(--mk-text-2); white-space: nowrap; }
.rp-phase { font-size: 11px; }
.rp-phase.running { color: #409eff; }
.rp-phase.success { color: #67c23a; }
.rp-phase.failed { color: #f56c6c; }
.rp-phase.canceled { color: var(--mk-text-2); }

.rp-actions { flex: none; }

@media (max-width: 640px) {
  .run-panel { gap: 10px; padding: 7px 12px; }
  .rp-dots { max-width: 120px; }
  .rp-mid { min-width: 90px; }
}
</style>
