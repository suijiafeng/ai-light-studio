<template>
  <div class="wf-page">
    <!-- 顶部工具条 -->
    <div class="wf-bar">
      <el-button text @click="$router.push('/workflows')"><el-icon><ArrowLeft /></el-icon>返回</el-button>
      <input v-model="name" class="wf-name" placeholder="未命名工作流" maxlength="60" />
      <div class="wf-bar-spacer"></div>
      <span v-if="dirty" class="wf-dirty">● 未保存</span>
      <el-button class="mk-btn-gradient" :loading="saving" :disabled="running" @click="save">
        <el-icon><Check /></el-icon>&nbsp;保存
      </el-button>
    </div>

    <div class="wf-main">
      <!-- 左：节点面板 -->
      <aside class="wf-side wf-left"><NodePalette /></aside>

      <!-- 中：画布 -->
      <div class="wf-canvas" @drop="onDrop" @dragover="onDragOver">
        <VueFlow
          :node-types="nodeTypes"
          :default-viewport="{ zoom: 1 }"
          :min-zoom="0.3"
          :max-zoom="2"
          :delete-key-code="running ? null : 'Delete'"
          :nodes-draggable="!running"
          :nodes-connectable="!running"
          @nodes-change="markDirty"
          @edges-change="markDirty"
        >
          <Background :gap="18" pattern-color="var(--mk-border)" />
          <Controls />
          <MiniMap pannable zoomable />
        </VueFlow>
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
          :unsaved="!wfId"
          :results="runOutputs"
          @run="run"
          @cancel="cancelRun"
        />
      </div>

      <!-- 右：属性面板 -->
      <aside class="wf-side wf-right">
        <NodeInspector :node="selectedNode" :readonly="running" @delete="deleteNode" />
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, markRaw, onMounted, onBeforeUnmount, watch, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Check, Connection } from '@element-plus/icons-vue'
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
import {
  apiWorkflowGet, apiWorkflowCreate, apiWorkflowUpdate,
  apiWorkflowEstimate, apiWorkflowRun, apiWorkflowRunStatus, apiWorkflowRunCancel, apiWorkflowRunEventsUrl
} from '@/api'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

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
let nid = 1
let loading = false // 载入期间抑制 dirty

const selectedNode = computed(() => (selectedId.value ? findNode(selectedId.value) : null))
const empty = ref(true)
const refreshEmpty = () => { empty.value = getNodes.value.length === 0 }

// 只负责空态刷新；真正的“是否脏”交给下面基于内容签名的 watch([getNodes, getEdges]) 统一判定
// （不能在这里无条件置脏——VueFlow 自身的内部事件，如初次渲染后的节点尺寸测量，也会触发
// nodes-change，若这里直接置 dirty=true，会导致刚打开一个未做任何编辑的工作流就显示“未保存”）
const markDirty = () => { if (!loading) refreshEmpty() }

// ---------- 选中 ----------
onNodeClick(({ node }) => { selectedId.value = node.id })
onPaneClick(() => { selectedId.value = '' })

// ---------- 连线校验 ----------
onConnect(conn => {
  if (conn.source === conn.target) return
  const src = findNode(conn.source), tgt = findNode(conn.target)
  if (!src || !tgt || !canConnect(src.type, tgt.type)) {
    return ElMessage.warning('这两个节点的接口类型不匹配，无法连接')
  }
  // 单输入：目标已有入边则先移除旧连线
  const dup = getEdges.value.filter(e => e.target === conn.target)
  if (dup.length) setEdges(getEdges.value.filter(e => e.target !== conn.target))
  addEdges([{ ...conn, animated: true }])
  dirty.value = true
})

// ---------- 拖拽落节点 ----------
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
  // 运行期画布必须真正只读：Delete 键已通过 :delete-key-code="running ? null : 'Delete'" 挡住，
  // 但 NodeInspector 的“删除”按钮走的是这个函数，同样需要拦截，否则运行中删除的节点会和后端
  // 正在跑的那份 graph_snapshot 快照对不上，RunPanel 里的状态圆点会指向一个已经不存在的节点。
  if (running.value) { ElMessage.warning('运行中无法编辑节点，请先取消运行'); return }
  removeNodes([id])
  if (selectedId.value === id) selectedId.value = ''
  delete nodeStatusMap[id]
  dirty.value = true
  refreshEmpty()
}

// ---------- 序列化 / 保存 ----------
// runStatus 是运行期临时展示状态（见 BaseNode.vue），绝不能混入持久化的节点数据
const buildGraph = () => ({
  version: 1,
  nodes: getNodes.value.map(n => {
    const { runStatus, ...cleanData } = n.data || {}
    return { id: n.id, type: n.type, position: n.position, data: cleanData }
  }),
  edges: getEdges.value.map(e => ({ id: e.id, source: e.source, target: e.target }))
})

// dirty 的“内容基线”：只对比 buildGraph() 清洗后的内容（不含运行期 runStatus 覆盖层），
// 见下方 watch([getNodes, getEdges]) 的说明
let lastGraphSignature = ''
const captureGraphSignature = () => { lastGraphSignature = JSON.stringify(buildGraph()) }

