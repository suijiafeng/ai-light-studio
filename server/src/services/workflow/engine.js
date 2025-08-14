const crypto = require('crypto');
const db = require('../../db');
const { isPremium } = require('../credits');
const { analyzeGraph, nodeDef, stableStringify } = require('./nodeTypes');
const sseHub = require('./sseHub');
const refundNodeRun = db.transaction((nodeRunId, remark) => {
  const row = db.prepare('SELECT user_id, cost, refunded FROM node_runs WHERE id = ?').get(nodeRunId);
  if (!row || row.refunded || row.cost <= 0) return;
  const info = db.prepare('UPDATE node_runs SET refunded = 1 WHERE id = ? AND refunded = 0').run(nodeRunId);
  if (info.changes === 0) return; // 没抢到，说明已经被别处退过了
  const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(row.user_id);
  if (!userExists) {
    console.error(`[workflow engine] 退款失败：用户 ${row.user_id} 已不存在，node_run ${nodeRunId} 的 ${row.cost} 算力无法退还`);
    return;
  }
  require('../credits').changeCredits(row.user_id, row.cost, 'refund', remark);
});
function safeRefund(nodeRunId, remark, ctx) {
  try {
    refundNodeRun(nodeRunId, remark);
  } catch (e) {
    console.error(`[workflow engine] 退款异常，稍后可重试 ${ctx || ''} nodeRunId=${nodeRunId}`, e);
  }
}

function reclaimUnfinishedNodes(runId, remark) {
  const rows = db.prepare("SELECT id, node_id FROM node_runs WHERE run_id = ? AND status IN ('pending', 'running')").all(runId);
  const markSkipped = db.prepare("UPDATE node_runs SET status = 'skipped', finished_at = ? WHERE id = ?");
  const now = Date.now();
  for (const r of rows) {
    markSkipped.run(now, r.id);
    safeRefund(r.id, remark, `runId=${runId}`);
    sseHub.publish(runId, 'node', { nodeId: r.node_id, status: 'skipped', cost: 0 });
  }
}
function computeFingerprints(analysis, premium) {
  const fp = new Map();
  for (const nodeId of analysis.order) {
    const node = analysis.nodesById.get(nodeId);
    const incoming = analysis.incomingByTarget.get(nodeId).slice().sort((a, b) => a.source.localeCompare(b.source));
    const upstreamPart = incoming.map(e => fp.get(e.source)).join('|');
    const raw = `${node.type}::${premium ? '1' : '0'}::${stableStringify(node.data)}::${upstreamPart}`;
    fp.set(nodeId, crypto.createHash('sha256').update(raw).digest('hex'));
  }
  return fp;
}
function safeErrorMessage(err, fallback) {
  if (err && err.safe === true && typeof err.message === 'string' && err.message) return err.message;
  return fallback;
}
function emitDone(runId, data) {
  sseHub.publish(runId, 'done', data);
  sseHub.closeAll(runId);
}

function failRun(runId, errMsg) {
  db.prepare("UPDATE workflow_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?")
    .run(errMsg, Date.now(), runId);
  reclaimUnfinishedNodes(runId, '工作流执行失败，退还未执行节点算力');
  emitDone(runId, { status: 'failed', error: errMsg });
}
async function runOneNode({ runId, nodeId, node, fingerprint, nodeRunId, nodeCost, incoming, outputsByNode, userId, premium }) {
  const def = nodeDef(node.type);
  const upstream = {};
  for (const e of incoming) {
    const up = outputsByNode.get(e.source);
    if (up) Object.assign(upstream, up);
  }
  if (def.cacheable) {
    const hit = db.prepare(
      "SELECT * FROM node_runs WHERE user_id = ? AND cache_key = ? AND status = 'success' ORDER BY finished_at DESC LIMIT 1"
    ).get(userId, fingerprint);
    if (hit) {
      const now = Date.now();
      db.prepare("UPDATE node_runs SET status = 'cached', cache_key = ?, output = ?, started_at = ?, finished_at = ? WHERE id = ?")
        .run(fingerprint, hit.output, now, now, nodeRunId);
      safeRefund(nodeRunId, '命中缓存，退还算力', `runId=${runId}`);
      let output = null;
      try { output = JSON.parse(hit.output || '{}'); } catch (e) {  }
      if (output != null) outputsByNode.set(nodeId, output);
      sseHub.publish(runId, 'node', { nodeId, status: 'cached', output, cost: 0 });
      return { status: 'cached' };
    }
  }

  const startedAt = Date.now();
  db.prepare("UPDATE node_runs SET status = 'running', cache_key = ?, started_at = ? WHERE id = ?")
    .run(fingerprint, startedAt, nodeRunId);
  sseHub.publish(runId, 'node', { nodeId, status: 'running' });

  try {
    const output = await def.execute(node.data, { runId, nodeId, userId, upstream, premium });
    db.prepare("UPDATE node_runs SET status = 'success', output = ?, finished_at = ? WHERE id = ?")
      .run(JSON.stringify(output == null ? {} : output), Date.now(), nodeRunId);
    outputsByNode.set(nodeId, output == null ? {} : output);
    sseHub.publish(runId, 'node', { nodeId, status: 'success', output, cost: nodeCost });
    return { status: 'success' };
  } catch (err) {
    console.error(`[workflow engine] 节点执行异常 runId=${runId} nodeId=${nodeId}`, err);
    const msg = safeErrorMessage(err, '节点执行失败，请稍后重试');
    db.prepare("UPDATE node_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?")
      .run(msg, Date.now(), nodeRunId);
    safeRefund(nodeRunId, '节点执行失败，退还算力', `runId=${runId}`);
    sseHub.publish(runId, 'node', { nodeId, status: 'failed', error: msg, cost: 0 });
    return { status: 'failed', error: msg };
  }
}
async function executeRun(runId) {
  try {
    await executeRunInner(runId);
  } catch (err) {
    console.error('[workflow engine] executeRun 调度异常，run 标记为失败并退还未执行节点算力', err);
    try {
      failRun(runId, safeErrorMessage(err, '工作流调度异常'));
    } catch (e2) {
      console.error('[workflow engine] failRun 兜底本身也失败了', e2);
    }
  }
}

