<template>
  <div class="login-page">
    <div class="mk-card login-card" :class="{ shake }">
      <h2 class="mk-gradient-text">{{ isRegister ? '注册账号' : '欢迎回来' }}</h2>
      <p class="text-secondary sub">{{ isRegister ? '注册即送免费算力，立即体验AI灯光设计' : '登录后开始你的灯光设计之旅' }}</p>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large" @keyup.enter="submit">
        <el-form-item v-if="isRegister" label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="你的昵称（选填）" maxlength="30" :prefix-icon="User" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="请输入邮箱" maxlength="60" :prefix-icon="Message" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" :type="showPwd ? 'text' : 'password'" placeholder="8-32位，含字母和数字" maxlength="32" :prefix-icon="Lock">
            <template #suffix>
              <el-icon
                class="eye"
                @mousedown.prevent="showPwd = true"
                @mouseup="showPwd = false"
                @mouseleave="showPwd = false"
                @touchstart.prevent="showPwd = true"
                @touchend="showPwd = false"
              ><View v-if="showPwd" /><Hide v-else /></el-icon>
            </template>
          </el-input>
          <div v-if="isRegister && form.password" class="pwd-meter">
            <div class="pm-track"><div class="pm-bar" :style="{ width: strength.percent + '%', background: strength.color }"></div></div>
            <span class="pm-label" :style="{ color: strength.color }">{{ strength.label }}</span>
          </div>
        </el-form-item>
        <el-form-item v-if="isRegister" label="确认密码" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" :type="showPwd2 ? 'text' : 'password'" placeholder="再次输入密码" maxlength="32" :prefix-icon="Lock">
            <template #suffix>
              <el-icon
                class="eye"
                @mousedown.prevent="showPwd2 = true"
                @mouseup="showPwd2 = false"
                @mouseleave="showPwd2 = false"
                @touchstart.prevent="showPwd2 = true"
                @touchend="showPwd2 = false"
              ><View v-if="showPwd2" /><Hide v-else /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item v-if="isRegister && needCode" label="邮箱验证码">
          <div class="code-row">
            <el-input v-model="form.code" placeholder="6位验证码" maxlength="6" />
            <el-button :disabled="regCountdown > 0" :loading="sendingRegCode" @click="sendRegCode">
              {{ regCountdown > 0 ? `${regCountdown}s` : '获取验证码' }}
            </el-button>
          </div>
        </el-form-item>
        <el-checkbox v-if="isRegister" v-model="agreed" class="agree">
          我已阅读并同意
          <el-link type="primary" @click.stop="openLegal('terms')">《用户协议》</el-link>和
          <el-link type="primary" @click.stop="openLegal('privacy')">《隐私政策》</el-link>
        </el-checkbox>
        <el-button class="mk-btn-gradient submit" size="large" :loading="loading" @click="submit">
          {{ isRegister ? '注 册' : '登 录' }}
        </el-button>
      </el-form>

      <div class="switch text-secondary">
        {{ isRegister ? '已有账号？' : '还没有账号？' }}
        <el-link type="primary" @click="isRegister = !isRegister">{{ isRegister ? '去登录' : '免费注册' }}</el-link>
        <el-link v-if="!isRegister" class="forgot" @click="resetVisible = true">忘记密码？</el-link>
      </div>
    </div>

    <!-- 找回密码弹窗 -->
    <el-dialog v-model="resetVisible" title="找回密码" width="380px">
      <el-form label-position="top" size="large">
        <el-form-item label="邮箱">
          <el-input v-model="reset.email" placeholder="注册邮箱" maxlength="60" :prefix-icon="Message" />
        </el-form-item>
        <el-form-item label="验证码">
          <div class="code-row">
            <el-input v-model="reset.code" placeholder="6位验证码" maxlength="6" />
            <el-button :disabled="countdown > 0" :loading="sendingCode" @click="sendResetCode">
              {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="reset.newPassword" type="password" show-password placeholder="新密码（8-32位，含字母和数字）" maxlength="32" :prefix-icon="Lock" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button class="mk-btn-gradient" :loading="resetting" @click="doReset">重置密码</el-button>
      </template>
    </el-dialog>

    <!-- 用户协议 / 隐私政策 弹窗（长文可滚动） -->
    <el-dialog v-model="legalVisible" title="协议与隐私" width="640px" class="legal-dialog">
      <div class="legal-scroll">
        <LegalDocs :initial-tab="legalTab" require-confirm @confirm-change="v => legalConfirm = v" />
      </div>
      <template #footer>
        <el-button
          type="primary" class="mk-btn-gradient"
          :disabled="!(legalConfirm.terms && legalConfirm.privacy)"
          @click="agreed = true; legalVisible = false"
        >我已阅读并同意</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Message, Lock, View, Hide } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import LegalDocs from '@/components/LegalDocs.vue'
