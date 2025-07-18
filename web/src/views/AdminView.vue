<template>
  <div class="page-container">
    <div class="page-title"><el-icon class="mk-gradient-text"><DataAnalysis /></el-icon> 管理后台</div>

    <el-alert v-if="forbidden" type="warning" show-icon :closable="false" title="权限不足：仅管理员可访问" />

    <el-tabs v-else v-model="tab">
      <el-tab-pane label="数据总览" name="overview">
        <!-- AI出图模式切换：运行时生效，无需重启 -->
        <div class="mk-card mode-card">
          <span class="mode-label">AI出图模式</span>
          <el-radio-group :model-value="aiMode" @change="switchAiMode">
            <el-radio-button value="mock">演示模式（本地模拟）</el-radio-button>
            <el-radio-button value="fal" :disabled="!aiAvailable.fal">真实出图 · fal</el-radio-button>
            <el-radio-button value="replicate" :disabled="!aiAvailable.replicate">Replicate</el-radio-button>
          </el-radio-group>
          <span class="text-secondary mode-tip">
            {{ aiMode === 'mock' ? '不消耗API额度，适合演示与联调' : '每次生成消耗平台额度' }}
            <template v-if="!aiAvailable.fal">（fal未配置密钥）</template>
          </span>
        </div>
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

      <div v-if="data.funnel" class="mk-card funnel">
        <h4>转化漏斗</h4>
        <div class="funnel-row">
          <div class="funnel-step">
            <div class="fv">{{ data.funnel.registered }}</div>
            <div class="fl text-secondary">注册用户</div>
          </div>
          <div class="funnel-arrow text-secondary">→ {{ data.funnel.generatedRate }}%</div>
          <div class="funnel-step">
            <div class="fv">{{ data.funnel.generated }}</div>
            <div class="fl text-secondary">出过图</div>
          </div>
          <div class="funnel-arrow text-secondary">→</div>
          <div class="funnel-step">
            <div class="fv">{{ data.funnel.exhausted }}</div>
            <div class="fl text-secondary">算力耗尽</div>
          </div>
          <div class="funnel-arrow text-secondary">→ {{ data.funnel.paidRate }}%</div>
          <div class="funnel-step">
            <div class="fv mk-gradient-text">{{ data.funnel.paid }}</div>
            <div class="fl text-secondary">付费用户</div>
          </div>
        </div>
        <p class="text-secondary funnel-tip">注册→出图 {{ data.funnel.generatedRate }}% · 注册→付费 {{ data.funnel.paidRate }}%（算力耗尽=余额不足单次生成，是充值转化的关键人群）</p>
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

      <!-- 订单管理 -->
      <el-tab-pane label="订单管理" name="orders">
        <div class="mk-card">
          <div class="search-row">
            <el-input v-model="orderKeyword" placeholder="搜索订单号/邮箱" clearable style="width:240px" @keyup.enter="loadOrders" />
            <el-select v-model="orderStatus" placeholder="全部状态" clearable style="width:130px" @change="loadOrders">
              <el-option label="已支付" value="paid" />
              <el-option label="待支付" value="pending" />
              <el-option label="已退款" value="refunded" />
              <el-option label="已关闭" value="closed" />
            </el-select>
            <el-button type="primary" plain @click="loadOrders">搜索</el-button>
          </div>
          <el-table :data="orders" v-loading="loadingOrders" size="small">
            <el-table-column prop="id" label="订单号" min-width="170" show-overflow-tooltip />
            <el-table-column prop="email" label="用户" min-width="160" show-overflow-tooltip />
            <el-table-column prop="title" label="套餐" width="100" />
            <el-table-column label="金额" width="90">
              <template #default="{ row }">¥{{ row.amountYuan }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="{ paid: 'success', pending: 'warning', closed: 'info', refunded: 'danger' }[row.status]">
                  {{ { paid: '已支付', pending: '待支付', closed: '已关闭', refunded: '已退款' }[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="150">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ row }">
                <el-button v-if="row.status === 'paid'" size="small" text type="danger" @click="refundRow(row)">退款</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager" v-if="orderTotal > 15">
            <el-pagination v-model:current-page="orderPage" :page-size="15" :total="orderTotal" layout="prev, pager, next" background @current-change="loadOrders" />
          </div>
        </div>
      </el-tab-pane>

      <!-- 套餐配置 -->
      <el-tab-pane label="套餐配置" name="packages">
        <div class="mk-card">
          <div class="search-row">
            <el-button type="primary" plain @click="openPkgDialog()">新建套餐</el-button>
            <span class="text-secondary pkg-tip">修改立即生效（仅影响后续购买，历史订单不变）；下架后前台不再展示</span>
          </div>
          <el-table :data="packages" size="small">
            <el-table-column prop="title" label="名称" min-width="120" />
            <el-table-column label="类型" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.type === 'member' ? 'warning' : 'info'">{{ row.type === 'member' ? '会员' : '算力包' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="价格" width="90">
              <template #default="{ row }">¥{{ row.priceYuan }}</template>
            </el-table-column>
            <el-table-column prop="credits" label="算力" width="80" />
            <el-table-column label="会员天数" width="90">
              <template #default="{ row }">{{ row.days || '-' }}</template>
            </el-table-column>
            <el-table-column prop="sort" label="排序" width="70" />
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.active ? 'success' : 'info'">{{ row.active ? '在售' : '已下架' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="openPkgDialog(row)">编辑</el-button>
                <el-button size="small" text :type="row.active ? 'danger' : 'success'" @click="togglePkg(row)">
                  {{ row.active ? '下架' : '上架' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-dialog v-model="pkgVisible" :title="pkgForm.id ? '编辑套餐' : '新建套餐'" width="440px">
          <el-form label-width="90px">
            <el-form-item label="类型">
              <el-radio-group v-model="pkgForm.type">
                <el-radio value="credits">算力包</el-radio>
                <el-radio value="member">会员</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="名称"><el-input v-model="pkgForm.title" maxlength="20" /></el-form-item>
            <el-form-item label="价格（元）"><el-input-number v-model="pkgForm.priceYuan" :min="0.01" :precision="2" :step="1" /></el-form-item>
            <el-form-item label="算力"><el-input-number v-model="pkgForm.credits" :min="1" :step="50" /></el-form-item>
            <el-form-item v-if="pkgForm.type === 'member'" label="会员天数"><el-input-number v-model="pkgForm.days" :min="1" :step="30" /></el-form-item>
            <el-form-item label="描述"><el-input v-model="pkgForm.desc" maxlength="40" placeholder="展示在套餐卡片上，如：100算力 · 约20次生成" /></el-form-item>
            <el-form-item label="排序"><el-input-number v-model="pkgForm.sort" :min="0" :step="1" /></el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="pkgVisible = false">取消</el-button>
            <el-button type="primary" :loading="pkgSaving" @click="savePkg">保存</el-button>
          </template>
        </el-dialog>
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
              <el-icon class="gen-del" title="删除违规内容" @click="removeGen(g)"><CircleCloseFilled /></el-icon>
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
import { apiStatsOverview, apiAdminUsers, apiAdminAdjustCredits, apiAdminBan, apiAdminGenerations, apiAdminErrors, apiAdminRefund, apiAdminOrders, apiAdminDeleteGeneration, apiAiMode, apiSetAiMode, apiAdminPackages, apiAdminCreatePackage, apiAdminUpdatePackage, apiAdminTogglePackage } from '@/api'

const data = ref(null)
const forbidden = ref(false)
const tab = ref('overview')

const users = ref([]); const userTotal = ref(0); const userPage = ref(1); const keyword = ref(''); const loadingUsers = ref(false)
const gens = ref([])
const errors = ref([])
const aiMode = ref('mock'); const aiAvailable = ref({ mock: true, fal: false, replicate: false })

const loadAiMode = async () => {
  try {
    const d = await apiAiMode()
    aiMode.value = d.provider
    aiAvailable.value = d.available
  } catch (e) { /* 忽略 */ }
}

const switchAiMode = async provider => {
  try {
    const r = await apiSetAiMode(provider)
    aiMode.value = provider
    ElMessage.success(provider === 'mock' ? '已切换为演示模式' : '已切换为真实出图（' + provider + '）')
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
    loadAiMode()
  }
}

const orders = ref([]); const orderTotal = ref(0); const orderPage = ref(1)
const orderKeyword = ref(''); const orderStatus = ref(''); const loadingOrders = ref(false)

onMounted(async () => {
  try {
    data.value = await apiStatsOverview()
    loadAiMode()
    loadUsers()
    loadOrders()
    loadPackages()
    gens.value = (await apiAdminGenerations()).list
    errors.value = (await apiAdminErrors()).list
  } catch (e) {
    if (e.code === 403) forbidden.value = true
    else if (e.code !== -1) ElMessage.error(e.message)
  }
})

// ---------- 套餐配置 ----------
const packages = ref([])
const pkgVisible = ref(false)
const pkgSaving = ref(false)
const pkgForm = ref({})

const loadPackages = async () => {
  try { packages.value = (await apiAdminPackages()).list }
  catch (e) { if (e.code !== -1 && e.code !== 403) ElMessage.error(e.message) }
}

const openPkgDialog = row => {
  pkgForm.value = row
    ? { id: row.id, type: row.type, title: row.title, priceYuan: Number(row.priceYuan), credits: row.credits, days: row.days || 30, desc: row.desc || '', sort: row.sort }
    : { id: '', type: 'credits', title: '', priceYuan: 9.9, credits: 100, days: 30, desc: '', sort: 99 }
  pkgVisible.value = true
}

const savePkg = async () => {
  const f = pkgForm.value
  if (!f.title.trim()) return ElMessage.warning('请填写套餐名称')
  const payload = {
    type: f.type, title: f.title.trim(),
    price: Math.round(f.priceYuan * 100),
    credits: f.credits, days: f.type === 'member' ? f.days : 0,
    desc: f.desc, sort: f.sort
  }
  pkgSaving.value = true
  try {
    if (f.id) await apiAdminUpdatePackage(f.id, payload)
    else await apiAdminCreatePackage(payload)
    ElMessage.success('已保存')
    pkgVisible.value = false
    loadPackages()
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    pkgSaving.value = false
  }
}

const togglePkg = async row => {
  try {
    if (row.active) await ElMessageBox.confirm(`确认下架「${row.title}」？下架后用户无法再购买该套餐`, '提示', { type: 'warning' })
    await apiAdminTogglePackage(row.id)
    loadPackages()
  } catch (e) {
    if (e !== 'cancel' && e?.message && e?.code !== -1) ElMessage.error(e.message)
  }
}

const loadOrders = async () => {
  loadingOrders.value = true
  try {
    const d = await apiAdminOrders({
      page: orderPage.value, size: 15,
      keyword: orderKeyword.value || undefined,
      status: orderStatus.value || undefined
    })
    orders.value = d.list; orderTotal.value = d.total
  } catch (e) { if (e.code !== -1 && e.code !== 403) ElMessage.error(e.message) }
  finally { loadingOrders.value = false }
}

// 订单列表内一键退款
const refundRow = async row => {
  try {
    await ElMessageBox.confirm(
      `确认对订单 ${row.id}（${row.email}，¥${row.amountYuan}）原路退款？将扣回${row.credits}算力，会员套餐同时回收时长。`,
      '退款确认', { type: 'warning', confirmButtonText: '确认退款' }
    )
    await apiAdminRefund(row.id, '管理员后台退款')
    ElMessage.success('退款成功')
    loadOrders()
  } catch (e) {
    if (e !== 'cancel' && e?.message && e?.code !== -1) ElMessage.error(e.message)
  }
}

// 删除违规生成内容
const removeGen = async g => {
  try {
    await ElMessageBox.confirm(`确认删除 ${g.email} 的该条生成内容？图片文件将一并删除，不可恢复。`, '删除违规内容', { type: 'error' })
    await apiAdminDeleteGeneration(g.id)
    ElMessage.success('已删除')
    gens.value = (await apiAdminGenerations()).list
  } catch (e) {
    if (e !== 'cancel' && e?.message && e?.code !== -1) ElMessage.error(e.message)
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
.funnel {
  margin-bottom: 18px;
  h4 { margin: 0 0 14px; }
  .funnel-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .funnel-step { text-align: center; min-width: 76px; }
  .fv { font-size: 24px; font-weight: 800; }
  .fl { font-size: 12px; margin-top: 2px; }
  .funnel-arrow { font-size: 13px; }
  .funnel-tip { font-size: 12px; margin: 12px 0 0; }
}
.pkg-tip { font-size: 12px; align-self: center; }
.search-row { display: flex; gap: 10px; margin-bottom: 14px; }
.mode-card {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 14px 18px; margin-bottom: 14px;
  .mode-label { font-weight: 700; font-size: 14px; }
  .mode-tip { font-size: 12px; }
}
.pager { display: flex; justify-content: center; margin-top: 14px; }
.gen-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.gen-cell {
  position: relative;
  .gen-img { width: 100%; height: 110px; border-radius: 8px; overflow: hidden; display: block; }
  .gen-del {
    position: absolute; top: 6px; right: 6px; cursor: pointer;
    color: #f56c6c; background: #fff; border-radius: 50%; font-size: 18px;
    opacity: 0.85; &:hover { opacity: 1; }
  }
  .gen-meta { font-size: 11px; margin-top: 4px; line-height: 1.5; word-break: break-all; }
}
</style>
