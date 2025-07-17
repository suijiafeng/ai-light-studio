<template>
  <div class="page-container studio">
    <div class="page-title">
      <el-icon class="mk-gradient-text"><MagicStick /></el-icon> AI灯光工作台
      <span class="text-secondary cost-tip">每次生成消耗 {{ cost }} 算力 · 当前余额 {{ userStore.credits }}</span>
    </div>

    <div class="studio-grid">
      <!-- ============ 左：上传区 ============ -->
      <div class="mk-card panel">
        <div class="panel-title"><el-icon><UploadFilled /></el-icon> 原始照片</div>

        <div
          v-if="!source.url"
          class="upload-zone"
          :class="{ dragging }"
          @click="pickFile"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <el-icon :size="42" class="upload-icon"><Plus /></el-icon>
          <p>点击或拖拽上传室内实景照片</p>
          <p class="text-secondary small">支持 JPG / PNG / WEBP，最大15MB</p>
        </div>

        <template v-else>
          <div class="source-preview">
            <el-image :src="source.url" fit="contain" :preview-src-list="[source.url]" class="preview-img" />
          </div>
          <div class="source-actions">
            <el-button size="small" @click="pickFile"><el-icon><RefreshLeft /></el-icon>更换图片</el-button>
            <el-button size="small" @click="openCrop"><el-icon><Crop /></el-icon>裁剪</el-button>
            <el-button size="small" :type="maskId ? 'success' : ''" @click="openMask">
              <el-icon><Brush /></el-icon>{{ maskId ? '已设选区' : '局部重绘' }}
            </el-button>
            <el-button v-if="maskId" size="small" text type="danger" @click="maskId = ''">清除选区</el-button>
          </div>
        </template>

        <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onFileChange" />
        <el-progress v-if="uploading" :percentage="uploadPercent" :stroke-width="6" class="upload-progress" />
      </div>

      <!-- ============ 中：参数面板 ============ -->
      <div class="mk-card panel">
        <div class="panel-title"><el-icon><Operation /></el-icon> 灯光参数</div>

        <div class="param-label">氛围风格</div>
        <div class="style-grid">
          <div
            v-for="s in styles"
            :key="s.key"
            class="style-item"
            :class="{ active: params.style === s.key }"
            @click="selectStyle(s)"
          >{{ s.name }}</div>
        </div>

        <el-button size="small" plain class="advise-btn" :loading="advising" :disabled="!source.fileId" @click="advise">
          <el-icon><MagicStick /></el-icon>&nbsp;AI灯光顾问：一键推荐参数
        </el-button>
        <el-alert v-if="adviseReason" :title="adviseReason" type="success" :closable="true" class="advise-tip" @close="adviseReason = ''" />

        <div class="param-label">光源方向</div>
        <div class="dir-row">
          <div
            v-for="d in directions"
            :key="d.key"
            class="dir-item"
            :class="{ active: params.direction === d.key }"
            @click="params.direction = d.key"
          >{{ d.name }}</div>
        </div>

        <div class="param-label">亮度 <span class="text-secondary">{{ params.brightness }}</span></div>
        <el-slider v-model="params.brightness" :min="0" :max="100" />

        <div class="param-label">色温 <span class="text-secondary">{{ params.colorTemp }}K</span></div>
        <el-slider v-model="params.colorTemp" :min="2000" :max="8000" :step="100" />

        <div class="param-label">光影强度 <span class="text-secondary">{{ params.intensity }}</span></div>
        <el-slider v-model="params.intensity" :min="0" :max="100" />

        <div class="param-label">明暗细节 <span class="text-secondary">{{ params.detail }}</span></div>
        <el-slider v-model="params.detail" :min="0" :max="100" />

        <el-button
          class="mk-btn-gradient generate-btn"
          size="large"
          :loading="generating"
          :disabled="!source.fileId || generating"
          @click="generate"
        >
          <el-icon v-if="!generating"><MagicStick /></el-icon>
          {{ generating ? '正在生成中…' : `开始生成（消耗${cost}算力）` }}
        </el-button>
        <el-button
          class="batch-btn"
          size="large"
          plain
          :loading="generating"
          :disabled="!source.fileId || generating"
          @click="generateBatch"
        >
          <el-icon v-if="!generating"><Grid /></el-icon>
          一键4风格连拍（{{ multiCost }}算力）
        </el-button>
        <p v-if="!source.fileId" class="text-secondary small center">请先上传照片</p>
      </div>

      <!-- ============ 右：结果展示 ============ -->
      <div class="mk-card panel">
        <div class="panel-title"><el-icon><PictureRounded /></el-icon> 生成结果</div>

        <div v-if="generating" class="result-loading">
          <el-progress type="circle" :percentage="fakePercent" :width="90" />
          <p class="text-secondary">AI正在重绘灯光效果，请稍候…</p>
        </div>

        <!-- 4风格连拍结果网格 -->
        <div v-else-if="batchResults.length" class="batch-grid-wrap">
          <div class="batch-grid">
            <div
              v-for="b in batchResults"
              :key="b.id"
              class="batch-cell"
              :class="{ active: result && result.id === b.id }"
              @click="b.status === 'success' && (result = b)"
            >
              <el-image v-if="b.resultUrl" :src="b.resultUrl" fit="cover" class="batch-img" />
              <div v-else class="batch-placeholder">
                <el-icon v-if="b.status === 'processing'" class="is-loading"><Loading /></el-icon>
                <el-icon v-else color="#f56c6c"><WarningFilled /></el-icon>
              </div>
              <span class="batch-name">{{ styleNames[b.params.style] || '方案' }}</span>
            </div>
          </div>
          <div v-if="result && result.status === 'success'" class="batch-detail">
            <CompareSlider v-if="compareMode" :before="result.sourceUrl" :after="result.resultUrl" />
            <el-image v-else :src="result.resultUrl" fit="contain" :preview-src-list="[result.resultUrl, result.sourceUrl]" class="preview-img detail-img" />
            <div class="result-actions">
              <el-button size="small" :type="compareMode ? 'primary' : ''" plain @click="compareMode = !compareMode"><el-icon><Switch /></el-icon>对比</el-button>
              <el-button size="small" type="primary" plain @click="download"><el-icon><Download /></el-icon>下载</el-button>
              <el-button size="small" plain @click="editResult"><el-icon><EditPen /></el-icon>再次编辑</el-button>
            </div>
          </div>
          <p v-else class="text-secondary small center">点击上方缩略图查看大图</p>
        </div>

        <div v-else-if="result && result.status === 'success'" class="result-box">
          <CompareSlider v-if="compareMode" :before="result.sourceUrl" :after="result.resultUrl" />
          <el-image v-else :src="result.resultUrl" fit="contain" :preview-src-list="[result.resultUrl, result.sourceUrl]" class="preview-img" />
          <div class="result-actions">
            <el-button size="small" :type="compareMode ? 'primary' : ''" plain @click="compareMode = !compareMode"><el-icon><Switch /></el-icon>对比</el-button>
            <el-button size="small" type="primary" plain @click="download"><el-icon><Download /></el-icon>下载</el-button>
            <el-button size="small" plain @click="generate"><el-icon><Refresh /></el-icon>重新生成</el-button>
            <el-button size="small" plain @click="editResult"><el-icon><EditPen /></el-icon>再次编辑</el-button>
            <el-button size="small" plain @click="share"><el-icon><Share /></el-icon>分享</el-button>
            <el-button size="small" plain @click="$router.push(`/report/${result.id}`)"><el-icon><Document /></el-icon>报告</el-button>
          </div>
        </div>

        <div v-else-if="result && result.status === 'failed'" class="result-empty">
          <el-icon :size="40" color="#f56c6c"><WarningFilled /></el-icon>
          <p>生成失败：{{ result.error || '未知错误' }}</p>
          <p class="text-secondary small">算力已自动退还</p>
          <el-button type="primary" plain size="small" @click="generate">重试</el-button>
        </div>

        <div v-else class="result-empty text-secondary">
          <el-icon :size="42"><Picture /></el-icon>
          <p>生成结果将展示在这里</p>
        </div>
      </div>
    </div>

    <!-- 局部重绘选区弹窗 -->
    <el-dialog v-model="maskVisible" title="局部重绘 · 涂抹要重新打光的区域" width="680px" destroy-on-close @opened="initMask">
      <div class="mask-toolbar">
        <span class="text-secondary">笔刷大小</span>
        <el-slider v-model="brushSize" :min="10" :max="80" style="width:160px" />
        <el-button size="small" @click="clearMask">清空重画</el-button>
      </div>
      <div class="mask-wrap">
        <img ref="maskImg" :src="source.url" class="mask-bg" draggable="false" />
        <canvas
          ref="maskCanvas"
          class="mask-canvas"
          @pointerdown="maskDown"
          @pointermove="maskMove"
          @pointerup="maskDrawing = false"
          @pointerleave="maskDrawing = false"
        ></canvas>
      </div>
      <p class="text-secondary small">涂抹区域将应用新灯光效果，未涂抹区域保持原样（边缘自动羽化）</p>
      <template #footer>
        <el-button @click="maskVisible = false">取消</el-button>
        <el-button type="primary" class="mk-btn-gradient" :loading="uploading" @click="confirmMask">确认选区</el-button>
      </template>
    </el-dialog>

    <!-- 裁剪弹窗 -->
    <el-dialog v-model="cropVisible" title="裁剪图片" width="640px" destroy-on-close @opened="initCropper">
      <div class="crop-wrap"><img ref="cropImg" :src="source.url" style="max-width:100%;display:block" /></div>
      <template #footer>
        <el-button @click="cropVisible = false">取消</el-button>
        <el-button type="primary" class="mk-btn-gradient" :loading="uploading" @click="confirmCrop">确认裁剪</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { apiUpload, apiStyles, apiGenerate, apiGenerateStatus, apiGenerateBatch, apiBatchStatus, apiAdvise, apiShare } from '@/api'
