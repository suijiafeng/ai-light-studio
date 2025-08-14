<template>
  <div class="page-container studio">
        <div class="studio-top">
      <div class="st-title">
        <el-icon class="mk-gradient-text"><MagicStick /></el-icon> AI灯光工作台
        <el-tag v-if="aiProvider === 'mock'" type="warning" effect="plain" size="small" round>演示模式</el-tag>
      </div>
      <div class="st-credit">
        算力余额 <b>{{ userStore.credits }}</b>
      </div>
    </div>

        <div class="steps">
      <div class="step" :class="{ active: step === 1, done: step > 1 }">
        <span class="n"><el-icon v-if="step > 1"><Check /></el-icon><template v-else>1</template></span>上传照片
      </div>
      <div class="step-line" :class="{ done: step > 1 }"></div>
      <div class="step" :class="{ active: step === 2, done: step > 2 }">
        <span class="n"><el-icon v-if="step > 2"><Check /></el-icon><template v-else>2</template></span>挑选效果
      </div>
      <div class="step-line" :class="{ done: step > 2 }"></div>
      <div class="step" :class="{ active: step === 3 }">
        <span class="n">3</span>生成下载
      </div>
    </div>

    <div class="mk-card stage">
            <template v-if="step === 1">
        <div
          class="drop"
          :class="{ dragging }"
          @click="pickFile"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <div class="drop-ic"><el-icon :size="28"><UploadFilled /></el-icon></div>
          <h2>上传室内实景照片，开始重打光</h2>
          <p class="sub">点击或拖拽 · 支持 JPG / PNG / WEBP，最大 15MB</p>
          <el-progress v-if="uploading" :percentage="uploadPercent" :stroke-width="6" class="drop-progress" />
        </div>
        <div class="examples">
          <div class="ex-lab">示例效果 · 同一张照片的不同灯光方案</div>
          <div class="ex-row">
            <div v-for="s in exampleStyles" :key="s.key" class="ex" :style="{ background: styleSwatch(s.key) }">
              <span class="ex-cap">{{ s.name }}</span>
            </div>
          </div>
        </div>
      </template>

            <template v-else-if="step === 2">
        <div class="work">
                    <div class="canvas-col">
            <div class="photo">
              <el-image :src="source.url" fit="contain" :preview-src-list="[source.url]" class="photo-img" />
              <span class="photo-badge">原图</span>
            </div>
            <div class="photo-tools">
              <el-button size="small" text @click="pickFile"><el-icon><RefreshLeft /></el-icon>更换</el-button>
              <el-button size="small" text @click="openCrop"><el-icon><Crop /></el-icon>裁剪</el-button>
              <el-button size="small" text :type="maskId ? 'success' : ''" @click="openMask">
                <el-icon><Brush /></el-icon>{{ maskId ? '已设选区' : '局部重绘' }}
              </el-button>
              <el-button v-if="maskId" size="small" text type="danger" @click="maskId = ''">清除选区</el-button>
            </div>
          </div>

                    <div class="side">
            <div>
              <div class="side-h">
                选一个想要的效果
                <span v-if="advising" class="rec"><el-icon class="is-loading"><Loading /></el-icon> AI推荐中…</span>
                <span v-else-if="recommendedStyle" class="rec"><el-icon><StarFilled /></el-icon> AI已为你预选</span>
              </div>
              <div class="looks">
                <div
                  v-for="s in styles"
                  :key="s.key"
                  class="look"
                  :class="{ on: params.style === s.key }"
                  @click="selectStyle(s)"
                >
                  <span v-if="recommendedStyle === s.key" class="best">推荐</span>
                  <div class="sw" :style="{ background: styleSwatch(s.key) }"></div>
                  <div class="meta">
                    <div class="nm">{{ s.name }}</div>
                    <div class="ds">{{ styleDesc(s) }}</div>
                  </div>
                  <div class="tick"><el-icon><Check /></el-icon></div>
                </div>
              </div>
              <el-alert
                v-if="adviseReason"
                :title="adviseReason"
                type="success"
                :closable="true"
                class="advise-tip"
                @close="adviseReason = ''"
              />
            </div>

                        <div class="adv" :class="{ open: advOpen }">
              <div class="adv-toggle" @click="advOpen = !advOpen">
                <span><el-icon><Operation /></el-icon> 微调参数（可选）</span>
                <el-icon class="chev"><ArrowDown /></el-icon>
              </div>
              <div v-show="advOpen" class="adv-body">
                <div class="field">
                  <div class="fl">亮度 <span>{{ params.brightness }}</span></div>
                  <el-slider v-model="params.brightness" :min="0" :max="100" size="small" />
                </div>
                <div class="field">
                  <div class="fl">色温 <span>{{ params.colorTemp }}K</span></div>
                  <el-slider v-model="params.colorTemp" :min="2000" :max="8000" :step="100" size="small" />
                </div>
                <div class="field">
                  <div class="fl">光影强度 <span>{{ params.intensity }}</span></div>
                  <el-slider v-model="params.intensity" :min="0" :max="100" size="small" />
                </div>
                <div class="field">
                  <div class="fl">明暗细节 <span>{{ params.detail }}</span></div>
                  <el-slider v-model="params.detail" :min="0" :max="100" size="small" />
                </div>
                <div class="field">
                  <div class="fl">光源方向</div>
                  <div class="dirs">
                    <div
                      v-for="d in directions"
                      :key="d.key"
                      class="dir"
                      :class="{ on: params.direction === d.key }"
                      @click="params.direction = d.key"
                    >{{ d.name }}</div>
                  </div>
                </div>
              </div>
            </div>

                        <div class="cta-zone">
              <el-button class="mk-btn-gradient btn-primary" size="large" @click="generate">
                <el-icon><MagicStick /></el-icon>&nbsp;生成效果 · 消耗 {{ cost }} 算力
              </el-button>
              <button class="btn-secondary" @click="generateBatch">或一次生成全部 4 种风格（{{ multiCost }} 算力）</button>
            </div>
          </div>
        </div>
      </template>

            <template v-else>
                <div v-if="generating" class="result-loading">
          <el-progress type="circle" :percentage="fakePercent" :width="96" />
          <p class="text-secondary">AI正在重绘灯光效果，请稍候…</p>
          <p class="text-secondary small">通常需要 10–40 秒</p>
        </div>

                <div v-else-if="batchResults.length" class="batch-wrap">
          <div class="batch-grid">
            <div
              v-for="b in batchResults"
              :key="b.id"
              class="batch-cell"
              :class="{ active: result && result.id === b.id }"
              @click="b.status === 'success' && (result = b)"
            >
              <el-image v-if="b.resultUrl" :src="b.resultUrl" fit="contain" class="batch-img" />
              <div v-else class="batch-ph">
                <el-icon v-if="b.status === 'processing'" class="is-loading"><Loading /></el-icon>
                <el-icon v-else color="#f56c6c"><WarningFilled /></el-icon>
              </div>
              <span class="batch-name">{{ styleNames[b.params.style] || '方案' }}</span>
            </div>
          </div>
          <div v-if="result && result.status === 'success'" class="result-view">
            <CompareSlider v-if="compareMode" :before="result.sourceUrl" :after="result.resultUrl" class="result-media" />
            <el-image v-else :src="result.resultUrl" fit="contain" :preview-src-list="[result.resultUrl, result.sourceUrl]" class="result-media" />
            <div class="result-actions">
              <el-button size="small" :type="compareMode ? 'primary' : ''" plain @click="compareMode = !compareMode"><el-icon><Switch /></el-icon>对比</el-button>
              <el-button size="small" type="primary" @click="download"><el-icon><Download /></el-icon>下载</el-button>
              <el-button size="small" plain @click="editResult"><el-icon><EditPen /></el-icon>再次编辑</el-button>
              <el-button size="small" plain @click="backToEdit"><el-icon><RefreshLeft /></el-icon>换个效果</el-button>
            </div>
            <div class="tier-line" v-html="tierHtml(result)"></div>
          </div>
          <p v-else class="text-secondary small center">点击上方缩略图查看大图</p>
        </div>

                <div v-else-if="result && result.status === 'success'" class="result-view single">
          <CompareSlider v-if="compareMode" :before="result.sourceUrl" :after="result.resultUrl" class="result-media" />
          <el-image v-else :src="result.resultUrl" fit="contain" :preview-src-list="[result.resultUrl, result.sourceUrl]" class="result-media" />
          <div class="result-actions">
            <el-button size="small" :type="compareMode ? 'primary' : ''" plain @click="compareMode = !compareMode"><el-icon><Switch /></el-icon>对比</el-button>
            <el-button size="small" type="primary" @click="download"><el-icon><Download /></el-icon>下载</el-button>
            <el-button size="small" plain @click="share"><el-icon><Share /></el-icon>分享</el-button>
            <el-button size="small" plain @click="editResult"><el-icon><EditPen /></el-icon>再次编辑</el-button>
            <el-button size="small" plain @click="backToEdit"><el-icon><RefreshLeft /></el-icon>换个效果</el-button>
            <el-button size="small" plain @click="$router.push(`/report/${result.id}`)"><el-icon><Document /></el-icon>报告</el-button>
          </div>
          <div class="tier-line" v-html="tierHtml(result)"></div>
        </div>

                <div v-else-if="result && result.status === 'failed'" class="result-empty">
          <el-icon :size="40" color="#f56c6c"><WarningFilled /></el-icon>
          <p>生成失败：{{ result.error || '未知错误' }}</p>
          <p class="text-secondary small">算力已自动退还</p>
          <div class="result-actions">
            <el-button type="primary" @click="generate">重试</el-button>
            <el-button plain @click="backToEdit">返回调整</el-button>
          </div>
        </div>
      </template>
    </div>

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

        <el-dialog v-model="cropVisible" title="裁剪图片" width="640px" destroy-on-close @opened="initCropper">
      <div class="crop-wrap"><img ref="cropImg" :src="source.url" style="max-width:100%;display:block" /></div>
      <template #footer>
        <el-button @click="cropVisible = false">取消</el-button>
        <el-button type="primary" class="mk-btn-gradient" :loading="uploading" @click="confirmCrop">确认裁剪</el-button>
      </template>
    </el-dialog>

    <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onFileChange" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
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
const SWATCHES = {
  night_warm: 'radial-gradient(120% 90% at 30% 20%,#ffd9a0 0%,#c98a4a 35%,#5a3d28 75%,#241a12 100%)',
  daylight: 'radial-gradient(120% 90% at 40% 15%,#fff6e6 0%,#dfe6ec 40%,#9fb0bd 80%,#5c6b78 100%)',
  office_cool: 'radial-gradient(120% 90% at 50% 20%,#eaf4ff 0%,#b8d4ec 40%,#7f9db8 80%,#465868 100%)',
  wall_wash: 'linear-gradient(105deg,#ffb877 0%,#a9663f 30%,#4a2f22 70%,#1c1410 100%)'
}
const styleSwatch = k => SWATCHES[k] || 'linear-gradient(135deg,#7c6cff 0%,#4dd0e1 100%)'
const styleDesc = s => (s.defaultTemp ? `${s.defaultTemp}K` : '智能配光')
const exampleStyles = computed(() =>
  styles.value.length ? styles.value.slice(0, 4)
    : Object.keys(styleNames).map(key => ({ key, name: styleNames[key] }))
)

