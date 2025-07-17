<template>
  <div class="home">
    <section class="hero">
      <h1>AI一键重绘<span class="mk-gradient-text">空间灯光效果</span></h1>
      <p class="text-secondary">
        上传室内实景照片，智能生成夜景暖光、日间自然光、办公冷光、氛围洗墙光等多种灯光氛围方案。<br />
        告别效果图周期长、成本高、不可预览的痛点。
      </p>
      <div class="hero-actions">
        <el-button size="large" class="mk-btn-gradient" round @click="go">
          <el-icon><MagicStick /></el-icon>&nbsp;立即开始设计
        </el-button>
        <el-button size="large" round plain @click="$router.push('/recharge')">查看套餐价格</el-button>
      </div>
      <div class="hero-tip text-secondary">
        <el-icon><Present /></el-icon>&nbsp;新用户注册即送免费算力，无需付费即可体验
      </div>
    </section>

    <section class="page-container">
      <h2 class="sec-title">灯光方案模板 · 点击即用同款参数</h2>
      <div class="tpl-grid">
        <div v-for="t in templates" :key="t.name" class="mk-card hoverable tpl" @click="useTemplate(t)">
          <div class="tpl-preview" :style="{ background: t.bg }">
            <el-icon :size="26"><component :is="t.icon" /></el-icon>
          </div>
          <h3 class="ellipsis">{{ t.name }}</h3>
          <p class="text-secondary clamp-2">{{ t.desc }}</p>
          <el-tag size="small" effect="plain" round>{{ t.params.colorTemp }}K · {{ t.tag }}</el-tag>
        </div>
      </div>
    </section>

    <section class="features page-container">
      <div v-for="f in features" :key="f.title" class="mk-card hoverable feature">
        <el-icon :size="30" class="feature-icon"><component :is="f.icon" /></el-icon>
        <h3>{{ f.title }}</h3>
        <p class="text-secondary">{{ f.desc }}</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const go = () => router.push(userStore.isLogin ? '/studio' : '/login')

const templates = [
  { name: '客厅暖夜', icon: 'Moon', tag: '夜景暖光', desc: '温馨居家夜晚氛围，适合客厅、卧室', bg: 'linear-gradient(135deg,#f6b26b,#e06666)', params: { style: 'night_warm', colorTemp: 3000, brightness: 62, intensity: 60, detail: 55, direction: 'top' } },
  { name: '通透日光', icon: 'Sunny', tag: '日间自然光', desc: '明亮通透的白天效果，适合样板间展示', bg: 'linear-gradient(135deg,#6fa8dc,#93c47d)', params: { style: 'daylight', colorTemp: 5600, brightness: 70, intensity: 45, detail: 50, direction: 'none' } },
  { name: '高效办公', icon: 'OfficeBuilding', tag: '办公冷光', desc: '均匀明亮的冷白光，适合办公学习空间', bg: 'linear-gradient(135deg,#76a5f5,#8ed1fc)', params: { style: 'office_cool', colorTemp: 6500, brightness: 65, intensity: 40, detail: 60, direction: 'top' } },
  { name: '艺术洗墙', icon: 'Brush', tag: '氛围洗墙光', desc: '突出墙面质感与陈列，适合展厅背景墙', bg: 'linear-gradient(135deg,#b28df7,#f78db2)', params: { style: 'wall_wash', colorTemp: 3500, brightness: 52, intensity: 72, detail: 62, direction: 'left' } },
  { name: '餐厅微醺', icon: 'Coffee', tag: '夜景暖光', desc: '低亮度高氛围，适合餐厅、酒吧', bg: 'linear-gradient(135deg,#e69138,#a64d79)', params: { style: 'night_warm', colorTemp: 2800, brightness: 45, intensity: 70, detail: 50, direction: 'bottom' } },
  { name: '民宿清晨', icon: 'Cloudy', tag: '日间自然光', desc: '柔和自然光感，适合民宿房源照片', bg: 'linear-gradient(135deg,#9fc5e8,#ffe599)', params: { style: 'daylight', colorTemp: 5000, brightness: 58, intensity: 38, detail: 45, direction: 'right' } }
]

// 未登录时路由守卫会自动带着完整参数跳登录页，登录后原样回到工作台
const useTemplate = t => router.push({ path: '/studio', query: { ...t.params } })

const features = [
  { icon: 'MagicStick', title: 'AI灯光重绘', desc: '基于IC-Light模型，秒级生成真实感灯光效果，支持亮度、色温、光影强度精细调节。' },
  { icon: 'Brush', title: '多种氛围风格', desc: '夜景暖光 / 日间自然光 / 办公冷光 / 氛围洗墙光，一张照片生成多套方案。' },
  { icon: 'PictureRounded', title: '历史素材管理', desc: '生成记录自动留存，随时下载、重新生成、再次编辑，素材永不丢失。' },
  { icon: 'Wallet', title: '灵活计费', desc: '免费额度 + 按次计费 + 会员订阅，按需付费，微信扫码即充即用。' }
]
</script>

<style scoped lang="scss">
.hero {
  text-align: center;
  padding: 90px 20px 50px;
  h1 { font-size: 42px; margin: 0 0 18px; letter-spacing: 1px; }
  p { font-size: 16px; line-height: 1.9; margin: 0 0 30px; }
  .hero-actions { display: flex; gap: 14px; justify-content: center; }
  .hero-tip { margin-top: 22px; font-size: 13px; display: flex; align-items: center; justify-content: center; }
}
.sec-title { font-size: 18px; text-align: center; margin: 6px 0 20px; }
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 30px;
  .tpl {
    text-align: center; cursor: pointer; padding: 18px 14px;
    .tpl-preview {
      height: 76px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
      color: #fff; margin-bottom: 12px;
    }
    h3 { margin: 0 0 4px; font-size: 15px; }
    p { font-size: 12px; margin: 0 0 8px; line-height: 1.6; }
  }
}
.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 18px;
  .feature {
    text-align: center;
    padding: 30px 22px;
    .feature-icon { color: var(--mk-primary); }
    h3 { margin: 14px 0 8px; font-size: 16px; }
    p { font-size: 13px; line-height: 1.8; margin: 0; }
  }
}
</style>