import { useUserStore } from '@/stores/user'
import CompareSlider from '@/components/CompareSlider.vue'
import { compressImage, requestNotifyPermission, notifyDone } from '@/utils/media'

const route = useRoute()
const userStore = useUserStore()

const styles = ref([])
const directions = ref([
  { key: 'none', name: '环境光' }, { key: 'left', name: '左侧' }, { key: 'right', name: '右侧' },
  { key: 'top', name: '顶部' }, { key: 'bottom', name: '底部' }
])
const styleNames = { night_warm: '夜景暖光', daylight: '日间自然光', office_cool: '办公冷光', wall_wash: '氛围洗墙光' }
const cost = ref(5)
const multiCost = ref(8)
const source = reactive({ fileId: '', url: '' })
const params = reactive({ style: 'night_warm', brightness: 50, colorTemp: 3000, intensity: 50, detail: 50, direction: 'none' })
const batchResults = ref([])
const compareMode = ref(false)
const maskId = ref('')
const advising = ref(false)
const adviseReason = ref('')

const fileInput = ref()
const dragging = ref(false)
const uploading = ref(false)
const uploadPercent = ref(0)
const generating = ref(false)
const fakePercent = ref(0)
const result = ref(null)

let pollTimer = null
let fakeTimer = null
let timeoutTimer = null

