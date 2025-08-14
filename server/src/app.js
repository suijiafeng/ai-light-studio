const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const db = require('./db'); // 初始化数据库

const { router: authRouter } = require('./routes/auth');
const generateRouter = require('./routes/generate');
const creditsRouter = require('./routes/credits');
const payRouter = require('./routes/pay');
const statsRouter = require('./routes/stats');
const { fail, ok } = require('./utils/response');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(config.uploadDir));
app.use('/results', express.static(config.resultDir));

app.get('/api/health', (req, res) => ok(res, { status: 'ok', time: Date.now() }));
app.use('/api/auth', authRouter);
app.use('/api/generate', generateRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/pay', payRouter);
app.use('/api/stats', statsRouter);
app.use('/api/keys', require('./routes/keys'));
app.use('/api/workflow', require('./routes/workflow'));
const { rateLimit } = require('./middleware/rateLimit');
const { logError } = require('./services/errlog');
app.post('/api/log/error', rateLimit({ windowMs: 60000, max: 10, key: 'errlog' }), (req, res) => {
  const { message, stack, url } = req.body || {};
  if (message) logError({ source: 'web', message, stack, url });
  return ok(res, {});
});
app.use('/api', (req, res) => fail(res, 404, '接口不存在'));
const distDir = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  const escapeHtml = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  app.get('/s/:shareId', (req, res) => {
    let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const g = db.prepare('SELECT * FROM generations WHERE share_id = ?').get(req.params.shareId);
    if (g && g.status === 'success') {
      const u = db.prepare('SELECT nickname FROM users WHERE id = ?').get(g.user_id);
      const base = escapeHtml(`${req.protocol}://${req.get('host')}`);
      const title = escapeHtml(`${u?.nickname || '设计师'}的AI灯光设计作品`);
      const og = [
        `<meta property="og:title" content="${title}" />`,
        `<meta property="og:description" content="上传照片，AI一键重绘空间灯光效果，注册即送免费算力" />`,
        `<meta property="og:image" content="${base}/results/${escapeHtml(g.result_path)}" />`,
        `<meta property="og:url" content="${base}/s/${escapeHtml(req.params.shareId)}" />`,
        `<meta property="og:type" content="website" />`
      ].join('\n  ');
      html = html.replace('</head>', `  ${og}\n</head>`);
    }
    res.type('html').send(html);
  });

  app.get(/^(?!\/api|\/uploads|\/results).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}
const IS_PROD = process.env.NODE_ENV === 'production'
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  logError({ source: 'server', message: err.message, stack: err.stack, url: req.originalUrl, userId: req.user?.id });
  return fail(res, 500, IS_PROD ? '服务异常，请稍后重试' : (err.message || '服务异常'));
});

module.exports = app;
