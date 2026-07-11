<template>
  <div class="wf-page">
        <div class="wf-bar">
      <el-button text @click="$router.push('/workflows')"><el-icon><ArrowLeft /></el-icon>返回</el-button>
      <input v-model="name" class="wf-name" placeholder="未命名工作流" maxlength="60" />
      <div class="wf-bar-spacer"></div>
      <span v-if="dirty" class="wf-save-state dirty">未保存的更改…</span>
      <span v-else-if="autoSavedAt" class="wf-save-state">已自动保存 {{ autoSavedAt }}</span>
      <el-button text :disabled="!wfId" @click="openRunHistory">
        <el-icon><Clock /></el-icon>&nbsp;运行历史
      </el-button>
      <el-button class="mk-btn-gradient" :loading="saving" :disabled="running" @click="save()">
        <el-icon><Check /></el-icon>&nbsp;保存
      </el-button>
    </div>

    <!-- 运行历史抽屉：再跑一次,上次的产物也还在这里,可回看/放大/下载 -->
    <el-drawer v-model="historyVisible" title="运行历史" size="380px" :append-to-body="true">
      <div v-if="historyLoading" class="wf-his-loading"><el-icon class="is-loading"><Loading /></el-icon></div>
      <el-empty v-else-if="!runHistory.length" description="还没有运行记录" :image-size="70" />
      <div v-else class="wf-his-list">
        <div v-for="r in runHistory" :key="r.id" class="wf-his-item">
          <div class="wf-his-head">
            <el-tag :type="RUN_TAG_TYPE[r.status] || 'info'" size="small" effect="plain">
              {{ RUN_STATUS_TEXT[r.status] || r.status }}
            </el-tag>
            <span class="wf-his-cost">{{ r.cost }} 算力</span>
            <span class="wf-his-time">{{ fmtTime(r.createdAt) }}</span>
          </div>
          <div v-if="r.outputs?.length" class="wf-his-outs">
            <el-image
              v-for="(o, i) in r.outputs"
              :key="o.nodeId || i"
              class="wf-his-thumb"
              :src="o.url"
              fit="contain"
              :preview-src-list="r.outputs.map(x => x.url)"
              :initial-index="i"
              preview-teleported
            />
          </div>
          <div v-else-if="r.error" class="wf-his-err">{{ r.error }}</div>
        </div>
      </div>
    </el-drawer>

    <div class="wf-main">
            <aside class="wf-side wf-left"><NodePalette /></aside>

            <div class="wf-canvas" @drop="onDrop" @dragover="onDragOver">
        <VueFlow
          :node-types="nodeTypes"
          :default-viewport="{ zoom: 1 }"
          :min-zoom="0.3"
          :max-zoom="2"
          :delete-key-code="running ? null : ['Delete', 'Backspace']"
          :nodes-draggable="!running"
          :nodes-connectable="!running"
          @nodes-change="markDirty"
          @edges-change="markDirty"
        >
          <Background :gap="22" :size="2.2" pattern-color="var(--wf-dot)" />
          <Controls />
          <MiniMap v-if="minimapOpen" pannable zoomable />
        </VueFlow>
        <!-- 小地图开关：常驻右下角小按钮，收起后不占画布空间 -->
        <button class="wf-minimap-toggle" :class="{ open: minimapOpen }" :title="minimapOpen ? '收起小地图' : '展开小地图'" @click="toggleMinimap">
          <el-icon><MapLocation /></el-icon>
        </button>
        <div v-if="empty" class="wf-hollow">
          <el-icon :size="34"><Connection /></el-icon>
          <p>从左侧拖入节点开始搭建</p>
          <p class="wf-hollow-sub">建议：图片输入 → 智能打光 → 输出</p>
        </div>
        <RunPanel
          v-if="!empty"
          :node-count="nodeCount"
          :estimate="estimate"
          :estimating="estimating"
          :running="running"
          :run-phase="runPhase"
          :node-statuses="nodeStatuses"
          :results="runOutputs"
          @run="run"
          @cancel="cancelRun"
        />
      </div>

            <aside class="wf-side wf-right">
        <NodeInspector :node="selectedNode" :readonly="running" @delete="deleteNode" @duplicate="duplicateNode" />
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, markRaw, onMounted, onBeforeUnmount, watch, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Check, Connection, Clock, Loading, MapLocation } from '@element-plus/icons-vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'
import NodePalette from '@/components/flow/NodePalette.vue'
import NodeInspector from '@/components/flow/NodeInspector.vue'
import BaseNode from '@/components/flow/BaseNode.vue'
import RunPanel from '@/components/flow/RunPanel.vue'
import { nodeDef, canConnect } from '@/components/flow/nodeTypes'
import { templateByKey } from '@/components/flow/templates'
import {
  apiWorkflowGet, apiWorkflowCreate, apiWorkflowUpdate, apiWorkflowRuns,
  apiWorkflowEstimate, apiWorkflowRun, apiWorkflowRunStatus, apiWorkflowRunCancel, apiWorkflowRunEventsUrl
} from '@/api'
import { useUserStore } from '@/stores/user'
import { useTasksStore } from '@/stores/tasks'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const tasksStore = useTasksStore()