onMounted(async () => {
  try {
    const data = await apiStyles()
    styles.value = data.styles
    if (data.directions) directions.value = data.directions
    cost.value = data.costPerGeneration
    multiCost.value = data.multiCost || 8
  } catch (e) { /* 网络错误已统一提示 */ }
  // 从历史图库「再次编辑」进入
  if (route.query.fileId) {
    source.fileId = String(route.query.fileId)
    source.url = String(route.query.url || `/uploads/${route.query.fileId}`)
  }
  // 从模板案例「用同款参数」进入
  for (const k of ['style', 'direction']) {
    if (route.query[k]) params[k] = String(route.query[k])
  }
  for (const k of ['brightness', 'colorTemp', 'intensity', 'detail']) {
    if (route.query[k] != null && route.query[k] !== '') params[k] = Number(route.query[k])
  }
  userStore.fetchMe()
})

onBeforeUnmount(() => stopTimers())

const stopTimers = () => {
  clearInterval(pollTimer); clearInterval(fakeTimer); clearTimeout(timeoutTimer)
  pollTimer = fakeTimer = timeoutTimer = null
}

// ---------- 上传 ----------
const pickFile = () => fileInput.value.click()
const onFileChange = e => { const f = e.target.files[0]; if (f) doUpload(f); e.target.value = '' }
const onDrop = e => { dragging.value = false; const f = e.dataTransfer.files[0]; if (f) doUpload(f) }

