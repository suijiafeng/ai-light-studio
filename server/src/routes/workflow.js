const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');
const config = require('../config');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { changeCredits } = require('../services/credits');
const { analyzeGraph, nodeDef } = require('../services/workflow/nodeTypes');
const { executeRun, reclaimUnfinishedNodes } = require('../services/workflow/engine');
const sseHub = require('../services/workflow/sseHub');

const router = express.Router();
const wfRunLimit = rateLimit({ windowMs: 60 * 1000, max: 15, key: 'wfrun', message: '工作流运行请求太频繁，请稍后再试' });
// /estimate 比 /run 宽松得多：前端画布编辑时按700ms防抖自动触发，正常交互每分钟可能达到几十次，
// 这里给一个明显高于正常交互频率、但仍能挡住"无限次构造大图轮询估算"这类CPU消耗型滥用的上限。
const wfEstimateLimit = rateLimit({ windowMs: 60 * 1000, max: 40, key: 'wfestimate', message: '预估请求太频繁，请稍后再试' });

// ---------- 启动恢复：上次进程退出时卡在 pending/running 的工作流运行，标记失败并退还未执行节点算力 ----------
(() => {
  const stale = db.prepare("SELECT id FROM workflow_runs WHERE status IN ('pending', 'running')").all();
  if (!stale.length) return;
  const mark = db.prepare("UPDATE workflow_runs SET status = 'failed', error = '服务重启导致任务中断', finished_at = ? WHERE id = ?");
  for (const r of stale) {
    mark.run(Date.now(), r.id);
    reclaimUnfinishedNodes(r.id, '服务重启导致任务中断，退还算力');
  }
  console.log(`ℹ️  已清理 ${stale.length} 个中断的工作流运行`);
})();

// 工作流图结构校验：{ nodes:[], edges:[] }，节点/连线需含必要字段
function validateGraph(graph) {
  if (!graph || typeof graph !== 'object') return '工作流数据格式错误';
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return '缺少 nodes 或 edges';
  if (graph.nodes.length > 200) return '节点数量超出上限（200）';
  for (const n of graph.nodes) {
    if (!n || typeof n.id !== 'string' || typeof n.type !== 'string') return '节点缺少 id 或 type';
  }
  for (const e of graph.edges) {
    if (!e || typeof e.source !== 'string' || typeof e.target !== 'string') return '连线缺少 source 或 target';
  }
  return null;
}

