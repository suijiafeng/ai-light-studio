<template>
  <div
    class="wf-node"
    :class="[{ selected, sized }, runStatus ? `run-${runStatus}` : '']"
    :style="nodeStyle"
  >
    <NodeResizer
      v-if="resizable"
      :min-width="168"
      :min-height="150"
      :max-width="420"
      :max-height="360"
      :is-visible="selected"
      line-class-name="wf-resize-line"
      handle-class-name="wf-resize-handle"
      @resize-end="onResizeEnd"
    />
    <span v-if="resizable && !selected" class="wf-resize-hint"><el-icon><Rank /></el-icon></span>
    <Handle v-if="def.inputs.length" type="target" :position="Position.Left" class="wf-handle" />
    <div v-if="runStatus" class="wf-run-badge" :class="runStatus" :title="badgeTitle">
      <el-icon v-if="runStatus === 'running'" class="wf-spin"><Loading /></el-icon>
      <el-icon v-else-if="runStatus === 'success'"><Check /></el-icon>
      <el-icon v-else-if="runStatus === 'cached'"><Lightning /></el-icon>
      <el-icon v-else-if="runStatus === 'failed'"><WarningFilled /></el-icon>
    </div>
    <div class="wf-node-head">
      <el-icon class="wf-node-ic"><component :is="iconComp" /></el-icon>
      <span class="wf-node-title">{{ def.label }}</span>
    </div>
    <div class="wf-node-body">
      <!-- 图片输入：固定默认尺寸的缩略图/占位，绝不因图片实际像素尺寸而放大或变形。
           点击整个区域可上传/替换图片；已有图片时右上角出现清除按钮。nodrag 阻止 Vue Flow
           把这次点击当成节点拖拽手势的起点。 -->
      <div
        v-if="type === 'image-input'"
        class="wf-preview wf-thumb nodrag"
        :class="{ 'wf-thumb-clickable': !wfRunning && !uploading }"
        :title="wfRunning ? '' : (data.url ? '点击替换图片' : '点击上传图片')"
        @click="pickFile"
      >
        <img v-if="data.url" :src="data.url" alt="" />
        <div v-else-if="!uploading" class="wf-thumb-empty">
          <el-icon><Upload /></el-icon>
          <span>点击上传图片</span>
        </div>
        <el-icon v-if="uploading" class="wf-thumb-loading is-loading"><Loading /></el-icon>
        <el-icon
          v-if="data.url && !wfRunning && !uploading"
          class="wf-thumb-clear"
          title="清除图片"
          @click.stop="clearImage"
        ><CircleCloseFilled /></el-icon>
        <input ref="fileEl" type="file" accept="image/jpeg,image/png,image/webp" hidden @click.stop @change="onFileChange" />
      </div>
      <div v-else-if="type === 'relight'" class="wf-relight">
        <a v-if="runOutput?.url" class="wf-preview wf-result nodrag" :href="runOutput.url" target="_blank" rel="noopener" title="点击查看/下载原图">
          <img :src="runOutput.url" alt="生成结果" />
        </a>
        <div v-else class="wf-preview wf-sw" :style="{ background: swatch }"></div>
        <div class="wf-summary">
          <span class="wf-summary-main">{{ styleName }}</span>
          <span class="wf-summary-sub">{{ data.colorTemp }}K · 亮度{{ data.brightness }}</span>
        </div>
      </div>
      <div v-else class="wf-out">
        <a v-if="runOutput?.url" class="wf-preview wf-result nodrag" :href="runOutput.url" target="_blank" rel="noopener" title="点击查看/下载原图">
          <img :src="runOutput.url" alt="最终产物" />
        </a>
        <div v-else class="wf-preview wf-out-empty">
          <el-icon><Download /></el-icon>
          <span>待生成</span>
        </div>
      </div>
    </div>
    <Handle v-if="def.outputs.length" type="source" :position="Position.Right" class="wf-handle" />
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
defineOptions({ inheritAttrs: false })
import * as Icons from '@element-plus/icons-vue'
import { Check, Lightning, WarningFilled, Loading, Upload, CircleCloseFilled, Rank, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { nodeDef, STYLE_OPTIONS } from './nodeTypes'
import { apiUpload } from '@/api'
import { compressImage } from '@/utils/media'

const props = defineProps({
  id: { type: String, required: true },
  type: { type: String, required: true },
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
})

const wfRunning = inject('wfRunning', ref(false))

const def = computed(() => nodeDef(props.type) || { label: props.type, accent: '#999', inputs: [], outputs: [] })
const iconComp = computed(() => Icons[def.value.icon] || Icons.Box)

const resizable = computed(() => props.type !== 'image-input')
const sized = computed(() => resizable.value && !!(props.data?.size?.width && props.data?.size?.height))
const nodeStyle = computed(() => {
  const style = { '--accent': def.value.accent }
  if (sized.value) {
    style.width = `${props.data.size.width}px`
    style.height = `${props.data.size.height}px`
  }
  return style
})

const onResizeEnd = (event, params) => {
  const p = params || event // 兼容不同版本可能的单参数回调签名
  if (!p || !p.width || !p.height) return
  props.data.size = { width: Math.round(p.width), height: Math.round(p.height) }
}

const runStatus = computed(() => props.data?.runStatus?.status || '')
const badgeTitle = computed(() => props.data?.runStatus?.error || '')
// 节点执行产物（如 { image, url }）：success/cached 时才有，success/cached 都展示真实结果图
const runOutput = computed(() => {
  const s = props.data?.runStatus
  return (s && (s.status === 'success' || s.status === 'cached')) ? s.output : null
})

// ---------- 图片输入节点：点击卡片直接上传/替换，清除按钮直接移除 ----------
const fileEl = ref()
const uploading = ref(false)

const pickFile = () => {
  if (uploading.value || wfRunning.value) return
  fileEl.value.click()
}

const onFileChange = async e => {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return ElMessage.warning('仅支持 JPG / PNG / WEBP 格式')
  if (f.size > 30 * 1024 * 1024) return ElMessage.warning('图片不能超过 30MB')
  uploading.value = true
  try {
    const file = await compressImage(f)
    const uploaded = await apiUpload(file)
    props.data.fileId = uploaded.fileId
    props.data.url = uploaded.url
  } catch (err) {
    if (err.code !== -1) ElMessage.error(err.message)
  } finally {
    uploading.value = false
  }
}

const clearImage = () => {
  if (wfRunning.value) return
  props.data.fileId = ''
  props.data.url = ''
}

const SWATCHES = {
  night_warm: 'radial-gradient(120% 90% at 30% 20%,#ffd9a0 0%,#c98a4a 40%,#5a3d28 100%)',
  daylight: 'radial-gradient(120% 90% at 40% 15%,#fff6e6 0%,#dfe6ec 45%,#9fb0bd 100%)',
  office_cool: 'radial-gradient(120% 90% at 50% 20%,#eaf4ff 0%,#b8d4ec 45%,#7f9db8 100%)',
  wall_wash: 'linear-gradient(105deg,#ffb877 0%,#a9663f 40%,#4a2f22 100%)'
}
const swatch = computed(() => SWATCHES[props.data.style] || 'linear-gradient(135deg,#7c6cff,#4dd0e1)')
const styleName = computed(() => (STYLE_OPTIONS.find(s => s.key === props.data.style) || {}).name || '未设置')
</script>

<style>

.wf-resize-handle {
  z-index: 3 !important;
  width: 13px !important; height: 13px !important; border-radius: 3px !important;
  background: var(--mk-primary) !important; border: 2px solid #fff !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .3) !important;
}
.vue-flow__resize-control.line { z-index: 3 !important; }
.wf-resize-line.left, .wf-resize-line.right { width: 5px !important; }
.wf-resize-line.top, .wf-resize-line.bottom { height: 5px !important; }
.wf-resize-line { border-color: var(--mk-primary) !important; }
</style>

<style scoped>

.wf-node {
  position: relative;
  min-width: 168px; background: var(--mk-card); border: 1px solid var(--mk-border);
  border-radius: 8px; overflow: hidden;
  border-top: 2px solid var(--accent); transition: border-color .15s;
}

.wf-node.sized { width: 100%; height: 100%; display: flex; flex-direction: column; }
.wf-node.sized .wf-node-body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.wf-node.sized .wf-relight,
.wf-node.sized .wf-out { flex: 1; display: flex; flex-direction: column; }
.wf-node.sized .wf-preview { flex: 1; height: auto; }
.wf-node.selected { border-color: var(--mk-primary); box-shadow: 0 0 0 1px var(--mk-primary); }
.wf-node.run-running { border-color: #409eff; box-shadow: 0 0 0 1px #409eff; }
.wf-node.run-failed { border-color: #f56c6c; box-shadow: 0 0 0 1px #f56c6c; }

.wf-resize-hint {
  position: absolute; right: 3px; bottom: 2px; z-index: 1; pointer-events: none;
  font-size: 10px; color: var(--mk-text-2); opacity: .45; transform: rotate(90deg);
}

.wf-run-badge {
  position: absolute; top: 6px; right: 6px; z-index: 2;
  width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center;
  color: #fff; font-size: 10px; box-shadow: 0 0 0 2px var(--mk-card);
}
.wf-run-badge.running { background: #409eff; }
.wf-run-badge.success { background: #67c23a; }
.wf-run-badge.cached { background: #7c6cff; }
.wf-run-badge.failed { background: #f56c6c; }
.wf-spin { animation: wf-spin 1s linear infinite; }
@keyframes wf-spin { to { transform: rotate(360deg); } }
.wf-node-head { display: flex; align-items: center; gap: 6px; padding: 7px 9px; border-bottom: 1px solid var(--mk-border); }
.wf-node-ic { color: var(--accent); font-size: 14px; }
.wf-node-title { font-size: 12.5px; font-weight: 600; color: var(--mk-text); }
.wf-node-body { padding: 8px; flex: 1; display: flex; flex-direction: column; }

.wf-preview {
  position: relative;
  width: 100%; height: 96px; flex: none; border-radius: 6px; overflow: hidden;
  background: rgba(0, 0, 0, .12); display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; transition: border-color .15s, background .15s;
}

.wf-thumb-clickable { cursor: pointer; }
.wf-thumb-clickable:hover { border-color: var(--mk-primary); background: rgba(0, 87, 194, .08); }
.wf-thumb img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }
.wf-thumb-empty {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-size: 11px; color: var(--mk-text-2); pointer-events: none;
}
.wf-thumb-empty .el-icon { font-size: 17px; color: var(--mk-primary); }
.wf-thumb-loading { font-size: 18px; color: var(--mk-primary); }
.wf-thumb-clear {
  position: absolute; top: 4px; right: 4px; z-index: 1;
  font-size: 13px; color: #fff; background: rgba(0, 0, 0, .5); border-radius: 50%;
  padding: 2px; cursor: pointer; transition: background .15s;
}
.wf-thumb-clear:hover { background: #f56c6c; }

.wf-relight, .wf-out { display: flex; flex-direction: column; gap: 6px; }
.wf-summary { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; padding: 0 1px; }
.wf-summary-main { font-size: 12px; font-weight: 600; color: var(--mk-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wf-summary-sub { font-size: 10.5px; color: var(--mk-text-2); font-variant-numeric: tabular-nums; flex: none; }

/* 输出节点未生成时：虚线占位，跟打光节点的实色占位区分开——一眼分辨"待运行"和"待生成"两种空态 */
.wf-out-empty {
  flex-direction: column; gap: 4px; border: 1px dashed var(--mk-border);
  font-size: 11px; color: var(--mk-text-2);
}
.wf-out-empty .el-icon { font-size: 16px; color: var(--mk-text-2); }

/* 运行成功后的真实结果图：跟图片输入一样 object-fit:contain 完整显示不裁切 */
.wf-result:hover { border-color: var(--mk-primary); }
.wf-result img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }

.wf-handle { width: 9px; height: 9px; background: var(--accent); border: 2px solid var(--mk-card); }
</style>