const doUpload = async file => {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return ElMessage.warning('仅支持 JPG / PNG / WEBP 格式')
  if (file.size > 30 * 1024 * 1024) return ElMessage.warning('图片不能超过30MB')
  uploading.value = true
  uploadPercent.value = 0
  try {
    file = await compressImage(file) // 大图先压缩，加快上传
    const data = await apiUpload(file, ev => { uploadPercent.value = Math.round((ev.loaded / ev.total) * 100) })
    source.fileId = data.fileId
    source.url = data.url
    result.value = null
    batchResults.value = []
    compareMode.value = false
    maskId.value = ''
    adviseReason.value = ''
    ElMessage.success('上传成功')
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    uploading.value = false
  }
}

// ---------- 裁剪 ----------
const cropVisible = ref(false)
const cropImg = ref()
let cropper = null
const openCrop = () => { cropVisible.value = true }
const initCropper = () => {
  cropper = new Cropper(cropImg.value, { viewMode: 1, autoCropArea: 0.9, background: false })
}
const confirmCrop = () => {
  if (!cropper) return
  cropper.getCroppedCanvas({ maxWidth: 2048, maxHeight: 2048 }).toBlob(async blob => {
    cropVisible.value = false
    await doUpload(new File([blob], 'crop.jpg', { type: 'image/jpeg' }))
    cropper?.destroy(); cropper = null
  }, 'image/jpeg', 0.92)
}

// ---------- 局部重绘选区（画笔蒙版） ----------
const maskVisible = ref(false)
const maskImg = ref()
const maskCanvas = ref()
const brushSize = ref(36)
const maskDrawing = ref(false)
let maskCtx = null

const openMask = () => { maskVisible.value = true }
const initMask = () => {
  const img = maskImg.value
  const cvs = maskCanvas.value
  const setup = () => {
    cvs.width = img.clientWidth
    cvs.height = img.clientHeight
    maskCtx = cvs.getContext('2d')
    maskCtx.lineCap = 'round'
    maskCtx.lineJoin = 'round'
  }
  img.complete ? setup() : (img.onload = setup)
}
const drawAt = e => {
  const rect = maskCanvas.value.getBoundingClientRect()
  const x = e.clientX - rect.left, y = e.clientY - rect.top
  maskCtx.fillStyle = 'rgba(124,108,255,0.55)'
  maskCtx.beginPath()
  maskCtx.arc(x, y, brushSize.value / 2, 0, Math.PI * 2)
  maskCtx.fill()
}
const maskDown = e => { maskDrawing.value = true; drawAt(e) }
const maskMove = e => { if (maskDrawing.value) drawAt(e) }
const clearMask = () => maskCtx && maskCtx.clearRect(0, 0, maskCanvas.value.width, maskCanvas.value.height)

const confirmMask = () => {
  const cvs = maskCanvas.value
  const src = maskCtx.getImageData(0, 0, cvs.width, cvs.height)
  // 生成黑白蒙版：涂抹处白色，其余黑色
  const out = document.createElement('canvas')
  out.width = cvs.width; out.height = cvs.height
  const octx = out.getContext('2d')
  octx.fillStyle = '#000'
  octx.fillRect(0, 0, out.width, out.height)
  const od = octx.getImageData(0, 0, out.width, out.height)
  for (let i = 0; i < src.data.length; i += 4) {
    if (src.data[i + 3] > 10) { od.data[i] = od.data[i + 1] = od.data[i + 2] = 255 }
  }
  octx.putImageData(od, 0, 0)
  out.toBlob(async blob => {
    if (!blob) return
    uploading.value = true
    try {
      const data = await apiUpload(new File([blob], 'mask.png', { type: 'image/png' }))
      maskId.value = data.fileId
      maskVisible.value = false
      ElMessage.success('选区已设置，生成时仅重绘涂抹区域')
    } catch (e) {
      if (e.code !== -1) ElMessage.error(e.message)
    } finally {
      uploading.value = false
    }
  }, 'image/png')
}

// ---------- AI灯光顾问 ----------
const advise = async () => {
  advising.value = true
  try {
    const { recommend, reason } = await apiAdvise(source.fileId)
    Object.assign(params, recommend)
    adviseReason.value = reason
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    advising.value = false
  }
}

