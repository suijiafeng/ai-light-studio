const config = require('./config');
const app = require('./app');
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
