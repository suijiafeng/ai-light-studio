<template>
  <div class="page-container">
    <div class="page-title"><el-icon class="mk-gradient-text"><PictureRounded /></el-icon> 历史图库</div>

    <div class="filters">
      <el-select v-model="filterStyle" placeholder="全部风格" clearable style="width:150px" @change="reload">
        <el-option v-for="(n, k) in STYLE_NAMES" :key="k" :label="n" :value="k" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width:130px" @change="reload">
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
        <el-option label="生成中" value="processing" />
      </el-select>
      <span class="text-secondary count">共 {{ total }} 条</span>
      <template v-if="list.length">
        <el-button v-if="!compareMode" size="small" plain round @click="compareMode = true">
          <el-icon><Switch /></el-icon>&nbsp;方案对比
        </el-button>
        <template v-else>
          <span class="text-secondary compare-tip">勾选2-4个成功方案</span>
          <el-button size="small" type="primary" round :disabled="picked.length < 2" @click="compareVisible = true">
            开始对比（{{ picked.length }}/4）
          </el-button>
          <el-button size="small" round @click="exitCompare">取消</el-button>
        </template>
      </template>
    </div>

    <el-skeleton v-if="loading && !list.length" :rows="5" animated />

    <el-empty v-else-if="!list.length" description="还没有生成记录，去工作台开始创作吧">
      <el-button class="mk-btn-gradient" round @click="$router.push('/studio')">前往工作台</el-button>
    </el-empty>

    <div v-else class="gallery">
      <div v-for="item in list" :key="item.id" class="mk-card hoverable item" :class="{ picked: isPicked(item) }">
        <div class="thumb" :class="{ pickable: compareMode && item.status === 'success' }" @click="compareMode ? togglePick(item) : openView(item)">
          <el-image :src="item.resultUrl || item.sourceUrl" fit="contain" class="img" lazy />
          <el-tag v-if="item.status === 'failed'" type="danger" size="small" class="badge">失败</el-tag>
          <el-tag v-else-if="item.status === 'processing'" type="warning" size="small" class="badge">生成中</el-tag>
          <el-tag v-else-if="item.premium" type="warning" size="small" effect="dark" class="badge">2048px·高清</el-tag>
          <el-tag v-else type="info" size="small" class="badge">1024px·水印</el-tag>
          <div v-if="isPicked(item)" class="pick-mark"><el-icon><Select /></el-icon></div>
        </div>
        <div class="meta">
          <span class="text-secondary ellipsis">{{ styleName(item.params.style) }} · {{ formatTime(item.createdAt) }}</span>
          <span class="text-secondary cost">消耗{{ item.cost }}算力</span>
        </div>
        <div class="ops">
          <el-button size="small" text type="primary" :disabled="!item.resultUrl" @click="download(item)">
            <el-icon><Download /></el-icon>下载
          </el-button>
          <el-button size="small" text type="primary" @click="reEdit(item)">
            <el-icon><EditPen /></el-icon>编辑
          </el-button>
          <el-dropdown trigger="click" @command="cmd => onMore(cmd, item)">
            <el-button size="small" text>
              <el-icon class="more-icon"><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="report" :disabled="item.status !== 'success'">
                  <el-icon><Document /></el-icon>方案
                </el-dropdown-item>
                <el-dropdown-item command="share" :disabled="item.status !== 'success'">
                  <el-icon><Share /></el-icon>分享
                </el-dropdown-item>
                <el-dropdown-item command="delete" divided>
                  <el-icon><Delete /></el-icon><span style="color:#f56c6c">删除</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- 统一查看弹窗：前后对比 -->
    <el-dialog v-model="viewVisible" :title="viewItem ? `${styleName(viewItem.params.style)} · ${formatTime(viewItem.createdAt)}` : ''" width="720px" destroy-on-close>
      <template v-if="viewItem">
        <CompareSlider v-if="viewItem.resultUrl" :before="viewItem.sourceUrl" :after="viewItem.resultUrl" />
        <el-image v-else :src="viewItem.sourceUrl" fit="contain" style="width:100%" />
        <p class="text-secondary view-tip">{{ viewItem.resultUrl ? '拖动滑块对比原图与效果图' : '该记录暂无结果图' }}</p>
      </template>
      <template #footer>
        <el-button :disabled="!viewItem?.resultUrl" @click="download(viewItem)"><el-icon><Download /></el-icon>下载</el-button>
        <el-button @click="reEdit(viewItem)"><el-icon><EditPen /></el-icon>再次编辑</el-button>
        <el-button type="primary" class="mk-btn-gradient" :disabled="viewItem?.status !== 'success'" @click="$router.push(`/report/${viewItem.id}`)">查看报告</el-button>
      </template>
    </el-dialog>

    <!-- 多方案并排对比弹窗 -->
    <el-dialog v-model="compareVisible" title="方案对比" :width="picked.length > 2 ? '92%' : '760px'" top="6vh">
      <div class="compare-grid" :style="{ gridTemplateColumns: `repeat(${picked.length}, 1fr)` }">
        <div v-for="item in picked" :key="item.id" class="compare-cell">
          <el-image :src="item.resultUrl" fit="contain" class="compare-img" :preview-src-list="picked.map(p => p.resultUrl)" />
          <div class="compare-name">{{ styleName(item.params.style) }}</div>
          <div class="compare-params text-secondary">
            {{ item.params.colorTemp || '-' }}K · 亮度{{ item.params.brightness ?? '-' }} · {{ dirName(item.params.direction) }}
            <br />{{ formatTime(item.createdAt) }}
          </div>
        </div>
      </div>
    </el-dialog>

    <div v-if="total > size" class="pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="size"
        :total="total"
        layout="prev, pager, next"
        background
        @current-change="load"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiHistory, apiDeleteGeneration, apiShare } from '@/api'