async function executeRunInner(runId) {
  const run = db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(runId);
  if (!run) return;

  let graph;
  try { graph = JSON.parse(run.graph_snapshot); } catch (e) {
    return failRun(runId, '工作流数据损坏，无法执行');
  }
  const analysis = analyzeGraph(graph);
  if (!analysis.valid) return failRun(runId, analysis.error);
  db.prepare("UPDATE workflow_runs SET status = 'running' WHERE id = ? AND status = 'pending'").run(runId);

  const premium = isPremium(run.user_id);
  const fingerprints = computeFingerprints(analysis, premium);
  const outputsByNode = new Map(); // nodeId -> 输出对象，供下游节点 ctx.upstream 使用

  const nodeRunRows = db.prepare('SELECT * FROM node_runs WHERE run_id = ?').all(runId);
  const nodeRunByNodeId = new Map(nodeRunRows.map(r => [r.node_id, r]));
  const indegree = new Map(analysis.indegree);

  while (true) {
    const cur = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(runId);
    if (!cur) return;
    if (cur.status === 'canceled') {
      reclaimUnfinishedNodes(runId, '工作流已取消，退还未执行节点算力');
      db.prepare("UPDATE workflow_runs SET finished_at = ? WHERE id = ?").run(Date.now(), runId);
      emitDone(runId, { status: 'canceled' });
      return;
    }
    if (cur.status === 'failed' || cur.status === 'success') return; // 防御：不应发生

    const ready = [...nodeRunByNodeId.entries()]
      .filter(([nodeId, r]) => r.status === 'pending' && (indegree.get(nodeId) || 0) === 0)
      .map(([nodeId]) => nodeId);
    if (!ready.length) break;

    const results = await Promise.all(ready.map(nodeId => runOneNode({
      runId,
      nodeId,
      node: analysis.nodesById.get(nodeId),
      fingerprint: fingerprints.get(nodeId),
      nodeRunId: nodeRunByNodeId.get(nodeId).id,
      nodeCost: nodeRunByNodeId.get(nodeId).cost,
      incoming: analysis.incomingByTarget.get(nodeId),
      outputsByNode,
      userId: run.user_id,
      premium
    })));

    let failure = null;
    ready.forEach((nodeId, i) => {
      const result = results[i];
      if (result.status === 'failed') { failure = result; return; }
      for (const down of analysis.adjacency.get(nodeId) || []) {
        indegree.set(down, indegree.get(down) - 1);
      }
    });
    for (const nodeId of ready) {
      nodeRunByNodeId.set(nodeId, db.prepare('SELECT * FROM node_runs WHERE id = ?').get(nodeRunByNodeId.get(nodeId).id));
    }

    if (failure) {
      const curAfterBatch = db.prepare('SELECT status FROM workflow_runs WHERE id = ?').get(runId);
      if (curAfterBatch && curAfterBatch.status === 'canceled') {
        reclaimUnfinishedNodes(runId, '工作流已取消，退还未执行节点算力');
        db.prepare("UPDATE workflow_runs SET finished_at = ? WHERE id = ?").run(Date.now(), runId);
        emitDone(runId, { status: 'canceled' });
        return;
      }
      db.prepare("UPDATE workflow_runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?")
        .run(failure.error || '节点执行失败', Date.now(), runId);
      reclaimUnfinishedNodes(runId, '工作流执行失败，退还未执行节点算力');
      emitDone(runId, { status: 'failed', error: failure.error });
      return;
    }
  }
  const stillPending = db.prepare("SELECT COUNT(*) c FROM node_runs WHERE run_id = ? AND status = 'pending'").get(runId).c;
  if (stillPending > 0) {
    return failRun(runId, '调度异常：存在无法解锁的节点');
  }
  const finalRows = db.prepare('SELECT * FROM node_runs WHERE run_id = ?').all(runId);
  const outputs = [];
  for (const r of finalRows) {
    const node = analysis.nodesById.get(r.node_id);
    if (node && node.type === 'output' && (r.status === 'success' || r.status === 'cached') && r.output) {
      try { outputs.push({ nodeId: r.node_id, ...JSON.parse(r.output) }); } catch (e) {  }
    }
  }
  db.prepare("UPDATE workflow_runs SET status = 'success', outputs = ?, finished_at = ? WHERE id = ?")
    .run(JSON.stringify(outputs), Date.now(), runId);
  emitDone(runId, { status: 'success', outputs });
}

module.exports = { executeRun, reclaimUnfinishedNodes };
