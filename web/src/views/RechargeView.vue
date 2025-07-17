<template>
  <div class="page-container">
    <div class="page-title"><el-icon class="mk-gradient-text"><Wallet /></el-icon> 充值中心
      <span class="text-secondary balance">当前余额：<b>{{ userStore.credits }}</b> 算力</span>
    </div>

    <div class="section-title">算力充值包</div>
    <div class="pkg-grid">
      <div
        v-for="p in creditPackages" :key="p.id"
        class="mk-card hoverable pkg"
        :class="{ active: selected === p.id }"
        @click="selected = p.id"
      >
        <div class="pkg-title ellipsis">{{ p.title }}</div>
        <div class="pkg-price">¥<b>{{ p.priceYuan }}</b></div>
        <div class="pkg-credits mk-gradient-text ellipsis">{{ p.credits }} 算力</div>
        <div class="text-secondary pkg-desc clamp-2">{{ p.desc }}</div>
      </div>
    </div>

    <div class="section-title">会员套餐</div>
    <div class="pkg-grid">
      <div
        v-for="p in memberPackages" :key="p.id"
        class="mk-card hoverable pkg member"
        :class="{ active: selected === p.id }"
        @click="selected = p.id"
      >
        <el-tag type="warning" effect="dark" size="small" round class="member-tag">VIP</el-tag>
        <div class="pkg-title ellipsis">{{ p.title }}</div>
        <div class="pkg-price">¥<b>{{ p.priceYuan }}</b></div>
        <div class="pkg-credits mk-gradient-text ellipsis">{{ p.credits }} 算力</div>
        <div class="text-secondary pkg-desc clamp-2">{{ p.desc }}</div>
      </div>
    </div>

    <div class="pay-bar">
      <el-button size="large" class="mk-btn-gradient pay-btn" :disabled="!selected" :loading="creating" @click="createOrder">
        <el-icon><ShoppingCart /></el-icon>&nbsp;微信扫码支付
      </el-button>
    </div>

    <!-- 支付二维码弹窗 -->
    <el-dialog v-model="payVisible" title="微信扫码支付" width="380px" :close-on-click-modal="false" @closed="stopPoll">
      <div class="pay-dialog">
        <img v-if="qrDataUrl" :src="qrDataUrl" class="qr" alt="支付二维码" />
        <p class="amount">¥ {{ payingOrder?.amountYuan }}</p>
        <p class="text-secondary">请使用微信扫一扫完成支付</p>
        <el-tag v-if="isMock" type="warning" effect="plain" round>当前为沙箱模拟支付模式</el-tag>
        <el-button v-if="isMock" type="success" round class="mock-btn" :loading="mockPaying" @click="mockPay">
          模拟支付成功（沙箱）
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import QRCode from 'qrcode'
import { apiPackages, apiCreateOrder, apiOrderStatus, apiMockPay } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const packages = ref([])
const selected = ref('')
const creating = ref(false)
const payVisible = ref(false)
const payingOrder = ref(null)
const qrDataUrl = ref('')
const isMock = ref(false)
const mockPaying = ref(false)
let pollTimer = null

const creditPackages = computed(() => packages.value.filter(p => p.type === 'credits'))
const memberPackages = computed(() => packages.value.filter(p => p.type === 'member'))

onMounted(async () => {
  try {
    const data = await apiPackages()
    packages.value = data.packages
  } catch (e) { if (e.code !== -1) ElMessage.error(e.message) }
  userStore.fetchMe()
})
onBeforeUnmount(() => stopPoll())

const stopPoll = () => { clearInterval(pollTimer); pollTimer = null }

const createOrder = async () => {
  creating.value = true
  try {
    const { orderId, codeUrl, mock } = await apiCreateOrder(selected.value)
    const order = await apiOrderStatus(orderId)
    payingOrder.value = order
    isMock.value = !!mock
    qrDataUrl.value = await QRCode.toDataURL(codeUrl, { width: 220, margin: 1 })
    payVisible.value = true
    // 轮询订单状态
    pollTimer = setInterval(async () => {
      try {
        const o = await apiOrderStatus(orderId)
        if (o.status === 'paid') {
          stopPoll()
          payVisible.value = false
          ElMessage.success(`支付成功，${o.credits}算力已到账！`)
          userStore.fetchMe()
        }
      } catch (e) { /* 忽略单次轮询失败 */ }
    }, 2000)
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    creating.value = false
  }
}

const mockPay = async () => {
  mockPaying.value = true
  try {
    await apiMockPay(payingOrder.value.id)
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    mockPaying.value = false
  }
}
</script>

<style scoped lang="scss">
.balance { font-size: 14px; font-weight: 400; margin-left: 10px; b { color: var(--mk-primary); } }
.section-title { font-size: 15px; font-weight: 700; margin: 22px 0 12px; }

.pkg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.pkg {
  text-align: center; cursor: pointer; position: relative; padding: 24px 16px;
  &.active { border-color: var(--mk-primary); box-shadow: 0 0 0 2px rgba(124, 108, 255, 0.35); }
  .pkg-title { font-weight: 700; font-size: 15px; }
  .pkg-price { margin: 10px 0 2px; b { font-size: 28px; } }
  .pkg-credits { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
  .pkg-desc { font-size: 12px; line-height: 1.6; min-height: 38px; }
  .member-tag { position: absolute; top: 10px; right: 10px; }
}
.pay-bar { display: flex; justify-content: center; margin-top: 30px; .pay-btn { min-width: 260px; } }

.pay-dialog {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  .qr { width: 220px; height: 220px; border-radius: 10px; background: #fff; }
  .amount { font-size: 24px; font-weight: 800; margin: 6px 0 0; color: var(--mk-primary); }
  .mock-btn { margin-top: 10px; }
  p { margin: 2px 0; }
}
</style>
