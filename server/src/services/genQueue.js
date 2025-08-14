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
