<template>
  <div
    class="wf-node"
    :class="[{ selected }, runStatus ? `run-${runStatus}` : '']"
    :style="nodeStyle"
  >
    <NodeResizer
      v-if="resizable"
      :min-width="200"
      :min-height="200"
      :max-width="480"
      :max-height="420"
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
      <span class="wf-node-chip"><el-icon><component :is="iconComp" /></el-icon></span>
      <span class="wf-node-title">{{ def.label }}</span>
    </div>
    <div class="wf-node-body">
            <div
        v-if="type === 'image-input'"
        class="wf-preview wf-thumb nodrag"
        :class="{ 'wf-thumb-clickable': !data.url && !wfRunning && !uploading }"
        :title="!data.url && !wfRunning ? '点击上传图片' : ''"
        @click="onThumbClick"
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
        <div class="wf-settings">
          <div class="wf-setting-row">
            <span class="wf-setting-sw" :style="{ background: swatch }"></span>
            <span class="wf-setting-label">风格</span>
            <span class="wf-setting-val ellipsis">{{ styleName }}</span>
          </div>
          <div class="wf-setting-row">
            <span class="wf-setting-label">色温</span>
            <span class="wf-setting-val">{{ data.colorTemp }}K</span>
          </div>
          <div class="wf-setting-row">
            <span class="wf-setting-label">亮度</span>
            <span class="wf-setting-val">{{ data.brightness }}</span>
          </div>
          <div class="wf-setting-row">
            <span class="wf-setting-label">光影强度</span>
            <span class="wf-setting-val">{{ data.intensity }}</span>
          </div>
        </div>
      </div>
      <div v-else class="wf-out">
        <el-image
          v-if="runOutput?.url"
          class="wf-preview wf-result nodrag"
          :src="runOutput.url"
          fit="contain"
          :preview-src-list="[runOutput.url]"
          preview-teleported
        />
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
const resizable = computed(() => true)
const nodeStyle = computed(() => ({ '--accent': def.value.accent }))
const onResizeEnd = (resizeEvent) => {
  const p = resizeEvent?.params
  if (!p || !p.width || !p.height) return
  props.data.size = { width: Math.round(p.width), height: Math.round(p.height) }
}

const runStatus = computed(() => props.data?.runStatus?.status || '')
const badgeTitle = computed(() => props.data?.runStatus?.error || '')
const runOutput = computed(() => {
  const s = props.data?.runStatus
  return (s && (s.status === 'success' || s.status === 'cached')) ? s.output : null
})
const fileEl = ref()
const uploading = ref(false)

const pickFile = () => {
  if (uploading.value || wfRunning.value) return
  fileEl.value.click()
}

const onThumbClick = () => {
  if (props.data.url) return // 已有图片：不再触发替换
  pickFile()
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
.vue-flow__node-default,
.vue-flow__node-input,
.vue-flow__node-output {
  padding: 0 !important; border: none !important;
  border-radius: 0 !important; background: transparent !important; box-shadow: none !important;
}
.vue-flow__node-default.selected, .vue-flow__node-default.selected:hover,
.vue-flow__node-default:focus, .vue-flow__node-default:focus-visible,
.vue-flow__node-input.selected, .vue-flow__node-input.selected:hover,
.vue-flow__node-input:focus, .vue-flow__node-input:focus-visible,
.vue-flow__node-output.selected, .vue-flow__node-output.selected:hover,
.vue-flow__node-output:focus, .vue-flow__node-output:focus-visible,
.vue-flow__node-default.selectable:hover, .vue-flow__node-input.selectable:hover, .vue-flow__node-output.selectable:hover {
  border: none !important; box-shadow: none !important; outline: none !important;
}

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

/* 暗色下浅色投影几乎不可见，换成更重的黑色投影撑出卡片悬浮感 */
html.dark .wf-node {
  box-shadow: 0 1px 2px rgba(0, 0, 0, .45), 0 8px 26px rgba(0, 0, 0, .4);
}
html.dark .wf-node.selected {
  box-shadow:
    0 0 0 1.5px var(--accent),
    0 0 0 5px color-mix(in srgb, var(--accent) 18%, transparent),
    0 12px 32px rgba(0, 0, 0, .5);
}
</style>

<style scoped>

.wf-node {
  position: relative;
  min-width: 200px; background: var(--mk-card); border: 1px solid var(--mk-border);
  border-radius: 13px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, .05), 0 6px 18px rgba(16, 24, 40, .07);
  transition: box-shadow .18s, border-color .18s;
  width: 100%; height: 100%; display: flex; flex-direction: column;
}
.wf-node:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--mk-border)); }