// ---------- 分享 ----------
const share = async () => {
  try {
    const { shareId } = await apiShare(result.value.id)
    const url = `${location.origin}/s/${shareId}`
    await navigator.clipboard.writeText(url).catch(() => {})
    ElMessageBox.alert(url, '分享链接已复制', { confirmButtonText: '好的' })
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  }
}

// ---------- 生成 ----------
const selectStyle = s => {
  params.style = s.key
  params.colorTemp = s.defaultTemp
}

const handleGenError = e => {
  stopTimers()
  generating.value = false
  if (e.code === 429) {
    ElMessageBox.confirm(e.message, '算力不足', { confirmButtonText: '去充值', cancelButtonText: '取消', type: 'warning' })
      .then(() => { location.href = '/recharge' }).catch(() => {})
  } else if (e.code !== -1) {
    ElMessage.error(e.message)
  }
}

// 一键4风格连拍
const generateBatch = async () => {
  if (!source.fileId) return ElMessage.warning('请先上传照片')
  if (generating.value) return
  requestNotifyPermission()
  generating.value = true
  fakePercent.value = 0
  result.value = null
  batchResults.value = []
  compareMode.value = false
  fakeTimer = setInterval(() => { if (fakePercent.value < 95) fakePercent.value += Math.ceil(Math.random() * 3) }, 400)
  timeoutTimer = setTimeout(() => {
    if (generating.value) { stopTimers(); generating.value = false; ElMessage.error('生成超时，请重试') }
  }, 185000)
  try {
    const { batchId } = await apiGenerateBatch({ fileId: source.fileId, params: { ...params, maskId: maskId.value || undefined } })
    userStore.fetchMe()
    pollTimer = setInterval(async () => {
      try {
        const data = await apiBatchStatus(batchId)
        batchResults.value = data.list
        if (data.done) {
          stopTimers()
          fakePercent.value = 100
          generating.value = false
          const okList = data.list.filter(i => i.status === 'success')
          result.value = okList[0] || null
          ElMessage.success(`连拍完成：成功${okList.length}张`)
          notifyDone(`4风格连拍完成，成功${okList.length}张`)
          if (okList.length < data.list.length) userStore.fetchMe()
        }
      } catch (e) { /* 忽略单次轮询失败 */ }
    }, 1500)
  } catch (e) {
    handleGenError(e)
  }
}

const generate = async () => {
  if (!source.fileId) return ElMessage.warning('请先上传照片')
  if (generating.value) return // 防止重复提交
  requestNotifyPermission()
  generating.value = true
  fakePercent.value = 0
  result.value = null
  batchResults.value = []
  compareMode.value = false
  fakeTimer = setInterval(() => { if (fakePercent.value < 95) fakePercent.value += Math.ceil(Math.random() * 4) }, 400)
  // 超时自动终止（3分钟）
  timeoutTimer = setTimeout(() => {
    if (generating.value) { stopTimers(); generating.value = false; ElMessage.error('生成超时，请重试') }
  }, 185000)

  try {
    const { id } = await apiGenerate({ fileId: source.fileId, params: { ...params, maskId: maskId.value || undefined } })
    userStore.fetchMe()
    pollTimer = setInterval(async () => {
      try {
        const g = await apiGenerateStatus(id)
        if (g.status === 'success' || g.status === 'failed') {
          stopTimers()
          fakePercent.value = 100
          result.value = g
          generating.value = false
          if (g.status === 'success') { ElMessage.success('生成完成！'); notifyDone() }
          else userStore.fetchMe()
        }
      } catch (e) { /* 轮询单次失败忽略，等待下一轮 */ }
    }, 1500)
  } catch (e) {
    handleGenError(e)
  }
}

// ---------- 结果操作 ----------
const download = () => {
  const a = document.createElement('a')
  a.href = result.value.resultUrl
  a.download = `ai-light-${Date.now()}.jpg`
  a.click()
}

// 再次编辑：将生成结果作为新的源图
const editResult = async () => {
  try {
    const resp = await fetch(result.value.resultUrl)
    const blob = await resp.blob()
    await doUpload(new File([blob], 'edit.jpg', { type: 'image/jpeg' }))
    ElMessage.info('已将生成结果设为源图，可继续调整参数生成')
  } catch (e) {
    ElMessage.error('加载结果图失败')
  }
}
</script>