import { isValidPassword, passwordStrength, PASSWORD_RULE_MSG } from '@/utils/password'
import { apiSendCode, apiResetPassword, apiRegister } from '@/api'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const isRegister = ref(!!route.query.invite) // 带邀请码进入默认展示注册
const shake = ref(false)
let shakeTimer = null

// 未登录访问受保护页被重定向过来：提示 + 面板抖动
// 用 watch 而非 onMounted：已停留在登录页时再点其他受保护菜单也会触发
const triggerShake = () => {
  // ElMessage.warning('请先登录后再访问')
  // 先移除类再加回，保证连续触发时动画能重新播放
  shake.value = false
  clearTimeout(shakeTimer)
  requestAnimationFrame(() => {
    shake.value = true
    shakeTimer = setTimeout(() => { shake.value = false }, 700)
  })
}

watch(() => route.fullPath, () => {
  if (route.path === '/login'){ triggerShake()}
}, { immediate: true })

const loading = ref(false)
const formRef = ref()
const form = reactive({ email: '', password: '', nickname: '', confirmPassword: '', code: '' })
const showPwd = ref(false)
const strength = computed(() => passwordStrength(form.password))
const showPwd2 = ref(false)

// 注册邮箱验证码（管理员邮箱或 EMAIL_VERIFY=on 时后端要求）
const needCode = ref(false)
const sendingRegCode = ref(false)
const regCountdown = ref(0)
let regCdTimer = null

const sendRegCode = async () => {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return ElMessage.warning('请先输入正确的邮箱')
  sendingRegCode.value = true
  try {
    const data = await apiSendCode({ email: form.email, purpose: 'register' })
    if (data.devCode) {
      form.code = data.devCode
      ElMessage.info(`开发模式：验证码已自动填入（${data.devCode}）`)
    } else {
      ElMessage.success('验证码已发送，请查收邮箱')
    }
    regCountdown.value = 60
    regCdTimer = setInterval(() => { if (--regCountdown.value <= 0) clearInterval(regCdTimer) }, 1000)
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    sendingRegCode.value = false
  }
}

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { validator: (rule, value, cb) => {
        if (!isRegister.value) return cb() // 登录不做强度校验
        if (!isValidPassword(value)) return cb(new Error(PASSWORD_RULE_MSG))
        cb()
      }, trigger: 'blur' }
  ],
  confirmPassword: [
    { validator: (rule, value, cb) => {
        if (!isRegister.value) return cb()
        if (!value) return cb(new Error('请再次输入密码'))
        if (value !== form.password) return cb(new Error('两次输入的密码不一致'))
        cb()
      }, trigger: 'blur' }
  ]
}

// ---------- 找回密码 ----------
const resetVisible = ref(false)
const reset = reactive({ email: '', code: '', newPassword: '' })
const sendingCode = ref(false)
const resetting = ref(false)
const countdown = ref(0)
let cdTimer = null

