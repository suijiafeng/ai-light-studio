/**
 * 工作流 DAG 执行引擎。
 * 调度循环：每轮找出"入度为0且仍是pending"的节点(ready)，并发执行（execute 内部经共享
 * genQueue 限流），成功/缓存命中后解锁下游，任何一个失败则整条 run 失败并把剩余 pending
 * 节点标 skipped + 退款；全部完成则聚合 output 节点产物写回 run。
 */
const crypto = require('crypto');
const db = require('../../db');
const { isPremium } = require('../credits');
const { analyzeGraph, nodeDef, stableStringify } = require('./nodeTypes');
const sseHub = require('./sseHub');

// 幂等退款：同一节点的算力只能被退还一次（cache命中退款 / 失败清算退款 / 取消退款 / 启动恢复退款 共用同一函数）
// 注意：changeCredits 抛出的任何异常都不在这里吞掉——本函数整体是一个 db.transaction，
// 异常会让 SAVEPOINT 回滚，连同上面刚写入的 refunded=1 一起撤销，保证“退款标记已落地”与
// “余额真的变了”这两件事同生共死；如果在这里 catch 掉，refunded=1 会被错误地保留，这笔钱
// 就再也没有任何路径可以重试退还了。调用方负责 try/catch 记录日志、决定是否继续后续流程。
const refundNodeRun = db.transaction((nodeRunId, remark) => {
  const row = db.prepare('SELECT user_id, cost, refunded FROM node_runs WHERE id = ?').get(nodeRunId);
  if (!row || row.refunded || row.cost <= 0) return;
  const info = db.prepare('UPDATE node_runs SET refunded = 1 WHERE id = ? AND refunded = 0').run(nodeRunId);
  if (info.changes === 0) return; // 没抢到，说明已经被别处退过了
  const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(row.user_id);
  if (!userExists) {
    // 用户已注销/被管理员删除：属于不可恢复场景，记录日志后放弃退款（不再往外抛，避免无意义重试）
    console.error(`[workflow engine] 退款失败：用户 ${row.user_id} 已不存在，node_run ${nodeRunId} 的 ${row.cost} 算力无法退还`);
    return;
  }
  require('../credits').changeCredits(row.user_id, row.cost, 'refund', remark);
});

// refundNodeRun 的安全调用包装：吞掉异常仅用于不中断调度流程，但会打日志留痕，且不会
// 误标 refunded（异常已经在 refundNodeRun 内部通过事务回滚撤销了 refunded=1 的写入，下次
// 调用本函数会自然重试）。
function safeRefund(nodeRunId, remark, ctx) {
  try {
    refundNodeRun(nodeRunId, remark);
  } catch (e) {
    console.error(`[workflow engine] 退款异常，稍后可重试 ${ctx || ''} nodeRunId=${nodeRunId}`, e);
  }
}

/**
 * 把某个 run 下所有尚未到终态（pending/running）的 node_runs 标 skipped 并退款。
 * 供正常调度循环（取消/失败清算）与服务重启启动恢复共用。
 */
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

// 计算每个节点的缓存指纹：sha256(type + premium档位 + data + 按source id排序拼接的上游指纹)，
// 上游变了链式失效。必须把 premium 计入指纹：relight 节点的实际出图质量（分辨率/是否加水印）
// 由 premium 决定（见 ai.js finalizeImage），若不计入，用户会员状态变化前后重跑同一工作流会
// 错误复用另一档位的旧产物（见 executeRunInner 调用处）。
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

// 错误信息脱敏：只有节点执行器显式标记为 safe=true 的错误（面向用户的中文提示，如"图片输入节点
// 尚未上传图片"）才会原样落库/广播给客户端；其余一律替换为通用提示，避免把服务器文件路径、第三方
// AI 接口的原始响应体等内部信息通过 node_runs.error / SSE 事件泄露出去。原始异常仍会完整打到服务端日志。
function safeErrorMessage(err, fallback) {
  if (err && err.safe === true && typeof err.message === 'string' && err.message) return err.message;
  return fallback;
}