const nodeTypes = { 'image-input': markRaw(BaseNode), 'relight': markRaw(BaseNode), 'output': markRaw(BaseNode) }

const {
  onConnect, addEdges, addNodes, removeNodes, findNode,
  onNodeClick, onPaneClick, screenToFlowCoordinate,
  getNodes, getEdges, setNodes, setEdges, updateNodeData
} = useVueFlow()

const name = ref('未命名工作流')
const wfId = ref(route.params.id || '')
const saving = ref(false)
const dirty = ref(false)
const selectedId = ref('')

// 小地图默认收起（小画布用不上），展开偏好记在本地
const minimapOpen = ref(localStorage.getItem('wf_minimap') === 'on')
const toggleMinimap = () => {
  minimapOpen.value = !minimapOpen.value
  localStorage.setItem('wf_minimap', minimapOpen.value ? 'on' : 'off')
}
let nid = 1
let loading = false // 载入期间抑制 dirty

const selectedNode = computed(() => (selectedId.value ? findNode(selectedId.value) : null))
const empty = ref(true)
const refreshEmpty = () => { empty.value = getNodes.value.length === 0 }
const markDirty = () => { if (!loading) refreshEmpty() }
onNodeClick(({ node }) => { selectedId.value = node.id })
onPaneClick(() => { selectedId.value = '' })
onConnect(conn => {
  if (conn.source === conn.target) return
  const src = findNode(conn.source), tgt = findNode(conn.target)
  if (!src || !tgt || !canConnect(src.type, tgt.type)) {
    return ElMessage.warning('这两个节点的接口类型不匹配，无法连接')
  }
  const dup = getEdges.value.filter(e => e.target === conn.target)
  if (dup.length) setEdges(getEdges.value.filter(e => e.target !== conn.target))
  addEdges([{ ...conn, animated: true }])
  dirty.value = true
})
const onDragOver = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
const onDrop = e => {
  e.preventDefault()
  const type = e.dataTransfer.getData('application/vueflow')
  const def = nodeDef(type)
  if (!def) return
  const position = screenToFlowCoordinate({ x: e.clientX, y: e.clientY })
  const id = `${type}-${nid++}`
  addNodes([{ id, type, position, data: def.data() }])
  selectedId.value = id
  dirty.value = true
  refreshEmpty()
}

const deleteNode = id => {
  if (running.value) { ElMessage.warning('运行中无法编辑节点，请先取消运行'); return }
  removeNodes([id])
  if (selectedId.value === id) selectedId.value = ''
  delete nodeStatusMap[id]
  dirty.value = true
  refreshEmpty()
}