const cost = ref(5)
const multiCost = ref(8)
const aiProvider = ref('mock')
const source = reactive({ fileId: '', url: '' })
const params = reactive({ style: 'night_warm', brightness: 50, colorTemp: 3000, intensity: 50, detail: 50, direction: 'none' })
const batchResults = ref([])
const compareMode = ref(false)
const maskId = ref('')
const advising = ref(false)
const adviseReason = ref('')
const recommendedStyle = ref('')
const advOpen = ref(false)

const fileInput = ref()
const dragging = ref(false)
const uploading = ref(false)
const uploadPercent = ref(0)
const generating = ref(false)
const fakePercent = ref(0)
const result = ref(null)
const step = computed(() => {
  if (!source.fileId) return 1
  if (generating.value || result.value || batchResults.value.length) return 3
  return 2
})

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
    if (data.aiProvider) aiProvider.value = data.aiProvider
  } catch (e) {  }
  if (route.query.fileId) {
    source.fileId = String(route.query.fileId)
    source.url = String(route.query.url || `/uploads/${route.query.fileId}`)
  }
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
    recommendedStyle.value = ''
    ElMessage.success('上传成功')
    autoAdvise() // 上传后自动推荐，无需用户手动点击
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    uploading.value = false
  }
}
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
const autoAdvise = async () => {
  if (!source.fileId) return
  advising.value = true
  try {
    const { recommend, reason } = await apiAdvise(source.fileId)
    Object.assign(params, recommend)
    if (recommend && recommend.style) recommendedStyle.value = recommend.style
    adviseReason.value = reason
  } catch (e) {
      } finally {
    advising.value = false
  }
}
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
const tierHtml = r => r.premium
  ? '<span class="mk-tier premium">2048px 高清 · 无水印</span>'
  : '<span class="mk-tier free">免费版 1024px · 含水印</span> <a href="/recharge" class="mk-tier-link">开通会员享 2048px 高清无水印 →</a>'
