<template>
  <div class="page-container wf-list">
    <div class="wl-head">
      <div>
        <div class="wl-title"><el-icon class="mk-gradient-text"><Connection /></el-icon> 工作流</div>
        <p class="text-secondary wl-sub">把上传、打光、输出编排成可复用的节点流程</p>
      </div>
      <el-button class="mk-btn-gradient" size="large" @click="tplVisible = true">
        <el-icon><Plus /></el-icon>&nbsp;新建工作流
      </el-button>
    </div>

    <!-- 模板选择：新建不再落到空画布上，先选一个起点（含"空白画布"兜底） -->
    <el-dialog v-model="tplVisible" title="选择一个起点" width="640px">
      <div class="tpl-grid">
        <div v-for="t in TEMPLATES" :key="t.key" class="tpl-card" @click="createFrom(t)">
          <div class="tpl-ic" :style="{ color: t.accent }">
            <el-icon :size="24"><component :is="t.icon" /></el-icon>
          </div>
          <div class="tpl-name">{{ t.name }}</div>
          <div class="tpl-desc">{{ t.desc }}</div>
          <div v-if="t.nodeCount" class="tpl-count">{{ t.nodeCount }} 个节点</div>
        </div>
      </div>
    </el-dialog>

    <div v-loading="loading" class="wl-body">
      <div v-if="!loading && !list.length" class="wl-empty">
        <el-icon :size="40"><Connection /></el-icon>
        <p>还没有工作流</p>
        <p class="text-secondary small">新建一个，用节点画布搭建你的打光流程</p>
        <el-button class="mk-btn-gradient" @click="$router.push('/workflow')">立即创建</el-button>
      </div>

      <div v-else class="wl-grid">
        <div v-for="w in list" :key="w.id" class="wl-card" @click="$router.push(`/workflow/${w.id}`)">
          <div class="wl-thumb" :style="w.thumbnail ? { backgroundImage: `url(${w.thumbnail})` } : {}">
            <el-icon v-if="!w.thumbnail" :size="26"><Connection /></el-icon>
          </div>
          <div class="wl-meta">
            <div class="wl-name">{{ w.name }}</div>
            <div class="wl-time">{{ fmt(w.updatedAt) }}</div>
          </div>
          <el-button class="wl-del" size="small" text type="danger" @click.stop="remove(w)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Plus, Delete, DocumentAdd, MagicStick, Grid, Odometer } from '@element-plus/icons-vue'
import { apiWorkflowList, apiWorkflowDelete } from '@/api'
import { TEMPLATES } from '@/components/flow/templates'

const router = useRouter()
const list = ref([])
const loading = ref(true)
const tplVisible = ref(false)

const createFrom = t => {
  tplVisible.value = false
  router.push(t.key === 'blank' ? '/workflow' : { path: '/workflow', query: { template: t.key } })
}

const fmt = ts => {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const load = async () => {
  loading.value = true
  try {
    const { list: rows } = await apiWorkflowList()
    list.value = rows
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

const remove = async w => {
  try {
    await ElMessageBox.confirm(`确定删除「${w.name}」？此操作不可恢复`, '删除工作流', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'
    })
    await apiWorkflowDelete(w.id)
    list.value = list.value.filter(i => i.id !== w.id)
    ElMessage.success('已删除')
  } catch (e) {
    if (e !== 'cancel' && e.code !== -1) ElMessage.error(e.message || '删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.wf-list { max-width: 1080px; margin: 0 auto; }
.wl-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.wl-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 750; }
.wl-sub { font-size: 13px; margin-top: 4px; }
.wl-body { min-height: 200px; }
.wl-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  padding: 70px 20px; color: var(--mk-text-2); text-align: center;
}
.wl-empty p { margin: 0; font-size: 15px; color: var(--mk-text); }
.wl-empty .small { font-size: 12px; }
.wl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.wl-card {
  position: relative; border: 1px solid var(--mk-border); border-radius: 14px; overflow: hidden;
  background: var(--mk-card); cursor: pointer; transition: .18s;
}
.wl-card:hover { border-color: var(--mk-primary); box-shadow: 0 8px 22px rgba(124, 108, 255, .16); transform: translateY(-2px); }
.wl-thumb {
  aspect-ratio: 16/9; background: var(--mk-bg) center/contain no-repeat;
  display: grid; place-items: center; color: var(--mk-text-2);
  border-bottom: 1px solid var(--mk-border);
}
.wl-meta { padding: 10px 12px; }
.wl-name { font-size: 14px; font-weight: 650; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.wl-time { font-size: 11.5px; color: var(--mk-text-2); margin-top: 2px; font-variant-numeric: tabular-nums; }
.wl-del { position: absolute; top: 6px; right: 6px; background: rgba(0, 0, 0, .3); }

.tpl-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.tpl-card {
  border: 1px solid var(--mk-border); border-radius: 12px; padding: 16px 14px;
  cursor: pointer; transition: .16s;
}
.tpl-card:hover { border-color: var(--mk-primary); background: rgba(124, 108, 255, .05); }
.tpl-ic { margin-bottom: 8px; }
.tpl-name { font-size: 14px; font-weight: 700; }
.tpl-desc { font-size: 12px; color: var(--mk-text-2); line-height: 1.6; margin-top: 4px; min-height: 38px; }
.tpl-count { font-size: 11px; color: var(--mk-text-2); margin-top: 6px; }
@media (max-width: 560px) { .tpl-grid { grid-template-columns: 1fr; } }
</style>