// 复制选中节点（按钮 / Ctrl+D）：深拷贝 data（剥掉运行期 runStatus），错位放置避免完全重叠
const duplicateNode = id => {
  if (running.value) return
  const src = findNode(id || selectedId.value)
  if (!src) return
  const { runStatus, ...cleanData } = src.data || {}
  const newId = `${src.type}-${nid++}`
  addNodes([{
    id: newId,
    type: src.type,
    position: { x: src.position.x + 40, y: src.position.y + 40 },
    data: JSON.parse(JSON.stringify(cleanData))
  }])
  selectedId.value = newId
  dirty.value = true
  refreshEmpty()
}

// ---------- 撤销 / 重做：快照式历史栈 ----------
// 每次内容变化（防抖后）把序列化图推入 undo 栈；Ctrl+Z 回退、Ctrl+Shift+Z / Ctrl+Y 重做。
// restoring 期间不再采集（否则撤销本身又会生成一条新历史，永远退不回去）。
const undoStack = []
const redoStack = []
let historyTimer = null
let restoring = false
const captureHistory = () => {
  if (loading || restoring) return
  clearTimeout(historyTimer)
  historyTimer = setTimeout(() => {
    if (loading || restoring) return
    const sig = JSON.stringify(buildGraph())
    if (undoStack[undoStack.length - 1] === sig) return
    undoStack.push(sig)
    if (undoStack.length > 60) undoStack.shift()
    redoStack.length = 0
  }, 350)
}

const applyHistorySnapshot = sig => {
  restoring = true
  const g = JSON.parse(sig)
  setNodes((g.nodes || []).map(n => ({
    ...n,
    ...(n.data?.size?.width && n.data?.size?.height
      ? { width: n.data.size.width, height: n.data.size.height }
      : {})
  })))
  setEdges((g.edges || []).map(e => ({ ...e, animated: true })))
  selectedId.value = ''
  dirty.value = true
  refreshEmpty()
  setTimeout(() => { restoring = false }, 400) // 覆盖 captureHistory 的防抖窗口
}

const undo = () => {
  if (running.value || undoStack.length < 2) return
  redoStack.push(undoStack.pop())
  applyHistorySnapshot(undoStack[undoStack.length - 1])
}
const redo = () => {
  if (running.value || !redoStack.length) return
  const sig = redoStack.pop()
  undoStack.push(sig)
  applyHistorySnapshot(sig)
}

const isTypingTarget = el =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

const onKeydown = e => {
  if (isTypingTarget(e.target)) return
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo() }
  else if (k === 'd') { e.preventDefault(); duplicateNode(selectedId.value) }
}
const buildGraph = () => ({
  version: 1,
  nodes: getNodes.value.map(n => {
    const { runStatus, ...cleanData } = n.data || {}
    return { id: n.id, type: n.type, position: n.position, data: cleanData }
  }),
  edges: getEdges.value.map(e => ({ id: e.id, source: e.source, target: e.target }))
})
let lastGraphSignature = ''
const captureGraphSignature = () => { lastGraphSignature = JSON.stringify(buildGraph()) }