const selectStyle = s => {
  params.style = s.key
  params.colorTemp = s.defaultTemp || params.colorTemp
}

const backToEdit = () => {
  stopTimers()
  generating.value = false
  result.value = null
  batchResults.value = []
  compareMode.value = false
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
      } catch (e) {  }
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
      } catch (e) {  }
    }, 1500)
  } catch (e) {
    handleGenError(e)
  }
}
const download = () => {
  const a = document.createElement('a')
  a.href = result.value.resultUrl
  a.download = `ai-light-${Date.now()}.jpg`
  a.click()
}
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
.studio { max-width: 1080px; margin: 0 auto; }

.studio-top {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
}
.st-title {
  display: flex; align-items: center; gap: 8px; font-size: 19px; font-weight: 750;
  .el-icon { font-size: 22px; }
}
.st-credit {
  font-size: 13px; color: var(--mk-text-2);
  b { color: var(--mk-text); font-variant-numeric: tabular-nums; margin-left: 2px; }
}

.steps { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.step {
  display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--mk-text-2);
  white-space: nowrap;
  .n {
    width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
    font-size: 12px; background: var(--mk-border); color: var(--mk-text-2); transition: .25s;
  }
  &.active { color: var(--mk-text); .n { background: var(--mk-gradient); color: #fff; } }
  &.done { color: var(--mk-text); .n { background: var(--mk-primary); color: #fff; } }
}
.step-line {
  flex: 1; height: 2px; background: var(--mk-border); border-radius: 2px; max-width: 90px; transition: .25s;
  &.done { background: var(--mk-primary); }
}

.stage { padding: 22px; min-height: 460px; display: flex; flex-direction: column; }

.drop {
  border: 2px dashed var(--mk-border); border-radius: 16px;
  padding: 46px 24px; text-align: center; cursor: pointer; transition: .2s;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  &:hover, &.dragging { border-color: var(--mk-primary); background: rgba(124, 108, 255, .05); }
  h2 { font-size: 17px; font-weight: 700; margin-top: 8px; }
  .sub { font-size: 13px; color: var(--mk-text-2); }
}
.drop-ic {
  width: 56px; height: 56px; border-radius: 16px; background: var(--mk-gradient);
  display: grid; place-items: center; color: #fff;
}
.drop-progress { width: 60%; margin-top: 14px; }
.examples { margin-top: 22px; }
.ex-lab { font-size: 12px; color: var(--mk-text-2); text-align: center; margin-bottom: 10px; letter-spacing: .03em; }
.ex-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.ex {
  border-radius: 12px; overflow: hidden; position: relative; aspect-ratio: 4/3;
  border: 1px solid var(--mk-border);
  .ex-cap {
    position: absolute; left: 0; right: 0; bottom: 0; font-size: 11px; color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, .6)); padding: 14px 8px 6px; text-align: center;
  }
}

.work { display: grid; grid-template-columns: 1fr 320px; gap: 20px; flex: 1; }
.canvas-col { display: flex; flex-direction: column; gap: 12px; }
.photo {
  border-radius: 14px; overflow: hidden; position: relative; aspect-ratio: 4/3;
  border: 1px solid var(--mk-border); background: rgba(0, 0, 0, .12);
  .photo-img { width: 100%; height: 100%; }
  .photo-badge {
    position: absolute; top: 10px; left: 10px; font-size: 11px; font-weight: 600;
    background: rgba(0, 0, 0, .55); color: #fff; padding: 3px 9px; border-radius: 20px;
  }
}
.photo-tools { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; }

.side { display: flex; flex-direction: column; gap: 14px; }
.side-h {
  font-size: 13.5px; font-weight: 700; display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
  .rec { font-size: 11.5px; font-weight: 600; color: var(--mk-primary); display: flex; align-items: center; gap: 4px; }
}

.looks { display: flex; flex-direction: column; gap: 9px; }
.look {
  display: flex; align-items: center; gap: 11px; padding: 8px; border-radius: 12px; cursor: pointer;
  border: 2px solid var(--mk-border); transition: .16s; position: relative;
  &:hover { border-color: var(--mk-border); background: rgba(124, 108, 255, .03); }
  &.on { border-color: var(--mk-primary); background: rgba(124, 108, 255, .06); }
  .sw { width: 52px; height: 44px; border-radius: 8px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .05); }
  .meta { .nm { font-size: 13.5px; font-weight: 650; } .ds { font-size: 11.5px; color: var(--mk-text-2); margin-top: 1px; } }
  .tick {
    position: absolute; top: 8px; right: 9px; width: 18px; height: 18px; border-radius: 50%;
    background: var(--mk-gradient); color: #fff; display: none; place-items: center; font-size: 11px;
  }
  &.on .tick { display: grid; }
  .best {
    position: absolute; top: -7px; right: 10px; font-size: 10px; font-weight: 700; color: #fff;
    background: var(--mk-primary); padding: 1px 7px; border-radius: 20px; letter-spacing: .02em;
  }
}
.advise-tip { margin-top: 10px; :deep(.el-alert__title) { font-size: 12px; line-height: 1.6; } }

.adv { border-top: 1px solid var(--mk-border); padding-top: 12px; }
.adv-toggle {
  display: flex; align-items: center; justify-content: space-between; cursor: pointer;
  font-size: 12.5px; font-weight: 600; color: var(--mk-text-2); user-select: none;
  span { display: flex; align-items: center; gap: 5px; }
  &:hover { color: var(--mk-text); }
  .chev { transition: transform .2s; }
}
.adv.open .chev { transform: rotate(180deg); }
.adv-body { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; }
.field { .fl { font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; span { color: var(--mk-text-2); font-variant-numeric: tabular-nums; } } }
.dirs { display: flex; gap: 6px; margin-top: 6px; }
.dir {
  flex: 1; text-align: center; font-size: 11.5px; font-weight: 600; padding: 7px 2px; border-radius: 8px;
  border: 1px solid var(--mk-border); cursor: pointer; color: var(--mk-text-2); transition: .16s;
  &:hover { border-color: var(--mk-primary); }
  &.on { background: var(--mk-gradient); color: #fff; border-color: transparent; }
}

.cta-zone { display: flex; flex-direction: column; gap: 9px; margin-top: auto; }
.btn-primary { width: 100%; font-size: 15px; font-weight: 700; padding: 14px; }
.btn-secondary {
  font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; color: var(--mk-text-2);
  background: transparent; border: none; padding: 2px; text-decoration: underline; text-underline-offset: 3px;
  &:hover { color: var(--mk-primary); }
}

.result-loading, .result-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  p { margin: 0; font-size: 14px; }
}
.result-view { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.result-media {
  width: 100%; height: 520px; border-radius: 16px; overflow: hidden;
  background: rgba(0, 0, 0, .12);
}
.result-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; .el-button { margin: 0; } }
.tier-line { font-size: 12.5px; display: flex; gap: 10px; align-items: center; justify-content: center; }
:deep(.mk-tier) { padding: 3px 10px; border-radius: 20px; font-weight: 600; }
:deep(.mk-tier.premium) { background: rgba(230, 162, 60, .16); color: #b26b00; }
:deep(.mk-tier.free) { background: var(--mk-border); color: var(--mk-text-2); }
:deep(.mk-tier-link) { color: var(--mk-primary); text-decoration: none; font-weight: 600; }

.batch-wrap { flex: 1; display: flex; flex-direction: column; gap: 14px; }
.batch-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.batch-cell {
  position: relative; border-radius: 10px; overflow: hidden; cursor: pointer;
  border: 2px solid transparent; transition: border-color .2s; aspect-ratio: 4/3; background: rgba(0, 0, 0, .12);
  &.active { border-color: var(--mk-primary); }
  .batch-img { width: 100%; height: 100%; }
  .batch-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 20px; color: var(--mk-primary); }
  .batch-name {
    position: absolute; left: 0; right: 0; bottom: 0; font-size: 11px; text-align: center; color: #fff;
    background: rgba(0, 0, 0, .55); padding: 2px 4px;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
}

.small { font-size: 12px; }
.center { text-align: center; margin-top: 8px; }

.mask-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.mask-wrap {
  position: relative; display: inline-block; max-height: 440px; overflow: hidden; border-radius: 8px;
  .mask-bg { max-width: 100%; max-height: 440px; display: block; user-select: none; }
  .mask-canvas { position: absolute; inset: 0; cursor: crosshair; touch-action: none; }
}
.crop-wrap { max-height: 420px; overflow: hidden; }

@media (max-width: 760px) {
  .work { grid-template-columns: 1fr; }
  .ex-row { grid-template-columns: repeat(2, 1fr); }
  .batch-grid { grid-template-columns: repeat(2, 1fr); }
  .step-line { max-width: 40px; }
}
</style>
