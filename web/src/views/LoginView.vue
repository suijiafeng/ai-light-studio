<template>
  <div class="login-page">
    <div class="mk-card login-card">
      <h2 class="mk-gradient-text">{{ isRegister ? '注册账号' : '欢迎回来' }}</h2>
      <p class="text-secondary sub">{{ isRegister ? '注册即送免费算力，立即体验AI灯光设计' : '登录后开始你的灯光设计之旅' }}</p>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large" @keyup.enter="submit">
        <el-form-item v-if="isRegister" label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="你的昵称（选填）" :prefix-icon="User" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="请输入邮箱" :prefix-icon="Message" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="至少6位密码" :prefix-icon="Lock" />
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
          <el-input v-model="reset.email" placeholder="注册邮箱" :prefix-icon="Message" />
        </el-form-item>
        <el-form-item label="验证码">
          <div class="code-row">
            <el-input v-model="reset.code" placeholder="6位验证码" />
            <el-button :disabled="countdown > 0" :loading="sendingCode" @click="sendResetCode">
              {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="reset.newPassword" type="password" show-password placeholder="新密码（至少6位）" :prefix-icon="Lock" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button class="mk-btn-gradient" :loading="resetting" @click="doReset">重置密码</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Message, Lock } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { apiSendCode, apiResetPassword } from '@/api'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const isRegister = ref(!!route.query.invite) // 带邀请码进入默认展示注册
const loading = ref(false)
const formRef = ref()
const form = reactive({ email: '', password: '', nickname: '' })

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
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
  if (reset.newPassword.length < 6) return ElMessage.warning('新密码至少6位')
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
const openLegal = tab => window.open(`/legal?tab=${tab}`, '_blank')

const submit = async () => {
  await formRef.value.validate()
  if (isRegister.value && !agreed.value) return ElMessage.warning('请先阅读并勾选同意用户协议与隐私政策')
  loading.value = true
  try {
    if (isRegister.value) {
      await userStore.register({ ...form, inviteCode: route.query.invite || undefined })
      ElMessage.success('注册成功，已赠送免费算力！')
    } else {
      await userStore.login(form)
      ElMessage.success('登录成功')
    }
    router.push(route.query.redirect || '/studio')
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
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
.login-card {
  width: 400px; padding: 36px 32px;
  h2 { margin: 0 0 6px; font-size: 24px; }
  .sub { font-size: 13px; margin: 0 0 24px; }
  .submit { width: 100%; margin-top: 6px; }
  .agree { margin-bottom: 10px; :deep(.el-checkbox__label) { font-size: 12px; } }
  .switch { text-align: center; margin-top: 18px; font-size: 13px; .forgot { margin-left: 12px; } }
}
</style>
