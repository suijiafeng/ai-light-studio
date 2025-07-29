const config = require('./config');
const app = require('./app');

// 全局兜底：任何未捕获的异步异常/Promise拒绝只记录日志，绝不让进程崩溃退出
// （Express4 不接管 async handler 的 rejection，缺此兜底会被单个坏请求打挂整台服务）
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});

app.listen(config.port, () => {
  console.log(`AI灯光设计服务已启动: http://localhost:${config.port}`);
  console.log(`   AI模式: ${config.ai.provider} | 支付模式: ${config.pay.provider}`);
});