<style scoped lang="scss">
.cost-tip {
  font-size: 13px; font-weight: 400; margin-left: 8px;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0;
}

.studio-grid {
  display: grid;
  grid-template-columns: 1fr 340px 1fr;
  gap: 18px;
  // 平板/手机：变为分步纵向流程（上传 → 参数 → 结果）
  @media (max-width: 1080px) { grid-template-columns: 1fr; gap: 12px; }
}

.panel {
  min-height: 480px;
  @media (max-width: 768px) { min-height: 0; }
  display: flex; flex-direction: column;
  .panel-title {
    display: flex; align-items: center; gap: 8px;
    font-weight: 700; font-size: 15px; margin-bottom: 16px;
    .el-icon { color: var(--mk-primary); }
  }
}

.upload-zone {
  flex: 1;
  border: 2px dashed var(--mk-border);
  border-radius: 12px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.2s; gap: 4px; min-height: 320px;
  .upload-icon { color: var(--mk-primary); }
  p { margin: 6px 0 0; font-size: 14px; }
  &:hover, &.dragging { border-color: var(--mk-primary); background: rgba(124, 108, 255, 0.06); }
}

.source-preview, .result-box { flex: 1; display: flex; flex-direction: column; }
.preview-img { flex: 1; min-height: 300px; max-height: 420px; border-radius: 10px; overflow: hidden; background: rgba(0,0,0,0.15); }
.source-actions, .result-actions {
  display: flex; gap: 6px; margin-top: 12px; justify-content: center;
  flex-wrap: wrap; // 按钮多时自动换行，避免溢出被裁剪
  .el-button { margin: 0; }
}

.param-label { font-size: 13px; margin: 10px 0 2px; font-weight: 600; display: flex; justify-content: space-between; }
.style-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 4px;
  .style-item {
    padding: 10px 6px; text-align: center; font-size: 13px;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    border: 1px solid var(--mk-border); border-radius: 10px; cursor: pointer; transition: all 0.2s;
    &:hover { border-color: var(--mk-primary); }
    &.active { background: var(--mk-gradient); color: #fff; border-color: transparent; font-weight: 600; }
  }
}
.generate-btn { width: 100%; margin-top: 18px; }
.batch-btn { width: 100%; margin: 10px 0 0 !important; }

.dir-row {
  display: flex; gap: 6px; margin: 8px 0 4px;
  .dir-item {
    flex: 1; padding: 8px 2px; text-align: center; font-size: 12px;
    border: 1px solid var(--mk-border); border-radius: 8px; cursor: pointer; transition: all 0.2s;
    &:hover { border-color: var(--mk-primary); }
    &.active { background: var(--mk-gradient); color: #fff; border-color: transparent; font-weight: 600; }
  }
}

.batch-grid-wrap { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.batch-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
  .batch-cell {
    position: relative; border-radius: 8px; overflow: hidden; cursor: pointer;
    border: 2px solid transparent; transition: border-color 0.2s; aspect-ratio: 4/3;
    background: rgba(0,0,0,0.15);
    &.active { border-color: var(--mk-primary); }
    .batch-img { width: 100%; height: 100%; }
    .batch-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 20px; color: var(--mk-primary); }
    .batch-name {
      position: absolute; left: 0; right: 0; bottom: 0; font-size: 11px; text-align: center;
      color: #fff; background: rgba(0,0,0,0.55); padding: 2px 4px;
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    }
  }
}
.batch-detail { flex: 1; display: flex; flex-direction: column; .detail-img { max-height: 320px; min-height: 240px; } }

.result-loading, .result-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  p { margin: 0; font-size: 14px; }
}
.small { font-size: 12px; }
.center { text-align: center; margin-top: 8px; }
.upload-progress { margin-top: 12px; }
.crop-wrap { max-height: 420px; overflow: hidden; }

.advise-btn { width: 100%; margin-bottom: 6px; }
.advise-tip { margin: 6px 0; :deep(.el-alert__title) { font-size: 12px; line-height: 1.6; } }

.mask-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.mask-wrap {
  position: relative; display: inline-block; max-height: 440px; overflow: hidden; border-radius: 8px;
  .mask-bg { max-width: 100%; max-height: 440px; display: block; user-select: none; }
  .mask-canvas { position: absolute; inset: 0; cursor: crosshair; touch-action: none; }
}
</style>
