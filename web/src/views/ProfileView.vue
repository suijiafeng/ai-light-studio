<template>
  <div class="page-container profile">
    <div class="page-title"><el-icon class="mk-gradient-text"><User /></el-icon> 个人中心</div>

    <div class="grid">
      <div class="mk-card info">
        <el-avatar :size="64" class="avatar">{{ user?.nickname?.[0]?.toUpperCase() }}</el-avatar>
        <h3>{{ user?.nickname }} <el-tag v-if="userStore.isMember" type="warning" effect="dark" size="small" round>会员</el-tag></h3>
        <p class="text-secondary">{{ user?.email }}</p>
        <div class="stats">
          <div class="stat"><b class="mk-gradient-text">{{ userStore.credits }}</b><span class="text-secondary">剩余算力</span></div>
          <div class="stat">
            <b>{{ user?.memberExpiresAt && userStore.isMember ? formatDate(user.memberExpiresAt) : '未开通' }}</b>
            <span class="text-secondary">会员到期</span>
          </div>
        </div>
        <el-button class="mk-btn-gradient" round @click="$router.push('/recharge')">充值算力</el-button>
      </div>

      <div class="mk-card">
        <h4>修改昵称</h4>
        <el-form label-position="top">
          <el-form-item label="昵称">
            <el-input v-model="nickname" maxlength="30" placeholder="新昵称" />
          </el-form-item>
          <el-button type="primary" plain :loading="savingNick" @click="saveNickname">保存昵称</el-button>
        </el-form>

        <el-divider />

        <h4>修改密码</h4>
        <el-form label-position="top">
          <el-form-item label="原密码">
            <PasswordInput v-model="pwd.oldPassword" placeholder="原密码" />
          </el-form-item>
          <el-form-item label="新密码">
            <PasswordInput v-model="pwd.newPassword" placeholder="新密码（8-32位，含字母和数字）" />
          </el-form-item>
          <el-button type="primary" plain :loading="savingPwd" @click="savePassword">修改密码</el-button>
        </el-form>
      </div>

            <div class="mk-card">
        <h4><el-icon><Present /></el-icon> 邀请好友 · 双方各得10算力</h4>
        <p class="text-secondary small">好友通过你的邀请链接注册，你和好友各获得10算力奖励</p>
        <el-input :model-value="inviteLink" readonly>
          <template #append>
            <el-button @click="copyInvite">复制链接</el-button>
          </template>
        </el-input>
      </div>

            <div class="mk-card">
        <h4><el-icon><Key /></el-icon> 开放API密钥</h4>
        <p class="text-secondary small">第三方系统携带请求头 <code>X-API-Key</code> 即可调用生成接口，详见接口文档</p>
        <el-table :data="keys" size="small" empty-text="暂无密钥">
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="keyMasked" label="密钥" min-width="160" />
          <el-table-column label="创建时间" width="120">
            <template #default="{ row }">{{ new Date(row.createdAt).toLocaleDateString('zh-CN') }}</template>
          </el-table-column>
          <el-table-column width="80">
            <template #default="{ row }">
              <el-button size="small" text type="danger" @click="revokeKey(row)">吊销</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-button style="margin-top:10px" type="primary" plain size="small" @click="createKey">
          <el-icon><Plus /></el-icon>创建密钥
        </el-button>
      </div>

            <div class="mk-card danger-zone">
        <h4><el-icon><WarningFilled /></el-icon> 注销账号</h4>
        <p class="text-secondary small">注销后将永久删除账号及全部数据（照片、生成记录、算力、订单），不可恢复。剩余算力不予退还。</p>
        <el-button type="danger" plain size="small" @click="deleteAccount">申请注销账号</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { isValidPassword, PASSWORD_RULE_MSG } from '@/utils/password'
import PasswordInput from '@/components/PasswordInput.vue'
import { apiUpdateProfile, apiKeys, apiCreateKey, apiRevokeKey, apiDeleteAccount } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const user = computed(() => userStore.user)
const nickname = ref('')
const pwd = reactive({ oldPassword: '', newPassword: '' })
const savingNick = ref(false)
const savingPwd = ref(false)

