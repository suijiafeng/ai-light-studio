<template>
  <div class="inspector">
    <template v-if="!node">
      <div class="insp-empty">
        <el-icon :size="26"><Pointer /></el-icon>
        <p>选中一个节点以编辑参数</p>
      </div>
    </template>

    <template v-else>
      <div class="insp-head">
        <el-icon :style="{ color: def.accent }"><component :is="iconComp" /></el-icon>
        <span>{{ def.label }}</span>
        <el-button class="insp-del" size="small" text type="danger" :disabled="readonly" @click="$emit('delete', node.id)">
          <el-icon><Delete /></el-icon>删除
        </el-button>
      </div>
      <p class="insp-desc">{{ def.desc }}</p>
      <p v-if="readonly" class="insp-readonly-hint">工作流运行中，暂不可编辑</p>

      <!-- 图片输入：上传 -->
      <div v-if="node.type === 'image-input'" class="insp-upload">
        <div class="up-preview" v-if="node.data.url">
          <img :src="node.data.url" alt="" />
        </div>
        <el-button plain size="small" :loading="uploading" :disabled="readonly" @click="pick">
          <el-icon><Upload /></el-icon>&nbsp;{{ node.data.url ? '更换图片' : '上传图片' }}
        </el-button>
        <input ref="fileEl" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onFile" />
      </div>

      <!-- schema 驱动字段 -->
      <div v-for="f in def.fields" :key="f.key" class="insp-field">
        <div class="if-label">
          {{ f.label }}
          <span v-if="f.type === 'slider'" class="if-val">{{ node.data[f.key] }}{{ f.unit || '' }}</span>
        </div>
        <el-select
          v-if="f.type === 'select'"
          v-model="node.data[f.key]"
          size="small"
          style="width:100%"
          :disabled="readonly"
        >
          <el-option v-for="o in f.options" :key="o.key" :label="o.name" :value="o.key" />
        </el-select>
        <el-slider
          v-else-if="f.type === 'slider'"
          v-model="node.data[f.key]"
          :min="f.min" :max="f.max" :step="f.step || 1"
          size="small"
          :disabled="readonly"
        />
      </div>

      <div v-if="node.type === 'output'" class="insp-note">
        输出节点用于标记最终产物，无需配置。
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Pointer, Delete, Upload } from '@element-plus/icons-vue'
import * as Icons from '@element-plus/icons-vue'
import { nodeDef } from './nodeTypes'
import { apiUpload } from '@/api'
import { compressImage } from '@/utils/media'

const props = defineProps({ node: { type: Object, default: null }, readonly: { type: Boolean, default: false } })
defineEmits(['delete'])

const def = computed(() => nodeDef(props.node?.type) || { label: '', accent: '#999', fields: [], desc: '' })
const iconComp = computed(() => Icons[def.value.icon] || Icons.Box)

const fileEl = ref()
const uploading = ref(false)
const pick = () => { if (!props.readonly) fileEl.value.click() }

const onFile = async e => {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  if (props.readonly) return // 兜底：按钮已 disabled，理论上不会触发，仅防御
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return ElMessage.warning('仅支持 JPG / PNG / WEBP')
  if (f.size > 30 * 1024 * 1024) return ElMessage.warning('图片不能超过 30MB')
  uploading.value = true
  try {
    const file = await compressImage(f)
    const data = await apiUpload(file)
    props.node.data.fileId = data.fileId
    props.node.data.url = data.url
    ElMessage.success('已设置图片')
  } catch (err) {
    if (err.code !== -1) ElMessage.error(err.message)
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.inspector { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.insp-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--mk-text-2);
  padding: 40px 10px; text-align: center; font-size: 13px;
}
.insp-head { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; }
.insp-head .insp-del { margin-left: auto; }
.insp-desc { font-size: 12px; color: var(--mk-text-2); line-height: 1.5; margin-top: -4px; }
.insp-readonly-hint {
  font-size: 12px; color: #e6a23c; background: rgba(230, 162, 60, .1);
  padding: 6px 10px; border-radius: 6px; margin: -4px 0 0;
}
.insp-upload { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.up-preview { width: 100%; aspect-ratio: 4/3; border-radius: 8px; overflow: hidden; background: rgba(0, 0, 0, .12); }
.up-preview img { width: 100%; height: 100%; object-fit: contain; }
.insp-field .if-label {
  font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; margin-bottom: 5px;
}
.if-val { color: var(--mk-text-2); font-variant-numeric: tabular-nums; }
.insp-note { font-size: 12px; color: var(--mk-text-2); background: var(--mk-bg); padding: 10px; border-radius: 8px; line-height: 1.5; }
</style>
