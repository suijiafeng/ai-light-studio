const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuid } = require('uuid');
const db = require('../db');
const config = require('../config');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');
const { changeCredits, isPremium } = require('../services/credits');
const { relight, STYLE_PRESETS, DIRECTIONS } = require('../services/ai');
const { rateLimit } = require('../middleware/rateLimit');
const { enqueueGen } = require('../services/genQueue');

const router = express.Router();
const genLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: 'gen', message: '生成请求太频繁，请稍后再试' });

// ---------- 启动恢复：上次进程退出时卡在 processing 的任务，标记失败并退还算力 ----------
(() => {
  const stale = db.prepare("SELECT id, user_id, cost FROM generations WHERE status = 'processing'").all();
  if (!stale.length) return;
  const mark = db.prepare("UPDATE generations SET status = 'failed', error = '服务重启导致任务中断', finished_at = ? WHERE id = ?");
  let refunded = 0;
  for (const g of stale) {
    mark.run(Date.now(), g.id);
    // 逐条退款：用户可能已注销（changeCredits 会抛"用户不存在"），单条失败不影响其余
    if (g.cost > 0) {
      try { changeCredits(g.user_id, g.cost, 'refund', '任务中断退还算力'); refunded++; } catch (e) { /* 用户已不存在，跳过 */ }
    }
  }
  console.log(`ℹ️  已清理 ${stale.length} 个中断的生成任务，退还 ${refunded} 笔算力`);
})();

// 参数校验，返回错误信息或null
function validateParams(params) {
  if (params.style && !STYLE_PRESETS[params.style]) return '无效的灯光风格';
  if (params.direction && !DIRECTIONS[params.direction]) return '无效的光源方向';
  const b = Number(params.brightness), t = Number(params.colorTemp);
  if (params.brightness != null && (isNaN(b) || b < 0 || b > 100)) return '亮度参数需在0-100之间';
  if (params.colorTemp != null && (isNaN(t) || t < 2000 || t > 8000)) return '色温参数需在2000-8000K之间';
  return null;
}