// 统一 DB 行 → 前端结构
const toDto = row => ({
  id: row.id,
  name: row.name,
  graph: JSON.parse(row.graph),
  thumbnail: row.thumbnail || '',
  shareId: row.share_id || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// ---------- 我的工作流列表（不含 graph，减小体积） ----------
router.get('/', auth, (req, res) => {
  const rows = db.prepare(
    'SELECT id, name, thumbnail, created_at, updated_at FROM workflows WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id);
  return ok(res, {
    list: rows.map(r => ({
      id: r.id, name: r.name, thumbnail: r.thumbnail || '',
      createdAt: r.created_at, updatedAt: r.updated_at
    }))
  });
});

// ---------- 新建 ----------
router.post('/', auth, (req, res) => {
  const { name, graph, thumbnail } = req.body || {};
  const err = validateGraph(graph);
  if (err) return fail(res, 400, err);
  const now = Date.now();
  const id = uuid();
  db.prepare(
    'INSERT INTO workflows (id, user_id, name, graph, thumbnail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user.id, (name || '未命名工作流').slice(0, 60), JSON.stringify(graph), thumbnail || null, now, now);
  return ok(res, { id });
});

// ---------- 读取单个 ----------
router.get('/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return fail(res, 404, '工作流不存在');
  return ok(res, toDto(row));
});

// ---------- 更新 ----------
router.put('/:id', auth, (req, res) => {
  const row = db.prepare('SELECT id FROM workflows WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return fail(res, 404, '工作流不存在');
  const { name, graph, thumbnail } = req.body || {};
  if (graph !== undefined) {
    const err = validateGraph(graph);
    if (err) return fail(res, 400, err);
  }
  const cur = db.prepare('SELECT name, graph, thumbnail FROM workflows WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE workflows SET name = ?, graph = ?, thumbnail = ?, updated_at = ? WHERE id = ?').run(
    name !== undefined ? String(name).slice(0, 60) : cur.name,
    graph !== undefined ? JSON.stringify(graph) : cur.graph,
    thumbnail !== undefined ? thumbnail : cur.thumbnail,
    Date.now(),
    req.params.id
  );
  return ok(res, {});
});

// ---------- 删除 ----------
router.delete('/:id', auth, (req, res) => {
  const info = db.prepare('DELETE FROM workflows WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) return fail(res, 404, '工作流不存在');
  return ok(res, {});
});

// =================== M2 执行引擎：估算 / 运行 / 查询 / 取消 / SSE ===================

const toRunDto = r => ({
  id: r.id,
  workflowId: r.workflow_id,
  status: r.status,
  cost: r.cost,
  outputs: r.outputs ? JSON.parse(r.outputs) : null,
  error: r.error || null,
  createdAt: r.created_at,
  finishedAt: r.finished_at || null
});

const toNodeRunDto = n => ({
  id: n.id,
  nodeId: n.node_id,
  type: n.type,
  status: n.status,
  output: n.output ? JSON.parse(n.output) : null,
  cost: n.cost,
  error: n.error || null,
  startedAt: n.started_at || null,
  finishedAt: n.finished_at || null
});

// ---------- 预估成本 ----------
router.post('/:id/estimate', auth, wfEstimateLimit, (req, res) => {
  const wf = db.prepare('SELECT id FROM workflows WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!wf) return fail(res, 404, '工作流不存在');
  const analysis = analyzeGraph((req.body || {}).graph);
  if (!analysis.valid) return fail(res, 400, analysis.error);
  const perNode = [...analysis.nodesById.values()].map(n => ({ nodeId: n.id, cost: nodeDef(n.type).cost(n.data) }));
  const total = perNode.reduce((s, n) => s + n.cost, 0);
  return ok(res, { total, perNode });
});

// ---------- 运行当前已保存的工作流 ----------
router.post('/:id/run', auth, wfRunLimit, (req, res) => {
  const wf = db.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!wf) return fail(res, 404, '工作流不存在');

  let graph;
  try { graph = JSON.parse(wf.graph); } catch (e) { return fail(res, 400, '工作流数据损坏'); }
  const analysis = analyzeGraph(graph);
  if (!analysis.valid) return fail(res, 400, analysis.error);

  const nodeList = [...analysis.nodesById.values()];
  const perNode = nodeList.map(n => ({ nodeId: n.id, type: n.type, cost: nodeDef(n.type).cost(n.data) }));
  const total = perNode.reduce((s, n) => s + n.cost, 0);

  let runId;
  try {
    // 扣费 + 建 run + 建 node_runs 放同一事务：任一环节失败（尤其算力不足）整体回滚，不留孤儿记录
    runId = db.transaction(() => {
      changeCredits(req.user.id, -total, 'consume', `工作流运行消耗${total}算力`);
      const id = uuid();
      db.prepare('INSERT INTO workflow_runs (id, workflow_id, user_id, graph_snapshot, status, cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, wf.id, req.user.id, JSON.stringify(graph), 'pending', total, Date.now());
      const insertNode = db.prepare('INSERT INTO node_runs (id, run_id, user_id, node_id, type, status, cost) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const n of perNode) insertNode.run(uuid(), id, req.user.id, n.nodeId, n.type, 'pending', n.cost);
      return id;
    })();
  } catch (e) {
    if (e.code === 429) return fail(res, 429, `算力不足，本次运行需${total}算力，请充值`);
    throw e;
  }

  // 异步执行，不阻塞响应；引擎内部自身的异常兜底已经把 run 标为 failed 并退款，这里只兜底日志
  executeRun(runId).catch(err => console.error('[workflow engine] executeRun 未捕获异常', err));
  return ok(res, { runId });
});

// ---------- 轮询兜底：运行详情 ----------
router.get('/run/:runId', auth, (req, res) => {
  const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ? AND user_id = ?').get(req.params.runId, req.user.id);
  if (!run) return fail(res, 404, '运行记录不存在');
  const nodes = db.prepare('SELECT * FROM node_runs WHERE run_id = ?').all(run.id);
  return ok(res, { run: toRunDto(run), nodes: nodes.map(toNodeRunDto) });
});

// ---------- 取消运行（只翻状态标志，真正的退款交给引擎下一次调度 tick 处理，避免竞态双重退款） ----------
router.post('/run/:runId/cancel', auth, (req, res) => {
  const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ? AND user_id = ?').get(req.params.runId, req.user.id);
  if (!run) return fail(res, 404, '运行记录不存在');
  if (['success', 'failed', 'canceled'].includes(run.status)) return fail(res, 400, '该运行已结束，无法取消');
  db.prepare("UPDATE workflow_runs SET status = 'canceled' WHERE id = ?").run(run.id);
  return ok(res, {});
});

// ---------- SSE：节点级实时进度 ----------
// EventSource 无法携带自定义 header，鉴权改走 query token；鉴权失败必须在 writeHead 之前
// 以普通 JSON 响应返回，不能把错误也塞进 event-stream。
router.get('/run/:runId/events', (req, res) => {
  const token = req.query.token;
  if (!token) return fail(res, 401, '未登录或登录已过期');
  let payload;
  try {
    payload = jwt.verify(String(token), config.jwtSecret);
  } catch (e) {
    return fail(res, 401, '未登录或登录已过期');
  }
  const user = db.prepare('SELECT id, banned FROM users WHERE id = ?').get(payload.uid);
  if (!user) return fail(res, 401, '用户不存在');
  if (user.banned) return fail(res, 403, '账号已被封禁');
  const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ? AND user_id = ?').get(req.params.runId, user.id);
  if (!run) return fail(res, 404, '运行记录不存在');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (res.flushHeaders) res.flushHeaders();

  const nodes = db.prepare('SELECT * FROM node_runs WHERE run_id = ?').all(run.id);
  res.write(`event: snapshot\ndata: ${JSON.stringify({ run: toRunDto(run), nodes: nodes.map(toNodeRunDto) })}\n\n`);

  sseHub.subscribe(run.id, res);
  req.on('close', () => sseHub.unsubscribe(run.id, res));
});

module.exports = router;