const save = async () => {
  if (!getNodes.value.length) return ElMessage.warning('画布为空，先拖入节点')
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
    ElMessage.success('已保存')
    scheduleEstimate()
  } catch (e) {
    if (e.code !== -1) ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ---------- 载入 ----------
const loadGraph = g => {
  loading = true
  setNodes((g.nodes || []).map(n => ({ ...n })))
  setEdges((g.edges || []).map(e => ({ ...e, animated: true })))
  // 恢复 id 计数器，避免新节点 id 撞车
  let max = 0
  for (const n of g.nodes || []) {
    const m = /-(\d+)$/.exec(n.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  nid = max + 1
  setTimeout(() => { loading = false; dirty.value = false; captureGraphSignature(); refreshEmpty(); scheduleEstimate() }, 0)
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
  } else {
    refreshEmpty()
    captureGraphSignature()
  }
})

watch(name, () => { if (!loading) dirty.value = true })

// =====================================================================
// ---------- 运行：预估成本 / 触发运行 / SSE 订阅（轮询兜底）/ 取消 ----------
// =====================================================================

const nodeCount = computed(() => getNodes.value.length)

// ---------- 预估成本（防抖自动刷新） ----------
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
    // 图不合法等情况下静默降级为 “--”，不打断用户编辑
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

// 节点/连线的任意变化（含 Inspector 中直接修改 node.data 字段，不经过 nodes-change 事件）都需要
// 重新估算，也需要标脏。不能简单地在这里恒置 dirty=true：运行期间 setNodeRunStatus/resetRunStatuses
// 会往 node.data 写入临时的 runStatus 展示字段（同样会触发这个 deep watch），那不算真实编辑——
// 画布在运行期间本来就是只读的（拖拽/连线/删除/Inspector 编辑均已禁用），这里额外跳过 running
// 期间的签名比对，避免每条 SSE 节点事件都重新 JSON.stringify 一次整张图。
watch([getNodes, getEdges], () => {
  if (loading || running.value) return
  scheduleEstimate()
  const sig = JSON.stringify(buildGraph())
  if (sig !== lastGraphSignature) {
    lastGraphSignature = sig
    dirty.value = true
  }
}, { deep: true })

// ---------- 运行状态管理 ----------
const TERMINAL_RUN_STATUSES = ['success', 'failed', 'canceled']
const RUN_PHASE_MAP = { pending: 'running', running: 'running', success: 'success', failed: 'failed', canceled: 'canceled' }

const runId = ref('')
const runPhase = ref('idle') // idle|running|success|failed|canceled
const running = computed(() => runPhase.value === 'running')
// 供 BaseNode.vue（图片输入节点的画布内上传/清除交互）注入读取，运行期间禁止再改图片
provide('wfRunning', running)
const nodeStatusMap = reactive({}) // nodeId -> { status, error, output }
const runOutputs = ref([]) // 本次运行最终产物（output 类型节点的结果），来自 done 事件
let es = null // EventSource
let pollTimer = null
let settled = true // 本次运行的终态是否已处理（防止重复退款提示 / 重复 toast）
// run() 里 await apiWorkflowRun 期间用户可能已经离开页面；组件卸载后绝不能再创建新的
// EventSource（否则它不会被任何后续的 onBeforeUnmount 关闭，会一直挂到该次运行自然结束为止）
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

// extra.output 是节点执行器的产物（如 { image, url }），success/cached 时才会有；
// 存进 nodeStatusMap 供 RunPanel 用，也写进 data.runStatus 供 BaseNode.vue 在节点卡片上直接
// 显示生成结果图（而不是只显示一个"成功"角标却看不到图在哪）
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
}

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
    } catch (e) { /* 单次轮询失败忽略，等待下一轮 */ }
  }, 1500)
}

const subscribeRun = rid => {
  closeEventSource()
  clearPollTimer()
  es = new EventSource(apiWorkflowRunEventsUrl(rid))
  es.addEventListener('snapshot', e => { try { applySnapshot(JSON.parse(e.data)) } catch (err) { /* 忽略解析异常 */ } })
  es.addEventListener('node', e => { try { applyNodeEvent(JSON.parse(e.data)) } catch (err) { /* 忽略解析异常 */ } })
  es.addEventListener('done', e => { try { applyDone(JSON.parse(e.data)) } catch (err) { /* 忽略解析异常 */ } })
  es.onerror = () => {
    if (settled) return
    closeEventSource()
    startPolling(rid) // SSE 断开时降级为轮询兜底
  }
}

const run = async () => {
  if (!getNodes.value.length || running.value) return
  if (dirty.value) {
    await save()
    if (dirty.value) return // 保存失败则中止运行（错误提示已在 save() 内弹出）
  }
  if (!wfId.value) return ElMessage.warning('请先保存工作流')

  closeEventSource()
  clearPollTimer()
  resetRunStatuses()
  settled = false
  runId.value = ''
  runPhase.value = 'running'
  try {
    const { runId: rid } = await apiWorkflowRun(wfId.value)
    if (unmounted) { return } // 响应回来前组件已卸载，不再订阅 SSE（见 onBeforeUnmount）
    runId.value = rid
    subscribeRun(rid)
  } catch (e) {
    settled = true
    runPhase.value = 'idle'
    // /run 的 429 有两种来源：算力不足（changeCredits 抛出）与请求过于频繁（wfRunLimit 限流），
    // 两者 HTTP/code 都是 429 但语义完全不同，必须靠 message 区分，不能一律当成“算力不足”弹窗，
    // 否则用户只是操作快了点也会被引导去充值。routes/workflow.js 里算力不足的提示文案固定包含
    // “算力不足”四个字，限流提示文案是“工作流运行请求太频繁，请稍后再试”，据此区分。
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
.wf-dirty { font-size: 12px; color: #e6a23c; }

.wf-main { flex: 1; display: flex; min-height: 0; }
.wf-side { width: 232px; flex: none; background: var(--mk-card); overflow-y: auto; }
.wf-left { border-right: 1px solid var(--mk-border); }
.wf-right { border-left: 1px solid var(--mk-border); width: 260px; }
.wf-canvas { flex: 1; position: relative; min-width: 0; background: var(--mk-bg); }
.wf-canvas :deep(.vue-flow) { background: var(--mk-bg); }

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
