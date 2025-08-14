<template>
  <div class="page-container">
    <div class="page-title"><el-icon class="mk-gradient-text"><Tickets /></el-icon> 订单与消费明细</div>

    <el-tabs v-model="tab">
            <el-tab-pane label="充值订单" name="orders">
        <div class="mk-card">
          <el-table :data="orders" v-loading="loadingOrders" empty-text="暂无订单">
            <el-table-column prop="id" label="订单号" min-width="180" />
            <el-table-column prop="title" label="套餐" min-width="100" />
            <el-table-column label="金额" width="100">
              <template #default="{ row }">¥{{ row.amountYuan }}</template>
            </el-table-column>
            <el-table-column prop="credits" label="算力" width="90" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="{ paid: 'success', pending: 'warning', closed: 'info', refunded: 'danger' }[row.status]" size="small">
                  {{ { paid: '已支付', pending: '待支付', closed: '已关闭', refunded: '已退款' }[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" min-width="150">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <div class="pager" v-if="orderTotal > 10">
            <el-pagination v-model:current-page="orderPage" :page-size="10" :total="orderTotal" layout="prev, pager, next" background @current-change="loadOrders" />
          </div>
        </div>
      </el-tab-pane>

            <el-tab-pane label="算力明细" name="logs">
        <div class="mk-card">
          <el-table :data="logs" v-loading="loadingLogs" empty-text="暂无明细">
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="{ register: 'success', recharge: 'success', consume: 'danger', refund: 'warning', daily: 'success', invite: 'success' }[row.type]">
                  {{ { register: '注册赠送', recharge: '充值到账', consume: '生成消耗', refund: '失败退还', daily: '每日奖励', invite: '邀请奖励' }[row.type] || row.type }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="变动" width="100">
              <template #default="{ row }">
                <span :style="{ color: row.change > 0 ? '#67c23a' : '#f56c6c', fontWeight: 700 }">
                  {{ row.change > 0 ? '+' : '' }}{{ row.change }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="balance" label="余额" width="100" />
            <el-table-column prop="remark" label="说明" min-width="200" />
            <el-table-column label="时间" min-width="150">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
          <div class="pager" v-if="logTotal > 15">
            <el-pagination v-model:current-page="logPage" :page-size="15" :total="logTotal" layout="prev, pager, next" background @current-change="loadLogs" />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { apiOrders, apiCreditLogs } from '@/api'

const tab = ref('orders')
const orders = ref([]); const orderTotal = ref(0); const orderPage = ref(1); const loadingOrders = ref(false)
const logs = ref([]); const logTotal = ref(0); const logPage = ref(1); const loadingLogs = ref(false)

const formatTime = ts => ts ? new Date(ts).toLocaleString('zh-CN') : '-'

const loadOrders = async () => {
  loadingOrders.value = true
  try {
    const data = await apiOrders({ page: orderPage.value, size: 10 })
    orders.value = data.list; orderTotal.value = data.total
  } catch (e) { if (e.code !== -1) ElMessage.error(e.message) }
  finally { loadingOrders.value = false }
}

const loadLogs = async () => {
  loadingLogs.value = true
  try {
    const data = await apiCreditLogs({ page: logPage.value, size: 15 })
    logs.value = data.list; logTotal.value = data.total
  } catch (e) { if (e.code !== -1) ElMessage.error(e.message) }
  finally { loadingLogs.value = false }
}

onMounted(() => { loadOrders(); loadLogs() })
</script>

<style scoped>
.pager { display: flex; justify-content: center; margin-top: 16px; }
</style>