const formatDate = ts => new Date(ts).toLocaleDateString('zh-CN')

const keys = ref([])
const inviteLink = computed(() =>
  user.value?.inviteCode ? `${location.origin}/login?invite=${user.value.inviteCode}` : '加载中…'
)

onMounted(async () => {
  await userStore.fetchMe()
  nickname.value = user.value?.nickname || ''
  loadKeys()
})

const loadKeys = async () => {
  try { keys.value = (await apiKeys()).list } catch (e) {  }
}

const copyInvite = async () => {
  await navigator.clipboard.writeText(inviteLink.value).catch(() => {})
  ElMessage.success('邀请链接已复制')
}

const createKey = async () => {
  try {
    const { value } = await ElMessageBox.prompt('给密钥起个名称（便于区分用途）', '创建API密钥', { inputValue: '默认密钥' })
    const { key } = await apiCreateKey(value)
    await ElMessageBox.alert(key, '密钥仅显示一次，请立即保存', { confirmButtonText: '已保存' })
    loadKeys()
  } catch (e) {
    if (e !== 'cancel' && e?.code !== -1 && e?.message) ElMessage.error(e.message)
  }
}

const router = useRouter()
const deleteAccount = async () => {
  try {
    await ElMessageBox.confirm('此操作将永久删除账号与全部数据，且不可恢复。确定继续？', '注销账号', {
      type: 'error', confirmButtonText: '继续注销', cancelButtonText: '取消'
    })
    const { value } = await ElMessageBox.prompt('请输入登录密码确认注销', '身份确认', { inputType: 'password' })
    await apiDeleteAccount(value)
    ElMessage.success('账号已注销')
    userStore.logout()
    router.push('/')
  } catch (e) {
    if (e !== 'cancel' && e?.message && e?.code !== -1) ElMessage.error(e.message)
  }
}

const revokeKey = async row => {
  try {
    await ElMessageBox.confirm('吊销后该密钥立即失效，确认？', '提示', { type: 'warning' })
    await apiRevokeKey(row.id)
    ElMessage.success('已吊销')
    loadKeys()
  } catch (e) {  }
}

const saveNickname = async () => {
  if (!nickname.value.trim()) return ElMessage.warning('请输入昵称')
  savingNick.value = true
  try {
    await apiUpdateProfile({ nickname: nickname.value.trim() })
    await userStore.fetchMe()
    ElMessage.success('昵称已更新')
  } catch (e) { if (e.code !== -1) ElMessage.error(e.message) }
  finally { savingNick.value = false }
}

const savePassword = async () => {
  if (!pwd.oldPassword || !pwd.newPassword) return ElMessage.warning('请填写完整')
  if (!isValidPassword(pwd.newPassword)) return ElMessage.warning(PASSWORD_RULE_MSG)
  savingPwd.value = true
  try {
    await apiUpdateProfile({ ...pwd })
    pwd.oldPassword = pwd.newPassword = ''
    ElMessage.success('密码已修改')
  } catch (e) { if (e.code !== -1) ElMessage.error(e.message) }
  finally { savingPwd.value = false }
}
</script>

<style scoped lang="scss">
.grid {
  display: grid; grid-template-columns: 320px 1fr; gap: 18px;
  @media (max-width: 860px) { grid-template-columns: 1fr; }
}
.info {
  text-align: center; padding: 34px 22px;
  .avatar { background: var(--mk-gradient); font-size: 26px; font-weight: 700; }
  h3 { margin: 14px 0 4px; }
  p { margin: 0 0 18px; font-size: 13px; }
  .stats {
    display: flex; justify-content: space-around; margin-bottom: 20px;
    .stat { display: flex; flex-direction: column; gap: 4px; b { font-size: 20px; } span { font-size: 12px; } }
  }
}
h4 { margin: 4px 0 14px; display: flex; align-items: center; gap: 6px; }
.small { font-size: 12px; margin: -6px 0 12px; }
.danger-zone h4 .el-icon { color: #f56c6c; }
</style>
