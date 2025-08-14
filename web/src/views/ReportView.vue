<template>
  <div class="page-container report">
    <div class="toolbar no-print">
      <el-button @click="$router.back()"><el-icon><Back /></el-icon>返回</el-button>
      <el-button type="primary" class="mk-btn-gradient" @click="print"><el-icon><Printer /></el-icon>导出PDF / 打印</el-button>
    </div>

    <el-skeleton v-if="!item" :rows="8" animated />
    <div v-else class="paper">
      <header class="paper-head">
        <h1>灯光设计方案报告</h1>
        <p>代码工匠AI灯光设计 · {{ formatTime(item.createdAt) }}</p>
      </header>

      <section class="imgs">
        <figure>
          <img :src="item.sourceUrl" alt="原始照片" />
          <figcaption>原始照片</figcaption>
        </figure>
        <figure>
          <img :src="item.resultUrl" alt="灯光方案效果" />
          <figcaption>灯光方案效果图</figcaption>
        </figure>
      </section>

      <section class="spec">
        <h2>方案参数</h2>
        <table>
          <tr><th>氛围风格</th><td>{{ styleName(item.params.style) }}</td><th>光源方向</th><td>{{ dirName(item.params.direction) }}</td></tr>
          <tr><th>色温</th><td>{{ item.params.colorTemp || '-' }}K</td><th>亮度</th><td>{{ item.params.brightness ?? '-' }} / 100</td></tr>
          <tr><th>光影强度</th><td>{{ item.params.intensity ?? '-' }} / 100</td><th>明暗细节</th><td>{{ item.params.detail ?? '-' }} / 100</td></tr>
        </table>
      </section>

      <section class="spec">
        <h2>照明建议</h2>
        <p>{{ suggestion }}</p>
      </section>

      <footer class="paper-foot">本报告由 代码工匠AI灯光设计工具 自动生成，方案效果供参考，实际施工请结合现场照度计算。</footer>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { apiGenerateStatus } from '@/api'

const route = useRoute()
const item = ref(null)

const STYLE_NAMES = { night_warm: '夜景暖光', daylight: '日间自然光', office_cool: '办公冷光', wall_wash: '氛围洗墙光' }
const DIR_NAMES = { none: '环境光', left: '左侧', right: '右侧', top: '顶部', bottom: '底部' }
const styleName = k => STYLE_NAMES[k] || '自定义'
const dirName = k => DIR_NAMES[k] || '环境光'
const formatTime = ts => new Date(ts).toLocaleString('zh-CN')

const SUGGESTIONS = {
  night_warm: '建议主照明选用2700-3200K暖白光源，搭配台灯、落地灯等低位光源营造层次；显色指数建议Ra≥90，卧室及客厅休息区适用。',
  daylight: '建议选用5000-5600K中性至冷白光源，优先利用自然采光，人工光源做补充；适合书房、厨房等需要高辨识度的功能空间。',
  office_cool: '建议选用6000-6500K冷白光源并保证桌面照度≥300lx，均匀布灯避免眩光；适合办公、学习等长时间用眼场景。',
  wall_wash: '建议采用洗墙灯或轨道射灯，距墙0.8-1.2m均匀布置，光束角24°-36°；重点突出墙面材质与艺术品陈列。'
}
const suggestion = computed(() => SUGGESTIONS[item.value?.params?.style] || SUGGESTIONS.night_warm)

onMounted(async () => {
  item.value = await apiGenerateStatus(route.params.id)
})

const print = () => window.print()
</script>

<style scoped lang="scss">
.report { max-width: 900px; }
.toolbar { display: flex; justify-content: space-between; margin-bottom: 16px; }

.paper {
  background: #fff; color: #1f2330; border-radius: 8px; padding: 40px 48px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
}
.paper-head {
  text-align: center; border-bottom: 2px solid #7c6cff; padding-bottom: 14px; margin-bottom: 24px;
  h1 { margin: 0; font-size: 24px; letter-spacing: 2px; }
  p { margin: 6px 0 0; color: #888; font-size: 12px; }
}
.imgs {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  figure { margin: 0; img { width: 100%; border-radius: 6px; display: block; } figcaption { text-align: center; font-size: 12px; color: #888; margin-top: 6px; } }
}
.spec {
  margin-top: 24px;
  h2 { font-size: 15px; border-left: 4px solid #7c6cff; padding-left: 10px; margin: 0 0 12px; }
  p { font-size: 13px; line-height: 1.9; margin: 0; }
  table {
    width: 100%; border-collapse: collapse; font-size: 13px;
    th, td { border: 1px solid #e5e5ef; padding: 8px 12px; text-align: left; }
    th { background: #f5f5fb; width: 90px; font-weight: 600; }
  }
}
.paper-foot { margin-top: 28px; font-size: 11px; color: #aaa; text-align: center; }

@media print {
  .no-print { display: none !important; }
  .report { max-width: none; padding: 0; }
  .paper { box-shadow: none; padding: 0; }
}

@media (max-width: 640px) {
  .paper { padding: 24px 18px; }
  .imgs { grid-template-columns: 1fr; }
  .spec table th { width: 68px; }
}
</style>