// 推送最终 done 事件后关闭该 run 下所有 SSE 连接，避免运行结束后连接空挂
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

// 执行单个就绪节点：命中缓存直接复用；未命中则调用节点执行器，成功/失败落库并广播 SSE
async function runOneNode({ runId, nodeId, node, fingerprint, nodeRunId, nodeCost, incoming, outputsByNode, userId, premium }) {
  const def = nodeDef(node.type);
  const upstream = {};
  for (const e of incoming) {
    const up = outputsByNode.get(e.source);
    if (up) Object.assign(upstream, up);
  }

  // 缓存命中：仅复用同用户此前"成功执行"过的节点产物（不复用cached，避免链式复用的不确定性）
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
      try { output = JSON.parse(hit.output || '{}'); } catch (e) { /* ignore */ }
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
    // 与 routes/generate.js 单张生成失败必退款的既有约定保持一致：节点执行失败时，该节点自身
    // 已扣的算力也必须退还，不能只靠 reclaimUnfinishedNodes（它只处理仍是 pending/running 的
    // 节点，此时该节点状态已经是 failed，不会被那条 SQL 选中）。
    safeRefund(nodeRunId, '节点执行失败，退还算力', `runId=${runId}`);
    sseHub.publish(runId, 'node', { nodeId, status: 'failed', error: msg, cost: 0 });
    return { status: 'failed', error: msg };
  }
}

// executeRun 的对外入口：包一层安全网。调度逻辑本身（非节点执行，节点执行的异常已在 runOneNode
// 内部捕获）如果抛出未预料的异常（例如 DB 写入失败），必须保证 run 仍然会被标失败并退还未执行节点的
// 算力，否则这笔钱会一直卡在"已扣费但既不成功也不失败"的状态，只能等服务重启靠启动恢复兜底。
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

  // 纵深防御：路由已校验过一次，这里引擎自己再校验一遍，同一份 analyzeGraph 两处调用
  const analysis = analyzeGraph(graph);
  if (!analysis.valid) return failRun(runId, analysis.error);

  // pending → running；条件更新避免覆盖掉执行开始前就已经被 /cancel 置为 canceled 的状态
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
    // 重新读取本轮涉及节点最新状态，供下一轮 ready 判断
    for (const nodeId of ready) {
      nodeRunByNodeId.set(nodeId, db.prepare('SELECT * FROM node_runs WHERE id = ?').get(nodeRunByNodeId.get(nodeId).id));
    }

    if (failure) {
      // 本批节点在并发执行期间，用户可能通过 /cancel 把 status 改成了 canceled（与本次调度 tick
      // 是两条独立异步流程）。用户主动取消的意图应当优先于系统判定的失败，不能被无条件覆盖成
      // failed；这里重新读取一次最新状态，行为与上面 while 循环顶部对 cur.status === 'canceled'
      // 的取消收尾逻辑保持一致。
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

  // 防御性兜底：正常情况下 analyzeGraph 已保证有效 DAG，不应出现无法解锁的剩余节点
  const stillPending = db.prepare("SELECT COUNT(*) c FROM node_runs WHERE run_id = ? AND status = 'pending'").get(runId).c;
  if (stillPending > 0) {
    return failRun(runId, '调度异常：存在无法解锁的节点');
  }

  // 全部到终态且没有失败：聚合 output 节点产物写回 run
  const finalRows = db.prepare('SELECT * FROM node_runs WHERE run_id = ?').all(runId);
  const outputs = [];
  for (const r of finalRows) {
    const node = analysis.nodesById.get(r.node_id);
    if (node && node.type === 'output' && (r.status === 'success' || r.status === 'cached') && r.output) {
      try { outputs.push({ nodeId: r.node_id, ...JSON.parse(r.output) }); } catch (e) { /* ignore */ }
    }
  }
  db.prepare("UPDATE workflow_runs SET status = 'success', outputs = ?, finished_at = ? WHERE id = ?")
    .run(JSON.stringify(outputs), Date.now(), runId);
  emitDone(runId, { status: 'success', outputs });
}

module.exports = { executeRun, reclaimUnfinishedNodes };