/* 选中态跟节点类型的品类色（--accent）走：外圈细环+一圈淡光晕，一眼分清选中的是哪类节点 */
.wf-node.selected {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow:
    0 0 0 1.5px var(--accent),
    0 0 0 5px color-mix(in srgb, var(--accent) 14%, transparent),
    0 10px 28px rgba(16, 24, 40, .14);
}
.wf-node.run-running { box-shadow: 0 0 0 1.5px #409eff, 0 0 0 5px rgba(64, 158, 255, .14); }
.wf-node.run-failed { box-shadow: 0 0 0 1.5px #f56c6c, 0 0 0 5px rgba(245, 108, 108, .14); }

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
.wf-node-head { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-bottom: 1px solid var(--mk-border); }
/* 图标芯片：品类色的圆角方块，和左侧节点库的样式呼应，替代原先的裸图标+顶部色条 */
.wf-node-chip {
  width: 26px; height: 26px; flex: none; border-radius: 8px;
  display: grid; place-items: center; font-size: 14px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent);
}
.wf-node-title { font-size: 13.5px; font-weight: 650; color: var(--mk-text); letter-spacing: .01em; }
.wf-node-body { padding: 14px; flex: 1; display: flex; flex-direction: column; min-height: 0; }

.wf-preview {
  position: relative;
  width: 100%; flex: 1; height: auto; min-height: 96px; border-radius: 9px; overflow: hidden;
  background: color-mix(in srgb, var(--mk-text) 6%, transparent);
  display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; transition: border-color .15s, background .15s;
}

.wf-thumb-clickable { cursor: pointer; }
.wf-thumb-clickable:hover { border-color: var(--mk-primary); background: rgba(0, 87, 194, .08); }
.wf-thumb img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }
.wf-thumb-empty {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  font-size: 12px; color: var(--mk-text-2); pointer-events: none;
}
.wf-thumb-empty .el-icon { font-size: 19px; color: var(--mk-primary); }
.wf-thumb-loading { font-size: 20px; color: var(--mk-primary); }
.wf-thumb-clear {
  position: absolute; top: 7px; right: 7px; z-index: 1;
  font-size: 15px; color: #fff; background: rgba(0, 0, 0, .5); border-radius: 50%;
  padding: 2px; cursor: pointer; transition: background .15s;
}
.wf-thumb-clear:hover { background: #f56c6c; }

.wf-relight, .wf-out { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 7px; }
.wf-relight { justify-content: center; }

.wf-settings { display: flex; flex-direction: column; gap: 6px; }
.wf-setting-row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; }
.wf-setting-sw { width: 10px; height: 10px; border-radius: 3px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .1); }
.wf-setting-label { color: var(--mk-text-2); flex: none; }
.wf-setting-val { color: var(--mk-text); font-weight: 600; margin-left: auto; font-variant-numeric: tabular-nums; max-width: 60%; }

.wf-out-empty {
  flex-direction: column; gap: 4px; border: 1px dashed var(--mk-border);
  font-size: 12px; color: var(--mk-text-2);
}
.wf-out-empty .el-icon { font-size: 18px; color: var(--mk-text-2); }

.wf-result:hover { border-color: var(--mk-primary); }
.wf-result img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }

/* 连接桩：更大更醒目，白描边+品类色填充，一眼能看出"从这里拉线" */
.wf-handle {
  width: 12px; height: 12px; background: var(--accent);
  border: 2.5px solid var(--mk-card);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 1px 4px rgba(0, 0, 0, .25);
}
</style>