const sendResetCode = async () => {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(reset.email)) return ElMessage.warning('请输入正确的邮箱')
  sendingCode.value = true
  try {
    const data = await apiSendCode({ email: reset.email, purpose: 'reset' })
    if (data.devCode) {
      reset.code = data.devCode
      ElMessage.info(`开发模式：验证码已自动填入（${data.devCode}）`)
    } else {
      ElMessage.success('验证码已发送，请查收邮箱')
    }
    countdown.value = 60
    cdTimer = setInterval(() => { if (--countdown.value <= 0) clearInterval(cdTimer) }, 1000)
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    sendingCode.value = false
  }
}

const doReset = async () => {
  if (!reset.email || !reset.code || !reset.newPassword) return ElMessage.warning('请填写完整')
  if (!isValidPassword(reset.newPassword)) return ElMessage.warning(PASSWORD_RULE_MSG)
  resetting.value = true
  try {
    await apiResetPassword({ ...reset })
    ElMessage.success('密码已重置，请登录')
    resetVisible.value = false
    form.email = reset.email
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    resetting.value = false
  }
}

const agreed = ref(false)
const legalVisible = ref(false)
const legalTab = ref('terms')
const legalConfirm = ref({ terms: false, privacy: false })
const openLegal = tab => { legalTab.value = tab; legalVisible.value = true }

const submit = async () => {
  await formRef.value.validate()
  if (isRegister.value && !agreed.value) return ElMessage.warning('请先阅读并勾选同意用户协议与隐私政策')
  // 需验证码但未填：提示先获取
  if (isRegister.value && needCode.value && !form.code) {
    return ElMessage.warning('该邮箱需邮箱验证码，请点击“获取验证码”')
  }
  loading.value = true
  try {
    if (isRegister.value) {
      await apiRegister({ ...form, inviteCode: route.query.invite || undefined })
      ElMessage.success('注册成功，已赠送免费算力，请登录')
      // 切换到登录并预填邮箱，密码留给用户自行输入
      isRegister.value = false
      form.password = ''
      form.confirmPassword = ''
      form.code = ''
      needCode.value = false
      agreed.value = false
      return
    } else {
      await userStore.login(form)
      ElMessage.success('登录成功')
    }
    router.push(route.query.redirect || '/studio')
  } catch (e) {
    // 后端要求邮箱验证码：自动展开验证码输入并引导获取
    if (isRegister.value && /验证码/.test(e.message || '') && !needCode.value) {
      needCode.value = true
      ElMessage.info('该邮箱为管理员/受保护邮箱，请获取邮箱验证码后完成注册')
    } else if (e.code !== -1) {
      ElMessage.error(e.message)
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: calc(100vh - 60px);
  display: flex; align-items: center; justify-content: center;
  padding: 30px 16px;
}
.code-row { display: flex; gap: 8px; width: 100%; .el-input { flex: 1; } }
.eye { cursor: pointer; user-select: none; &:hover { color: var(--mk-primary); } }
.pwd-meter {
  display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 6px;
  .pm-track { flex: 1; height: 5px; border-radius: 3px; background: var(--mk-border); overflow: hidden; }
  .pm-bar { height: 100%; border-radius: 3px; transition: width 0.25s ease; }
  .pm-label { font-size: 12px; width: 28px; flex-shrink: 0; }
}
@keyframes login-shake {
  0%, 100% { transform: translateX(0); }
  15%, 45%, 75% { transform: translateX(-8px); }
  30%, 60%, 90% { transform: translateX(8px); }
}
.login-card.shake { animation: login-shake 0.6s ease; }
.legal-scroll {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}
.login-card {
  width: 400px; padding: 36px 32px;
  h2 { margin: 0 0 6px; font-size: 24px; }
  .sub { font-size: 13px; margin: 0 0 24px; }
  .submit { width: 100%; margin-top: 6px; }
  .agree { margin-bottom: 10px; :deep(.el-checkbox__label) { font-size: 12px; } }
  .switch { text-align: center; margin-top: 18px; font-size: 13px; .forgot { margin-left: 12px; } }
}
</style>