import CompareSlider from '@/components/CompareSlider.vue'

const router = useRouter()
const list = ref([])
const total = ref(0)
const page = ref(1)
const size = 12
const loading = ref(false)
const filterStyle = ref('')
const filterStatus = ref('')

const STYLE_NAMES = { night_warm: '夜景暖光', daylight: '日间自然光', office_cool: '办公冷光', wall_wash: '氛围洗墙光' }

const DIR_NAMES = { none: '环境光', left: '左侧光', right: '右侧光', top: '顶部光', bottom: '底部光' }

const reload = () => { page.value = 1; load() }
const styleName = k => STYLE_NAMES[k] || '自定义'
const dirName = k => DIR_NAMES[k] || '环境光'
const formatTime = ts => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

// ---------- 多方案并排对比 ----------
const compareMode = ref(false)
const compareVisible = ref(false)
const picked = ref([])
const isPicked = item => picked.value.some(p => p.id === item.id)
const togglePick = item => {
  if (item.status !== 'success') return
  if (isPicked(item)) {
    picked.value = picked.value.filter(p => p.id !== item.id)
  } else if (picked.value.length >= 4) {
    ElMessage.warning('最多对比4个方案')
  } else {
    picked.value.push(item)
  }
}
const exitCompare = () => {
  compareMode.value = false
  picked.value = []
}

const load = async () => {
  loading.value = true
  try {
    const data = await apiHistory({ page: page.value, size, style: filterStyle.value || undefined, status: filterStatus.value || undefined })
    list.value = data.list
    total.value = data.total
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const download = item => {
  const a = document.createElement('a')
  a.href = item.resultUrl
  a.download = `ai-light-${item.id}.jpg`
  a.click()
}

const reEdit = item => {
  const fileId = item.sourceUrl.split('/').pop()
  router.push({ path: '/studio', query: { fileId, url: item.sourceUrl } })
}

// 统一查看弹窗
const viewVisible = ref(false)
const viewItem = ref(null)
const openView = item => {
  viewItem.value = item
  viewVisible.value = true
}

const onMore = (cmd, item) => {
  if (cmd === 'report') router.push(`/report/${item.id}`)
  else if (cmd === 'share') share(item)
  else if (cmd === 'delete') remove(item)
}

const share = async item => {
  try {
    const { shareId } = await apiShare(item.id)
    const url = `${location.origin}/s/${shareId}`
    await navigator.clipboard.writeText(url).catch(() => {})
    ElMessageBox.alert(url, '分享链接已复制', { confirmButtonText: '好的' })
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  }
}

const remove = async item => {
  try {
    await ElMessageBox.confirm('删除后不可恢复，确认删除该记录？', '提示', { type: 'warning' })
    await apiDeleteGeneration(item.id)
    ElMessage.success('已删除')
    load()
  } catch (e) {
    if (e !== 'cancel' && e.code !== -1) ElMessage.error(e.message)
  }
}
</script>

<style scoped lang="scss">
.filters { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; .count { font-size: 13px; margin-left: auto; } }
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.item {
  padding: 12px;
  &.picked { border-color: var(--mk-primary); box-shadow: 0 0 0 2px rgba(124, 108, 255, 0.35); }
  .thumb { position: relative; cursor: zoom-in; &.pickable { cursor: pointer; } }
  .pick-mark {
    position: absolute; top: 8px; left: 8px; width: 26px; height: 26px; border-radius: 50%;
    background: var(--mk-primary); color: #fff; display: flex; align-items: center; justify-content: center;
  }
  .img { width: 100%; height: 190px; border-radius: 10px; overflow: hidden; display: block; background: var(--mk-bg); }
  .badge { position: absolute; top: 8px; right: 8px; }
  .meta {
    display: flex; justify-content: space-between; gap: 8px;
    font-size: 12px; margin: 10px 2px 4px;
    .ellipsis { flex: 1; min-width: 0; }
    .cost { flex-shrink: 0; }
  }
  .ops {
    display: flex; justify-content: flex-end; align-items: center;

    .el-button { margin: 0; padding: 6px 8px; color:#7f7f7f;}
  }
}
.pager { display: flex; justify-content: center; margin-top: 26px; }
.view-tip { font-size: 12px; text-align: center; margin: 10px 0 0; }
.compare-tip { font-size: 12px; }
.compare-grid { display: grid; gap: 14px; }
.compare-cell {
  .compare-img { width: 100%; aspect-ratio: 4/3; border-radius: 10px; overflow: hidden; display: block; background: var(--mk-bg); }
  .compare-name { font-weight: 700; margin: 8px 0 2px; }
  .compare-params { font-size: 12px; line-height: 1.7; }
}
</style>
