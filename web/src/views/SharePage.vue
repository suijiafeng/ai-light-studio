<template>
  <div class="page-container share-page">
    <el-empty v-if="notFound" description="分享不存在或已被删除" />
    <template v-else-if="data">
      <div class="mk-card share-card">
        <h2><span class="mk-gradient-text">{{ data.nickname }}</span> 的AI灯光设计作品</h2>
        <p class="text-secondary sub">{{ styleName }} · {{ formatTime(data.createdAt) }}</p>
        <CompareSlider :before="data.sourceUrl" :after="data.resultUrl" class="slider" />
        <p class="text-secondary tip">拖动滑块对比原图与灯光效果</p>
        <div class="cta">
          <el-button class="mk-btn-gradient" size="large" round @click="goRegister">
            <el-icon><MagicStick /></el-icon>&nbsp;我也要做灯光设计（注册领{{ 20 }}算力）
          </el-button>
        </div>
      </div>
    </template>
    <el-skeleton v-else :rows="6" animated />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiShareInfo } from '@/api'
import CompareSlider from '@/components/CompareSlider.vue'

const route = useRoute()
const router = useRouter()
const data = ref(null)
const notFound = ref(false)

const STYLE_NAMES = { night_warm: '夜景暖光', daylight: '日间自然光', office_cool: '办公冷光', wall_wash: '氛围洗墙光' }
const styleName = computed(() => STYLE_NAMES[data.value?.params?.style] || 'AI灯光方案')
const formatTime = ts => new Date(ts).toLocaleDateString('zh-CN')

onMounted(async () => {
  try {
    data.value = await apiShareInfo(route.params.shareId)
  } catch (e) {
    notFound.value = true
  }
})

const goRegister = () => {
  const invite = data.value?.inviteCode ? `?invite=${data.value.inviteCode}` : ''
  router.push(`/login${invite}`)
}
</script>

<style scoped lang="scss">
.share-page { max-width: 860px; }
.share-card {
  text-align: center; padding: 30px;
  h2 { margin: 0 0 4px; word-break: break-all; }
  .sub { margin: 0 0 20px; font-size: 13px; }
  .slider { max-width: 720px; margin: 0 auto; }
  .tip { font-size: 12px; margin: 10px 0 20px; }
}
</style>