const autoSavedAt = ref('')
const save = async (opts = {}) => {
  const silent = opts.silent === true
  if (!getNodes.value.length) {
    if (!silent) ElMessage.warning('画布为空，先拖入节点')
    return
  }
  saving.value = true
  try {
    const graph = buildGraph()
    if (wfId.value) {
      await apiWorkflowUpdate(wfId.value, { name: name.value, graph })
    } else {
      const { id } = await apiWorkflowCreate({ name: name.value, graph })
      wfId.value = id
      router.replace(`/workflow/${id}`)
    }
    dirty.value = false
    captureGraphSignature()
    if (silent) {
      const d = new Date()
      autoSavedAt.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    } else {
      ElMessage.success('已保存')
    }
    scheduleEstimate()
  } catch (e) {
    // 自动保存失败保持静默（dirty 会一直亮着，下次改动会重试），手动保存才弹错
    if (!silent && e.code !== -1) ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 自动保存：有改动就防抖落库，用户不需要惦记"记得点保存"。
// 新建（还没有 wfId）的画布也会在第一次改动后自动创建，产品行为对齐 Figma/Notion 一类
// "打开即文档"的预期；名字后面随时可改。
let autoSaveTimer = null
watch(dirty, val => {
  if (!val) return
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    if (dirty.value && !running.value && !saving.value && getNodes.value.length) save({ silent: true })
  }, 1500)
})
const loadGraph = g => {
  loading = true
  setNodes((g.nodes || []).map(n => ({
    ...n,
    ...(n.data?.size?.width && n.data?.size?.height
      ? { width: n.data.size.width, height: n.data.size.height }
      : {})
  })))
  setEdges((g.edges || []).map(e => ({ ...e, animated: true })))
  let max = 0
  for (const n of g.nodes || []) {
    const m = /-(\d+)$/.exec(n.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  nid = max + 1
  setTimeout(() => {
    loading = false; dirty.value = false; captureGraphSignature(); refreshEmpty(); scheduleEstimate()
    // 历史栈起点：载入完成后的状态就是"最早能撤回到"的版本
    undoStack.length = 0; redoStack.length = 0
    undoStack.push(JSON.stringify(buildGraph()))
  }, 0)
}

onMounted(async () => {
  if (wfId.value) {
    try {
      const wf = await apiWorkflowGet(wfId.value)
      name.value = wf.name
      loadGraph(wf.graph)
    } catch (e) {
      ElMessage.error('工作流不存在或无权访问')
      router.replace('/workflows')
    }
  } else if (route.query.template) {
    // 从模板新建：预铺好节点与连线，标记为未保存（首次改动/运行时自动落库）
    const tpl = templateByKey(String(route.query.template))
    if (tpl) {
      name.value = tpl.name
      loadGraph(tpl.build())
      setTimeout(() => { dirty.value = true }, 0)
    } else {
      refreshEmpty()
      captureGraphSignature()
    }
  } else {
    refreshEmpty()
    captureGraphSignature()
    undoStack.push(JSON.stringify(buildGraph())) // 空画布也要有历史起点
  }
  window.addEventListener('keydown', onKeydown)
})

watch(name, () => { if (!loading) dirty.value = true })

const nodeCount = computed(() => getNodes.value.length)
const estimate = ref(null)
const estimating = ref(false)
let estimateTimer = null

const refreshEstimate = async () => {
  if (running.value) return // 运行期间保留运行前的估算值展示，不重复请求
  if (!wfId.value || !getNodes.value.length) { estimate.value = null; estimating.value = false; return }
  estimating.value = true
  try {
    const data = await apiWorkflowEstimate(wfId.value, buildGraph())
    estimate.value = data.total
  } catch (e) {
    estimate.value = null
  } finally {
    estimating.value = false
  }
}

const scheduleEstimate = () => {
  if (running.value) return
  if (!wfId.value || !getNodes.value.length) { estimate.value = null; return }
  clearTimeout(estimateTimer)
  estimateTimer = setTimeout(refreshEstimate, 700)
}
watch([getNodes, getEdges], () => {
  if (loading || running.value) return
  scheduleEstimate()
  captureHistory()
  const sig = JSON.stringify(buildGraph())
  if (sig !== lastGraphSignature) {
    lastGraphSignature = sig
    dirty.value = true
  }
}, { deep: true })
const TERMINAL_RUN_STATUSES = ['success', 'failed', 'canceled']
const RUN_PHASE_MAP = { pending: 'running', running: 'running', success: 'success', failed: 'failed', canceled: 'canceled' }

const runId = ref('')
const runPhase = ref('idle') // idle|running|success|failed|canceled
const running = computed(() => runPhase.value === 'running')
provide('wfRunning', running)
const nodeStatusMap = reactive({}) // nodeId -> { status, error, output }
const runOutputs = ref([]) // 本次运行最终产物（output 类型节点的结果），来自 done 事件
let es = null // EventSource
let pollTimer = null
let settled = true // 本次运行的终态是否已处理（防止重复退款提示 / 重复 toast）
let unmounted = false

const nodeStatuses = computed(() => getNodes.value.map(n => {
  const st = nodeStatusMap[n.id]
  return {
    id: n.id,
    label: (nodeDef(n.type) || {}).label || n.type,
    status: st?.status || 'pending',
    error: st?.error || ''
  }
}))
const setNodeRunStatus = (nodeId, status, extra = {}) => {
  if (!findNode(nodeId)) return // 运行期间节点理论上不会被删除，兜底避免报错
  const entry = { status, error: extra.error || '', output: extra.output || null }
  nodeStatusMap[nodeId] = entry
  updateNodeData(nodeId, { runStatus: entry })
}

const resetRunStatuses = () => {
  for (const key of Object.keys(nodeStatusMap)) delete nodeStatusMap[key]
  for (const n of getNodes.value) updateNodeData(n.id, { runStatus: undefined })
  runOutputs.value = []
}

const closeEventSource = () => { if (es) { es.close(); es = null } }
const clearPollTimer = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

const settleRun = (status, error) => {
  if (settled) return
  settled = true
  closeEventSource()
  clearPollTimer()
  runPhase.value = status
  userStore.fetchMe()
  if (status === 'success') ElMessage.success('运行完成')
  else if (status === 'failed') ElMessage.error(error || '运行失败')
  else if (status === 'canceled') ElMessage.info('已取消运行')
  scheduleEstimate()
  if (historyVisible.value) loadRunHistory() // 抽屉开着时实时补上这次运行
}

// ---------- 运行历史 ----------
const RUN_STATUS_TEXT = { pending: '排队中', running: '运行中', success: '成功', failed: '失败', canceled: '已取消' }
const RUN_TAG_TYPE = { success: 'success', failed: 'danger', canceled: 'info', running: 'warning', pending: 'warning' }
const historyVisible = ref(false)
const historyLoading = ref(false)
const runHistory = ref([])
const fmtTime = ts => {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const loadRunHistory = async () => {
  if (!wfId.value) return
  historyLoading.value = true
  try {
    const { list } = await apiWorkflowRuns(wfId.value)
    runHistory.value = list
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message || '加载运行历史失败')
  } finally {
    historyLoading.value = false
  }
}
const openRunHistory = () => { historyVisible.value = true; loadRunHistory() }

const applySnapshot = ({ run, nodes }) => {
  for (const n of nodes || []) setNodeRunStatus(n.nodeId, n.status, { error: n.error, output: n.output })
  if (run?.outputs) runOutputs.value = run.outputs
  if (run?.status) {
    if (TERMINAL_RUN_STATUSES.includes(run.status)) settleRun(run.status, run.error)
    else runPhase.value = RUN_PHASE_MAP[run.status] || 'running'
  }
}

const applyNodeEvent = data => setNodeRunStatus(data.nodeId, data.status, { error: data.error, output: data.output })

const applyDone = data => {
  if (data.outputs) runOutputs.value = data.outputs
  settleRun(data.status, data.error)
}

const startPolling = rid => {
  clearPollTimer()
  pollTimer = setInterval(async () => {
    try {
      const { run, nodes } = await apiWorkflowRunStatus(rid)
      for (const n of nodes || []) setNodeRunStatus(n.nodeId, n.status, { error: n.error, output: n.output })
      if (run?.outputs) runOutputs.value = run.outputs
      if (run?.status && TERMINAL_RUN_STATUSES.includes(run.status)) settleRun(run.status, run.error)
    } catch (e) {  }
  }, 1500)
}

const subscribeRun = rid => {
  closeEventSource()
  clearPollTimer()
  es = new EventSource(apiWorkflowRunEventsUrl(rid))
  es.addEventListener('snapshot', e => { try { applySnapshot(JSON.parse(e.data)) } catch (err) {  } })
  es.addEventListener('node', e => { try { applyNodeEvent(JSON.parse(e.data)) } catch (err) {  } })
  es.addEventListener('done', e => { try { applyDone(JSON.parse(e.data)) } catch (err) {  } })
  es.onerror = () => {
    if (settled) return
    closeEventSource()
    startPolling(rid) // SSE 断开时降级为轮询兜底
  }
}

const run = async () => {
  if (!getNodes.value.length || running.value) return
  // 未保存/未创建的画布直接保存后运行——用户不需要理解"要先保存才能跑"这件事
  if (dirty.value || !wfId.value) {
    await save()
    if (dirty.value || !wfId.value) return // 保存失败则中止运行（错误提示已在 save() 内弹出）
  }

  closeEventSource()
  clearPollTimer()
  resetRunStatuses()
  settled = false
  runId.value = ''
  runPhase.value = 'running'
  try {
    const { runId: rid } = await apiWorkflowRun(wfId.value)
    tasksStore.track('workflow', rid, `工作流 · ${name.value}`, `/workflow/${wfId.value}`)
    if (unmounted) { return } // 响应回来前组件已卸载，不再订阅 SSE（见 onBeforeUnmount）
    runId.value = rid
    subscribeRun(rid)
  } catch (e) {
    settled = true
    runPhase.value = 'idle'
    if (e.code === 429 && /算力不足/.test(e.message || '')) {
      ElMessageBox.confirm(e.message || '算力不足，请先充值', '算力不足', {
        confirmButtonText: '去充值', cancelButtonText: '取消', type: 'warning'
      }).then(() => { location.href = '/recharge' }).catch(() => {})
    } else if (e.code !== -1) {
      ElMessage.error(e.message || '运行失败')
    }
  }
}

const cancelRun = async () => {
  if (!runId.value) return
  try {
    await apiWorkflowRunCancel(runId.value)
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message || '取消失败')
  }
}

onBeforeUnmount(() => {
  unmounted = true
  closeEventSource()
  clearPollTimer()
  clearTimeout(estimateTimer)
  clearTimeout(autoSaveTimer)
  clearTimeout(historyTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.wf-page { display: flex; flex-direction: column; height: calc(100vh - 56px); }
.wf-bar {
  display: flex; align-items: center; gap: 10px; padding: 10px 16px;
  border-bottom: 1px solid var(--mk-border); background: var(--mk-card);
}
.wf-name {
  font: inherit; font-size: 15px; font-weight: 650; color: var(--mk-text);
  background: transparent; border: none; outline: none; padding: 6px 8px; border-radius: 8px;
  min-width: 180px;
}
.wf-name:focus { background: var(--mk-bg); }
.wf-bar-spacer { flex: 1; }
.wf-save-state { font-size: 12px; color: var(--mk-text-2); white-space: nowrap; }
.wf-save-state.dirty { color: #e6a23c; }

.wf-his-loading { display: flex; justify-content: center; padding: 40px 0; font-size: 22px; color: var(--mk-primary); }
.wf-his-list { display: flex; flex-direction: column; gap: 14px; }
.wf-his-item { border: 1px solid var(--mk-border); border-radius: 10px; padding: 10px 12px; }
.wf-his-head { display: flex; align-items: center; gap: 8px; }
.wf-his-cost { font-size: 12px; color: var(--mk-text-2); font-variant-numeric: tabular-nums; }
.wf-his-time { font-size: 12px; color: var(--mk-text-2); margin-left: auto; font-variant-numeric: tabular-nums; }
.wf-his-outs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.wf-his-thumb {
  width: 64px; height: 64px; border-radius: 6px; overflow: hidden;
  border: 1px solid var(--mk-border); cursor: zoom-in; background: rgba(0, 0, 0, .12);
}
.wf-his-err { font-size: 12px; color: #f56c6c; margin-top: 8px; line-height: 1.5; }

.wf-main { flex: 1; display: flex; min-height: 0; }
.wf-side { width: 232px; flex: none; background: var(--mk-card); overflow-y: auto; }
.wf-left { border-right: 1px solid var(--mk-border); }
.wf-right { border-left: 1px solid var(--mk-border); width: 260px; }
/* 画布：不再用全局灰底——点阵网格 + 顶部一束品牌色光晕，给画布纵深感。
   点/连线/控件颜色都走 --wf-* 变量，亮暗两套在下方非 scoped 块里定义 */
.wf-canvas { flex: 1; position: relative; min-width: 0; background: var(--wf-canvas-bg); }
.wf-canvas :deep(.vue-flow) { background: transparent; }

/* 连线：默认更轻的中性色，选中/悬停时亮起主色，别再让线比卡片还抢眼 */
.wf-canvas :deep(.vue-flow__edge-path) { stroke: var(--wf-edge); stroke-width: 1.8; transition: stroke .15s; }
.wf-canvas :deep(.vue-flow__edge:hover .vue-flow__edge-path),
.wf-canvas :deep(.vue-flow__edge.selected .vue-flow__edge-path) { stroke: var(--mk-primary); }
.wf-canvas :deep(.vue-flow__connection-path) { stroke: var(--mk-primary); stroke-width: 1.8; }

/* 缩放控件与小地图：贴合主题卡片风，不再是白底黑字的默认皮肤 */
.wf-canvas :deep(.vue-flow__controls) {
  border-radius: 10px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, .14);
  border: 1px solid var(--mk-border);
}
.wf-canvas :deep(.vue-flow__controls-button) {
  background: var(--mk-card); border-bottom: 1px solid var(--mk-border); width: 26px; height: 26px;
}
.wf-canvas :deep(.vue-flow__controls-button svg) { fill: var(--mk-text-2); }
.wf-canvas :deep(.vue-flow__controls-button:hover) { background: var(--mk-bg); }
.wf-canvas :deep(.vue-flow__minimap) {
  border-radius: 10px; overflow: hidden; border: 1px solid var(--mk-border);
  background: var(--mk-card); box-shadow: 0 4px 16px rgba(0, 0, 0, .14);
  bottom: 44px; /* 给右下角的小地图开关按钮让位 */
}

.wf-minimap-toggle {
  position: absolute; right: 15px; bottom: 15px; z-index: 5;
  width: 28px; height: 28px; border-radius: 8px; cursor: pointer;
  display: grid; place-items: center; font-size: 14px;
  background: var(--mk-card); color: var(--mk-text-2);
  border: 1px solid var(--mk-border); box-shadow: 0 4px 16px rgba(0, 0, 0, .14);
  transition: color .15s, border-color .15s;
}
.wf-minimap-toggle:hover { color: var(--mk-primary); border-color: var(--mk-primary); }
.wf-minimap-toggle.open { color: var(--mk-primary); }

.wf-hollow {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: var(--mk-text-2); pointer-events: none; text-align: center;
}
.wf-hollow p { margin: 0; font-size: 14px; }
.wf-hollow-sub { font-size: 12px !important; opacity: .8; }

@media (max-width: 860px) {
  .wf-side { width: 180px; }
  .wf-right { width: 200px; }
}
</style>

<style>
/* 画布亮/暗两套配色（scoped 选不到 html.dark 前缀，放全局块） */
.wf-canvas {
  --wf-dot: #bcc7d6;
  --wf-edge: #b9c2d2;
  --wf-canvas-bg:
    radial-gradient(900px 420px at 50% -8%, rgba(0, 87, 194, .07), transparent 62%),
    #f7f9fc;
}
html.dark .wf-canvas {
  --wf-dot: rgba(160, 178, 214, .32);
  --wf-edge: rgba(255, 255, 255, .24);
  --wf-canvas-bg:
    radial-gradient(900px 420px at 50% -8%, rgba(90, 140, 255, .12), transparent 62%),
    #0a0c12;
}
</style>