// ---------- 图片上传（多层校验） ----------
const MAX_FILE_MB = 15;          // 单文件大小上限
const MIN_EDGE = 64;             // 最小边长（px），过小无法出图
const MAX_EDGE = 8192;           // 最大边长（px），防超大图拖垮服务
const MAX_PIXELS = 40e6;         // 最大总像素（4000万，防解压炸弹）
const ALLOW_FORMATS = ['jpeg', 'png', 'webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    // 扩展名不可信，先落临时名，内容校验后按真实格式重命名
    cb(null, `tmp-${uuid()}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    // 第一层：mimetype 预检（可伪造，仅做快速拦截）
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 JPG / PNG / WEBP 格式图片'));
  }
});

const safeUnlink = p => { try { fs.unlinkSync(p); } catch (e) {} };

const uploadLimit = rateLimit({ windowMs: 60 * 1000, max: 30, key: 'upload', message: '上传太频繁，请稍后再试' });

router.post('/upload', auth, uploadLimit, (req, res) => {
  upload.single('file')(req, res, async err => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `图片不能超过${MAX_FILE_MB}MB` : (err.message || '上传失败');
      return fail(res, 400, msg);
    }
    if (!req.file) return fail(res, 400, '请选择图片文件');

    const tmpPath = req.file.path;
    try {
      // 第二层：内容嗅探——用sharp解析真实格式与尺寸，伪装成图片的文件在这里被拒
      const sharp = require('sharp');
      const meta = await sharp(tmpPath, { limitInputPixels: MAX_PIXELS }).metadata();
      if (!ALLOW_FORMATS.includes(meta.format)) {
        safeUnlink(tmpPath);
        return fail(res, 400, `文件内容不是有效的图片格式（检测到: ${meta.format || '未知'}），仅支持 JPG / PNG / WEBP`);
      }
      const w = meta.width || 0, h = meta.height || 0;
      if (w < MIN_EDGE || h < MIN_EDGE) {
        safeUnlink(tmpPath);
        return fail(res, 400, `图片尺寸过小（${w}×${h}），最小需 ${MIN_EDGE}×${MIN_EDGE} 像素`);
      }
      if (w > MAX_EDGE || h > MAX_EDGE || w * h > MAX_PIXELS) {
        safeUnlink(tmpPath);
        return fail(res, 400, `图片尺寸过大（${w}×${h}），最大支持 ${MAX_EDGE} 像素边长`);
      }
      // 校验通过：按真实格式重命名（扩展名与内容强一致）
      const ext = meta.format === 'jpeg' ? '.jpg' : `.${meta.format}`;
      const finalName = `${uuid()}${ext}`;
      fs.renameSync(tmpPath, path.join(config.uploadDir, finalName));
      return ok(res, { fileId: finalName, url: `/uploads/${finalName}`, width: w, height: h }, '上传成功');
    } catch (e) {
      safeUnlink(tmpPath);
      const msg = /pixels/i.test(e.message || '') ? '图片像素总量超限' : '文件不是有效图片或已损坏';
      return fail(res, 400, msg);
    }
  });
});

// ---------- 灯光风格列表 ----------
router.get('/styles', (req, res) => {
  const styles = Object.entries(STYLE_PRESETS).map(([key, v]) => ({ key, name: v.name, defaultTemp: v.temp }));
  const directions = [
    { key: 'none', name: '环境光' }, { key: 'left', name: '左侧' }, { key: 'right', name: '右侧' },
    { key: 'top', name: '顶部' }, { key: 'bottom', name: '底部' }
  ];
  const { currentAiProvider } = require('../services/settings');
  return ok(res, { styles, directions, costPerGeneration: config.costPerGeneration, multiCost: config.multiCost, aiProvider: currentAiProvider() });
});

// 校验并返回蒙版路径（局部重绘）
function resolveMask(params) {
  if (!params.maskId) return null;
  const p = path.join(config.uploadDir, path.basename(params.maskId));
  return fs.existsSync(p) ? p : null;
}

// 启动一条异步生成任务（内部复用）
function startJob({ userId, sourcePath, params, cost, premium, batchId = null }) {
  const id = uuid();
  db.prepare('INSERT INTO generations (id, user_id, source_path, params, status, cost, created_at, batch_id, premium) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, path.basename(sourcePath), JSON.stringify(params), 'processing', cost, Date.now(), batchId, premium ? 1 : 0);
  const outName = `${id}.jpg`;
  const outPath = path.join(config.resultDir, outName);
  enqueueGen(() => relight(sourcePath, params, outPath, { premium, maskPath: resolveMask(params) }))
    .then(() => {
      db.prepare('UPDATE generations SET status = ?, result_path = ?, finished_at = ? WHERE id = ?')
        .run('success', outName, Date.now(), id);
    })
    .catch(err => {
      db.prepare('UPDATE generations SET status = ?, error = ?, finished_at = ? WHERE id = ?')
        .run('failed', err.message || 'AI生成失败', Date.now(), id);
      // 失败自动退还；用户可能在出图期间已注销，退款失败不得让未捕获异常打挂进程
      try { changeCredits(userId, cost, 'refund', '生成失败退还算力'); } catch (e) { /* 用户已不存在，忽略 */ }
    });
  return id;
}

// ---------- 发起AI生成（单张，异步任务） ----------
router.post('/', auth, genLimit, (req, res) => {
  const { fileId, params = {} } = req.body || {};
  if (!fileId) return fail(res, 400, '缺少源图片，请先上传');
  const sourcePath = path.join(config.uploadDir, path.basename(fileId));
  if (!fs.existsSync(sourcePath)) return fail(res, 400, '源图片不存在，请重新上传');
  const errMsg = validateParams(params);
  if (errMsg) return fail(res, 400, errMsg);

  const cost = config.costPerGeneration;
  try {
    changeCredits(req.user.id, -cost, 'consume', `AI灯光生成消耗${cost}算力`);
  } catch (e) {
    if (e.code === 429) return fail(res, 429, `算力不足，本次生成需${cost}算力，请充值`);
    throw e;
  }

  const id = startJob({ userId: req.user.id, sourcePath, params, cost, premium: isPremium(req.user.id) });
  return ok(res, { id, status: 'processing', cost }, '任务已提交');
});

// ---------- 一键4风格连拍（批量生成） ----------
router.post('/batch', auth, genLimit, (req, res) => {
  const { fileId, params = {} } = req.body || {};
  if (!fileId) return fail(res, 400, '缺少源图片，请先上传');
  const sourcePath = path.join(config.uploadDir, path.basename(fileId));
  if (!fs.existsSync(sourcePath)) return fail(res, 400, '源图片不存在，请重新上传');
  const errMsg = validateParams(params);
  if (errMsg) return fail(res, 400, errMsg);

  const styleKeys = Object.keys(STYLE_PRESETS);
  const total = config.multiCost;
  const perCost = Math.floor(total / styleKeys.length) || 1;
  try {
    changeCredits(req.user.id, -total, 'consume', `4风格连拍消耗${total}算力`);
  } catch (e) {
    if (e.code === 429) return fail(res, 429, `算力不足，连拍需${total}算力，请充值`);
    throw e;
  }

  const batchId = uuid();
  const premium = isPremium(req.user.id);
  const ids = styleKeys.map(styleKey =>
    startJob({
      userId: req.user.id,
      sourcePath,
      params: { ...params, style: styleKey, colorTemp: STYLE_PRESETS[styleKey].temp },
      cost: perCost,
      premium,
      batchId
    })
  );
  return ok(res, { batchId, ids, cost: total }, '连拍任务已提交');
});

// ---------- 批量处理（一次最多20张，会员/付费用户专属） ----------
router.post('/bulk', auth, genLimit, (req, res) => {
  const { fileIds = [], params = {} } = req.body || {};
  if (!Array.isArray(fileIds) || !fileIds.length) return fail(res, 400, '请至少选择一张图片');
  if (fileIds.length > config.bulkLimit) return fail(res, 400, `单次最多${config.bulkLimit}张`);
  if (!isPremium(req.user.id)) return fail(res, 403, '批量处理为会员/付费用户专属功能，请先开通');
  const errMsg = validateParams(params);
  if (errMsg) return fail(res, 400, errMsg);

  const sources = fileIds.map(f => path.join(config.uploadDir, path.basename(f)));
  if (sources.some(p => !fs.existsSync(p))) return fail(res, 400, '存在无效图片，请重新上传');

  const perCost = config.costPerGeneration;
  const total = perCost * sources.length;
  try {
    changeCredits(req.user.id, -total, 'consume', `批量生成${sources.length}张消耗${total}算力`);
  } catch (e) {
    if (e.code === 429) return fail(res, 429, `算力不足，批量生成需${total}算力，请充值`);
    throw e;
  }

  const batchId = uuid();
  const premium = true;
  const ids = sources.map(sp => startJob({ userId: req.user.id, sourcePath: sp, params, cost: perCost, premium, batchId }));
  return ok(res, { batchId, ids, cost: total }, '批量任务已提交');
});

// LLM顾问：调用OpenAI兼容接口，返回结构化推荐（失败返回null走规则兜底）
async function llmAdvise(lum, warmth) {
  const { apiKey, baseUrl, model } = config.llm;
  if (!apiKey) return null;
  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你是资深室内照明设计师。根据照片的亮度与色调数据，给出灯光重绘参数推荐。只输出JSON，字段：style(night_warm|daylight|office_cool|wall_wash)、colorTemp(2000-8000整数)、brightness(0-100)、intensity(0-100)、detail(0-100)、direction(none|left|right|top|bottom)、reason(60字以内中文专业建议)。' },
          { role: 'user', content: `照片平均亮度${(lum * 100).toFixed(0)}/100（<35偏暗，>65偏亮），暖色比${warmth.toFixed(2)}（>1偏暖）。请推荐灯光方案。` }
        ]
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    if (!STYLE_PRESETS[parsed.style] || !DIRECTIONS[parsed.direction] || !parsed.reason) return null;
    return {
      rec: {
        style: parsed.style,
        colorTemp: Math.min(8000, Math.max(2000, Number(parsed.colorTemp) || 3000)),
        brightness: Math.min(100, Math.max(0, Number(parsed.brightness) || 50)),
        intensity: Math.min(100, Math.max(0, Number(parsed.intensity) || 50)),
        detail: Math.min(100, Math.max(0, Number(parsed.detail) || 50)),
        direction: parsed.direction
      },
      reason: String(parsed.reason).slice(0, 120)
    };
  } catch (e) {
    return null; // LLM异常自动降级规则版
  }
}

// ---------- AI灯光顾问：分析照片给出参数推荐 ----------
router.post('/advise', auth, async (req, res) => {
  const { fileId } = req.body || {};
  const p = fileId && path.join(config.uploadDir, path.basename(fileId));
  if (!p || !fs.existsSync(p)) return fail(res, 400, '请先上传图片');
  try {
    const sharp = require('sharp');
    const stats = await sharp(p).stats();
    const [r, g, b] = stats.channels.map(c => c.mean);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255; // 0-1 平均亮度
    const warmth = r / (b || 1); // >1 偏暖

    // 优先LLM专业推荐（配置了LLM_API_KEY时），失败自动降级内置规则
    const llm = await llmAdvise(lum, warmth);
    if (llm) {
      return ok(res, { recommend: llm.rec, reason: llm.reason, source: 'llm', analysis: { luminance: Number(lum.toFixed(2)), warmth: Number(warmth.toFixed(2)) } });
    }

    let rec, reason;
    if (lum < 0.35) {
      rec = { style: 'night_warm', colorTemp: 3000, brightness: 68, intensity: 62, detail: 55, direction: 'top' };
      reason = '照片整体偏暗，建议采用暖光提亮方案：3000K暖色温营造温馨感，亮度提升至68，顶部主光源均匀照亮空间。';
    } else if (lum > 0.65) {
      rec = warmth > 1.1
        ? { style: 'daylight', colorTemp: 5600, brightness: 50, intensity: 45, detail: 50, direction: 'none' }
        : { style: 'office_cool', colorTemp: 6000, brightness: 48, intensity: 40, detail: 55, direction: 'none' };
      reason = '照片光线充足，建议自然光方案微调：中性色温还原真实色彩，适当降低光影强度避免过曝。';
    } else if (warmth > 1.15) {
      rec = { style: 'wall_wash', colorTemp: 3500, brightness: 55, intensity: 68, detail: 60, direction: 'left' };
      reason = '照片色调偏暖，适合氛围洗墙光方案：3500K配合较强光影层次，左侧光源突出墙面质感与空间纵深。';
    } else {
      rec = { style: 'night_warm', colorTemp: 3200, brightness: 58, intensity: 55, detail: 55, direction: 'right' };
      reason = '照片明暗均衡、色调中性，推荐夜景暖光方案：3200K暖光搭配右侧光源，营造居家氛围同时保留细节。';
    }
    return ok(res, { recommend: rec, reason, source: 'rules', analysis: { luminance: Number(lum.toFixed(2)), warmth: Number(warmth.toFixed(2)) } });
  } catch (e) {
    return fail(res, 500, '图片分析失败：' + e.message);
  }
});

// ---------- 作品分享 ----------
// 生成分享链接
router.post('/:id/share', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM generations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!g) return fail(res, 404, '记录不存在');
  if (g.status !== 'success') return fail(res, 400, '仅成功的作品可分享');
  let shareId = g.share_id;
  if (!shareId) {
    shareId = uuid().replace(/-/g, '').slice(0, 10);
    db.prepare('UPDATE generations SET share_id = ? WHERE id = ?').run(shareId, g.id);
  }
  return ok(res, { shareId }, '分享链接已生成');
});

// 公开访问分享作品（无需登录）
router.get('/share/:shareId', (req, res) => {
  const g = db.prepare('SELECT * FROM generations WHERE share_id = ?').get(req.params.shareId);
  if (!g || g.status !== 'success') return fail(res, 404, '分享不存在或已删除');
  const u = db.prepare('SELECT nickname, invite_code FROM users WHERE id = ?').get(g.user_id);
  return ok(res, {
    resultUrl: `/results/${g.result_path}`,
    sourceUrl: `/uploads/${g.source_path}`,
    params: JSON.parse(g.params || '{}'),
    nickname: u?.nickname || '设计师',
    inviteCode: u?.invite_code || '',
    createdAt: g.created_at
  });
});

// ---------- 查询连拍批次状态 ----------
router.get('/batch/:batchId', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM generations WHERE batch_id = ? AND user_id = ? ORDER BY created_at ASC')
    .all(req.params.batchId, req.user.id);
  if (!rows.length) return fail(res, 404, '批次不存在');
  return ok(res, { list: rows.map(toItem), done: rows.every(r => r.status !== 'processing') });
});

const toItem = g => ({
  id: g.id,
  batchId: g.batch_id,
  sourceUrl: `/uploads/${g.source_path}`,
  resultUrl: g.result_path ? `/results/${g.result_path}` : null,
  params: JSON.parse(g.params || '{}'),
  status: g.status,
  error: g.error,
  cost: g.cost,
  premium: !!g.premium,
  createdAt: g.created_at,
  finishedAt: g.finished_at
});

// ---------- 历史记录（分页 + 风格/状态筛选） ----------
router.get('/', auth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 12));
  let where = 'WHERE user_id = ?';
  const args = [req.user.id];
  if (req.query.style && STYLE_PRESETS[req.query.style]) {
    where += " AND json_extract(params, '$.style') = ?";
    args.push(req.query.style);
  }
  if (['success', 'failed', 'processing'].includes(req.query.status)) {
    where += ' AND status = ?';
    args.push(req.query.status);
  }
  const total = db.prepare(`SELECT COUNT(*) c FROM generations ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM generations ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...args, size, (page - 1) * size);
  return ok(res, { total, page, size, list: rows.map(toItem) });
});

// ---------- 查询单个任务状态 ----------
router.get('/:id', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM generations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!g) return fail(res, 404, '记录不存在');
  return ok(res, toItem(g));
});

// ---------- 删除记录 ----------
router.delete('/:id', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM generations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!g) return fail(res, 404, '记录不存在');
  db.prepare('DELETE FROM generations WHERE id = ?').run(g.id);
  if (g.result_path) {
    const p = path.join(config.resultDir, g.result_path);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  return ok(res, {}, '删除成功');
});

module.exports = router;
