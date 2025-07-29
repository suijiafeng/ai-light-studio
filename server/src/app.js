/**
 * Express 应用（不含监听），便于单元测试直接引入
 */
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

// 静态资源：源图 / 生成结果
app.use('/uploads', express.static(config.uploadDir));
app.use('/results', express.static(config.resultDir));

app.get('/api/health', (req, res) => ok(res, { status: 'ok', time: Date.now() }));
app.use('/api/auth', authRouter);
app.use('/api/generate', generateRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/pay', payRouter);
app.use('/api/stats', statsRouter);
app.use('/api/keys', require('./routes/keys'));

// 前端错误上报（限流防刷）
const { rateLimit } = require('./middleware/rateLimit');
const { logError } = require('./services/errlog');
app.post('/api/log/error', rateLimit({ windowMs: 60000, max: 10, key: 'errlog' }), (req, res) => {
  const { message, stack, url } = req.body || {};
  if (message) logError({ source: 'web', message, stack, url });
  return ok(res, {});
});

// 404
app.use('/api', (req, res) => fail(res, 404, '接口不存在'));

// 生产模式：托管前端打包产物（web/dist）
const distDir = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));

  // HTML属性转义：昵称等用户可控内容注入OG标签前必须转义，防存储型XSS（"><script>…）
  const escapeHtml = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // 分享页注入OG标签（微信/QQ/微博分享显示卡片预览）
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

// 全局错误兜底（落库便于线上排查）
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  logError({ source: 'server', message: err.message, stack: err.stack, url: req.originalUrl, userId: req.user?.id });
  return fail(res, 500, err.message || '服务异常');
});

module.exports = app;
