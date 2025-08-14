/**
 * 极简发布订阅：工作流运行事件的 SSE 广播中枢。
 * 独立成文件是为了避免 engine.js 与 routes/workflow.js 互相 require 成环。
 */
const subscribers = new Map(); // runId -> Set<res>

function subscribe(runId, res) {
  if (!subscribers.has(runId)) subscribers.set(runId, new Set());
  subscribers.get(runId).add(res);
}

function unsubscribe(runId, res) {
  const set = subscribers.get(runId);
  if (!set) return;
  set.delete(res);
  if (!set.size) subscribers.delete(runId);
}

function publish(runId, event, data) {
  const set = subscribers.get(runId);
  if (!set || !set.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch (e) { /* 客户端已断开，忽略 */ }
  }
}

// 运行到达终态后关闭该 run 下所有 SSE 连接，避免连接空挂
function closeAll(runId) {
  const set = subscribers.get(runId);
  if (!set) return;
  for (const res of set) {
    try { res.end(); } catch (e) { /* 已断开，忽略 */ }
  }
  subscribers.delete(runId);
}

module.exports = { subscribe, unsubscribe, publish, closeAll };
