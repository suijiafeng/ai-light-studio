<template>
  <div class="page-container">
    <div class="page-title"><el-icon class="mk-gradient-text"><DataAnalysis /></el-icon> 管理后台</div>

    <el-alert v-if="forbidden" type="warning" show-icon :closable="false" title="权限不足：仅管理员可访问" />

    <el-tabs v-else v-model="tab">
      <el-tab-pane label="数据总览" name="overview">
    <template v-if="data">
      <div class="cards">
        <div class="mk-card stat">
          <div class="label text-secondary">总用户 / 今日新增</div>
          <div class="value">{{ data.users.total }} <small>/ +{{ data.users.today }}</small></div>
          <div class="sub text-secondary">会员数 {{ data.users.members }}</div>
        </div>
        <div class="mk-card stat">
          <div class="label text-secondary">总生成 / 今日</div>
          <div class="value">{{ data.generations.total }} <small>/ +{{ data.generations.today }}</small></div>
          <div class="sub text-secondary">成功 {{ data.generations.success }} · 失败 {{ data.generations.failed }}</div>
        </div>
        <div class="mk-card stat">
          <div class="label text-secondary">算力消耗 / 今日</div>
          <div class="value">{{ data.credits.consumed }} <small>/ {{ data.credits.consumedToday }}</small></div>
          <div class="sub text-secondary">累计充值到账 {{ data.credits.recharged }}</div>
        </div>
        <div class="mk-card stat">
          <div class="label text-secondary">总营收 / 今日</div>
          <div class="value">¥{{ (data.revenue.total / 100).toFixed(2) }} <small>/ ¥{{ (data.revenue.today / 100).toFixed(2) }}</small></div>
          <div class="sub text-secondary">成交订单 {{ data.revenue.orders }} 笔</div>
        </div>
      </div>

      <div class="mk-card trend">
        <h4>近7天趋势</h4>
        <el-table :data="data.trend" size="small">
          <el-table-column prop="date" label="日期" />
          <el-table-column prop="generations" label="生成次数" />
          <el-table-column prop="newUsers" label="新增用户" />
        </el-table>
      </div>
    </template>
    <el-skeleton v-else :rows="6" animated />
      </el-tab-pane>

      <!-- 用户管理 -->
      <el-tab-pane label="用户管理" name="users">
        <div class="mk-card">
          <div class="search-row">
            <el-input v-model="keyword" placeholder="搜索邮箱/昵称" clearable style="width:260px" @keyup.enter="loadUsers" />
            <el-button type="primary" plain @click="loadUsers">搜索</el-button>
          </div>
          <el-table :data="users" v-loading="loadingUsers" size="small">
            <el-table-column prop="email" label="邮箱" min-width="180" />
            <el-table-column prop="nickname" label="昵称" width="110" />
            <el-table-column prop="credits" label="算力" width="80" />
            <el-table-column label="身份" width="110">
              <template #default="{ row }">
                <el-tag v-if="row.role === 'admin'" size="small" type="danger">管理员</el-tag>
                <el-tag v-else-if="row.isMember" size="small" type="warning">会员</el-tag>
                <el-tag v-else size="small" type="info">普通</el-tag>
                <el-tag v-if="row.banned" size="small" type="danger" style="margin-left:4px">封禁</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="注册时间" width="120">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleDateString('zh-CN') }}</template>
            </el-table-column>
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="adjust(row)">调整算力</el-button>
                <el-button v-if="row.role !== 'admin'" size="small" text :type="row.banned ? 'success' : 'danger'" @click="toggleBan(row)">
                  {{ row.banned ? '解封' : '封禁' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager" v-if="userTotal > 15">
            <el-pagination v-model:current-page="userPage" :page-size="15" :total="userTotal" layout="prev, pager, next" background @current-change="loadUsers" />
          </div>
        </div>
      </el-tab-pane>

      <!-- 订单退款 -->
      <el-tab-pane label="订单退款" name="refund">
        <div class="mk-card">
          <p class="text-secondary" style="font-size:13px">输入订单号原路退款：订单置为已退款、扣回对应算力、回收会员时长。用户余额不足以扣回时会被拒绝。</p>
          <div class="search-row">
            <el-input v-model="refundOrderId" placeholder="订单号（O开头）" style="width:280px" />
            <el-input v-model="refundReason" placeholder="退款原因（选填）" style="width:220px" />
            <el-button type="danger" plain :loading="refunding" @click="doRefund">执行退款</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 错误日志 -->
      <el-tab-pane label="错误日志" name="errors">
        <div class="mk-card">
          <el-table :data="errors" size="small" empty-text="暂无错误记录，运行良好">
            <el-table-column label="来源" width="70">
              <template #default="{ row }">
                <el-tag size="small" :type="row.source === 'server' ? 'danger' : 'warning'">{{ row.source === 'server' ? '后端' : '前端' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="message" label="错误信息" min-width="240" show-overflow-tooltip />
            <el-table-column prop="url" label="位置" min-width="160" show-overflow-tooltip />
            <el-table-column label="时间" width="150">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 内容抽查 -->
      <el-tab-pane label="内容抽查" name="content">
        <div class="mk-card">
          <div class="gen-grid">
            <div v-for="g in gens" :key="g.id" class="gen-cell">
              <el-image :src="g.resultUrl || g.sourceUrl" fit="cover" class="gen-img" :preview-src-list="[g.resultUrl || g.sourceUrl]" />
              <div class="gen-meta text-secondary">{{ g.email }}<br />{{ new Date(g.createdAt).toLocaleString('zh-CN') }}</div>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiStatsOverview, apiAdminUsers, apiAdminAdjustCredits, apiAdminBan, apiAdminGenerations, apiAdminErrors, apiAdminRefund } from '@/api'

const data = ref(null)
const forbidden = ref(false)
const tab = ref('overview')

const users = ref([]); const userTotal = ref(0); const userPage = ref(1); const keyword = ref(''); const loadingUsers = ref(false)
const gens = ref([])
const errors = ref([])
const refundOrderId = ref(''); const refundReason = ref(''); const refunding = ref(false)

onMounted(async () => {
  try {
    data.value = await apiStatsOverview()
    loadUsers()
    gens.value = (await apiAdminGenerations()).list
    errors.value = (await apiAdminErrors()).list
  } catch (e) {
    if (e.code === 403) forbidden.value = true
    else if (e.code !== -1) ElMessage.error(e.message)
  }
})

const doRefund = async () => {
  if (!refundOrderId.value.trim()) return ElMessage.warning('请输入订单号')
  try {
    await ElMessageBox.confirm(`确认对订单 ${refundOrderId.value} 原路退款并扣回算力？`, '退款确认', { type: 'warning' })
    refunding.value = true
    await apiAdminRefund(refundOrderId.value.trim(), refundReason.value.trim())
    ElMessage.success('退款成功')
    refundOrderId.value = refundReason.value = ''
  } catch (e) {
    if (e !== 'cancel' && e?.message && e?.code !== -1) ElMessage.error(e.message)
  } finally {
    refunding.value = false
  }
}

const loadUsers = async () => {
  loadingUsers.value = true
  try {
    const d = await apiAdminUsers({ page: userPage.value, size: 15, keyword: keyword.value })
    users.value = d.list; userTotal.value = d.total
  } catch (e) { if (e.code !== -1 && e.code !== 403) ElMessage.error(e.message) }
  finally { loadingUsers.value = false }
}

const adjust = async row => {
  try {
    const { value } = await ElMessageBox.prompt(`当前余额 ${row.credits}，输入调整值（正加负减）`, `调整算力 · ${row.email}`, {
      inputPattern: /^-?\d+$/, inputErrorMessage: '请输入整数'
    })
    await apiAdminAdjustCredits(row.id, { change: Number(value), remark: '管理员手动调整' })
    ElMessage.success('已调整')
    loadUsers()
  } catch (e) {
    if (e !== 'cancel' && e?.message && e?.code !== -1) ElMessage.error(e.message)
  }
}

const toggleBan = async row => {
  try {
    await ElMessageBox.confirm(`确认${row.banned ? '解封' : '封禁'} ${row.email}？`, '提示', { type: 'warning' })
    await apiAdminBan(row.id, !row.banned)
    ElMessage.success('操作成功')
    loadUsers()
  } catch (e) { /* cancel */ }
}
</script>

<style scoped lang="scss">
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}
.stat {
  .label { font-size: 13px; }
  .value { font-size: 26px; font-weight: 800; margin: 8px 0 4px; small { font-size: 14px; color: var(--mk-primary); } }
  .sub { font-size: 12px; }
}
.trend h4 { margin: 0 0 12px; }
.search-row { display: flex; gap: 10px; margin-bottom: 14px; }
.pager { display: flex; justify-content: center; margin-top: 14px; }
.gen-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.gen-cell {
  .gen-img { width: 100%; height: 110px; border-radius: 8px; overflow: hidden; display: block; }
  .gen-meta { font-size: 11px; margin-top: 4px; line-height: 1.5; word-break: break-all; }
}
</style>
