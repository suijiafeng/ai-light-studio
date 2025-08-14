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
    try { res.write(payload); } catch (e) {  }
  }
}
function closeAll(runId) {
  const set = subscribers.get(runId);
  if (!set) return;
  for (const res of set) {
    try { res.end(); } catch (e) {  }
  }
  subscribers.delete(runId);
}

module.exports = { subscribe, unsubscribe, publish, closeAll };
