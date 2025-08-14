<template>
  <div class="page-container">
    <div class="page-title">
      <el-icon class="mk-gradient-text"><Files /></el-icon> 批量处理
      <el-tag type="warning" effect="dark" size="small" round>会员/付费专属</el-tag>
      <span class="text-secondary tip">一次最多20张，统一参数批量生成，每张{{ cost }}算力</span>
    </div>

    <div class="grid">
            <div class="mk-card">
        <div class="panel-title"><el-icon><UploadFilled /></el-icon> 图片列表（{{ files.length }}/20）</div>
        <div class="file-grid">
          <div v-for="(f, i) in files" :key="f.fileId" class="file-cell">
            <el-image :src="f.url" fit="contain" class="file-img" />
            <el-icon class="del" @click="files.splice(i, 1)"><CircleCloseFilled /></el-icon>
          </div>
          <div v-if="files.length < 20" class="file-add" @click="pick">
            <el-icon :size="26"><Plus /></el-icon>
          </div>
        </div>
        <input ref="input" type="file" multiple accept="image/jpeg,image/png,image/webp" hidden @change="onPick" />
        <el-progress v-if="uploading" :percentage="upPercent" :stroke-width="6" style="margin-top:10px" />
      </div>

            <div class="mk-card">
        <div class="panel-title"><el-icon><Operation /></el-icon> 统一参数</div>
        <div class="param-label">氛围风格</div>
        <el-select v-model="params.style" style="width:100%">
          <el-option v-for="(n, k) in styleNames" :key="k" :label="n" :value="k" />
        </el-select>
        <div class="param-label">光源方向</div>
        <el-select v-model="params.direction" style="width:100%">
          <el-option v-for="d in dirs" :key="d.key" :label="d.name" :value="d.key" />
        </el-select>
        <div class="param-label">亮度 {{ params.brightness }}</div>
        <el-slider v-model="params.brightness" :min="0" :max="100" />
        <div class="param-label">光影强度 {{ params.intensity }}</div>
        <el-slider v-model="params.intensity" :min="0" :max="100" />

        <el-button class="mk-btn-gradient run-btn" size="large" :loading="running" :disabled="!files.length || running" @click="run">
          批量生成（{{ files.length * cost }}算力）
        </el-button>

        <template v-if="results.length">
          <el-divider />
          <div class="panel-title">结果（成功{{ doneCount }}/{{ results.length }}）</div>
          <div class="file-grid">
            <div v-for="r in results" :key="r.id" class="file-cell">
              <el-image v-if="r.resultUrl" :src="r.resultUrl" fit="contain" class="file-img" :preview-src-list="[r.resultUrl]" />
              <div v-else class="pending"><el-icon class="is-loading" v-if="r.status==='processing'"><Loading /></el-icon><el-icon v-else color="#f56c6c"><WarningFilled /></el-icon></div>
            </div>
          </div>
          <el-button v-if="allDone" style="margin-top:12px" @click="downloadAll"><el-icon><Download /></el-icon>逐张下载全部</el-button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiUpload, apiBulk, apiBatchStatus } from '@/api'
import { compressImage, requestNotifyPermission, notifyDone } from '@/utils/media'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const files = ref([])
const input = ref()
const uploading = ref(false)
const upPercent = ref(0)
const running = ref(false)
const results = ref([])
const cost = 5
let poll = null

const styleNames = { night_warm: '夜景暖光', daylight: '日间自然光', office_cool: '办公冷光', wall_wash: '氛围洗墙光' }
const dirs = [
  { key: 'none', name: '环境光' }, { key: 'left', name: '左侧' }, { key: 'right', name: '右侧' },
  { key: 'top', name: '顶部' }, { key: 'bottom', name: '底部' }
]
const params = reactive({ style: 'night_warm', direction: 'none', brightness: 50, intensity: 50, detail: 50 })

const doneCount = computed(() => results.value.filter(r => r.status === 'success').length)
const allDone = computed(() => results.value.length && results.value.every(r => r.status !== 'processing'))

onBeforeUnmount(() => clearInterval(poll))

const pick = () => input.value.click()
const onPick = async e => {
  const list = [...e.target.files].slice(0, 20 - files.value.length)
  e.target.value = ''
  uploading.value = true
  try {
    for (const f of list) {
      if (f.size > 30 * 1024 * 1024) { ElMessage.warning(`${f.name} 超过30MB，已跳过`); continue }
      const compressed = await compressImage(f)
      const data = await apiUpload(compressed, ev => { upPercent.value = Math.round((ev.loaded / ev.total) * 100) })
      files.value.push(data)
    }
  } catch (err) {
    if (err.code !== -1) ElMessage.error(err.message)
  } finally {
    uploading.value = false
  }
}

const run = async () => {
  requestNotifyPermission()
  running.value = true
  results.value = []
  try {
    const { batchId } = await apiBulk({ fileIds: files.value.map(f => f.fileId), params: { ...params } })
    userStore.fetchMe()
    poll = setInterval(async () => {
      try {
        const data = await apiBatchStatus(batchId)
        results.value = data.list
        if (data.done) {
          clearInterval(poll)
          running.value = false
          ElMessage.success(`批量完成：成功${data.list.filter(i => i.status === 'success').length}张`)
          notifyDone('批量生成已完成')
        }
      } catch (e) {  }
    }, 2000)
  } catch (e) {
    running.value = false
    if (e.code === 429) {
      ElMessageBox.confirm(e.message, '算力不足', { confirmButtonText: '去充值', type: 'warning' })
        .then(() => { location.href = '/recharge' }).catch(() => {})
    } else if (e.code === 403) {
      ElMessageBox.confirm(e.message, '会员专属', { confirmButtonText: '去开通', type: 'warning' })
        .then(() => { location.href = '/recharge' }).catch(() => {})
    } else if (e.code !== -1) ElMessage.error(e.message)
  }
}

const downloadAll = () => {
  results.value.filter(r => r.resultUrl).forEach((r, i) => {
    setTimeout(() => {
      const a = document.createElement('a')
      a.href = r.resultUrl
      a.download = `ai-light-batch-${i + 1}.jpg`
      a.click()
    }, i * 400)
  })
}
</script>

<style scoped lang="scss">
.tip { font-size: 13px; font-weight: 400; margin-left: 8px; }
.grid { display: grid; grid-template-columns: 1fr 380px; gap: 18px; @media (max-width: 980px) { grid-template-columns: 1fr; } }
.panel-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; margin-bottom: 14px; .el-icon { color: var(--mk-primary); } }
.param-label { font-size: 13px; margin: 12px 0 6px; font-weight: 600; }
.file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.file-cell {
  position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,0.15);
  .file-img { width: 100%; height: 100%; }
  .del { position: absolute; top: 4px; right: 4px; cursor: pointer; color: #f56c6c; background: #fff; border-radius: 50%; }
  .pending { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--mk-primary); }
}
.file-add {
  aspect-ratio: 1; border: 2px dashed var(--mk-border); border-radius: 8px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: var(--mk-primary);
  &:hover { border-color: var(--mk-primary); background: rgba(124,108,255,0.06); }
}
.run-btn { width: 100%; margin-top: 18px; }
</style>
