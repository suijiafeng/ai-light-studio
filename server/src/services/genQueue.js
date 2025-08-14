/**
 * 共享出图并发限流队列
 * 从 routes/generate.js 搬迁至此：普通生成（单张/连拍/批量）与工作流引擎的 relight 节点
 * 必须共用同一个队列，否则两条路径分别限流会导致实际并发数超过 GEN_CONCURRENCY 这个全局约束。
 */
const MAX_CONCURRENT = Math.max(1, Number(process.env.GEN_CONCURRENCY || 3));
let running = 0;
const pending = [];

function enqueueGen(task) {
  return new Promise((resolve, reject) => {
    pending.push({ task, resolve, reject });
    drainQueue();
  });
}

function drainQueue() {
  while (running < MAX_CONCURRENT && pending.length) {
    const { task, resolve, reject } = pending.shift();
    running++;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => { running--; drainQueue(); });
  }
}

module.exports = { enqueueGen };
