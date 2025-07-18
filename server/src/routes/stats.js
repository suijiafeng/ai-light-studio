const express = require('express');
const db = require('../db');
const config = require('../config');
const { ok, fail } = require('../utils/response');
const { auth, adminOnly } = require('../middleware/auth');
const { changeCredits } = require('../services/credits');

const router = express.Router();

// ---------- AI出图模式切换（仅管理员，运行时生效无需重启） ----------
const settings = require('../services/settings');
const cfg = require('../config');

router.get('/ai-mode', auth, adminOnly, (req, res) => {
  return ok(res, {
    provider: settings.currentAiProvider(),
    available: {
      mock: true,
      fal: !!cfg.ai.falKey,
      replicate: !!(cfg.ai.replicateToken && cfg.ai.replicateVersion)
    }
  });
});

router.post('/ai-mode', auth, adminOnly, (req, res) => {
  const { provider } = req.body || {};
  if (!['mock', 'fal', 'replicate'].includes(provider)) return fail(res, 400, '无效的模式');
  if (provider === 'fal' && !cfg.ai.falKey) return fail(res, 400, '未配置 FAL_API_KEY，无法切换到fal真实出图');
  if (provider === 'replicate' && !(cfg.ai.replicateToken && cfg.ai.replicateVersion)) {
    return fail(res, 400, '未配置 Replicate 参数，无法切换');
  }
  settings.set('ai_provider', provider);
  return ok(res, { provider }, provider === 'mock' ? '已切换为演示模式（本地模拟出图）' : `已切换为真实出图（${provider}）`);
});

// ---------- 订单管理（仅管理员） ----------
router.get('/orders', auth, adminOnly, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 15));
  const conds = [];
  const args = [];
  const kw = String(req.query.keyword || '').trim();
  if (kw) { conds.push('(o.id LIKE ? OR u.email LIKE ?)'); args.push(`%${kw}%`, `%${kw}%`); }
  if (['pending', 'paid', 'closed', 'refunded'].includes(req.query.status)) {
    conds.push('o.status = ?'); args.push(req.query.status);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM orders o JOIN users u ON u.id = o.user_id ${where}`).get(...args).c;
  const rows = db.prepare(`
    SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id
    ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size);
  return ok(res, {
    total, page, size,
    list: rows.map(o => ({
      id: o.id, email: o.email, title: o.title,
      amountYuan: (o.amount / 100).toFixed(2), credits: o.credits,
      status: o.status, createdAt: o.created_at, paidAt: o.paid_at
    }))
  });
});

// 删除违规生成记录（含结果图与源图文件）
router.delete('/generations/:id', auth, adminOnly, (req, res) => {
  const g = db.prepare('SELECT * FROM generations WHERE id = ?').get(req.params.id);
  if (!g) return fail(res, 404, '记录不存在');
  const fs = require('fs');
  const path = require('path');
  const config = require('../config');
  db.prepare('DELETE FROM generations WHERE id = ?').run(g.id);
  // 结果图直接删；源图可能被其他记录（连拍/再次编辑）引用，无引用时才删
  if (g.result_path) {
    const p = path.join(config.resultDir, g.result_path);
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) {} }
  }
  const stillUsed = db.prepare('SELECT COUNT(*) c FROM generations WHERE source_path = ?').get(g.source_path).c;
  if (!stillUsed && g.source_path) {
    const p = path.join(config.uploadDir, g.source_path);
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) {} }
  }
  return ok(res, {}, '已删除该生成记录');
});

// ---------- 用户管理（仅管理员） ----------
router.get('/users', auth, adminOnly, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 15));
  const kw = String(req.query.keyword || '').trim();
  const where = kw ? 'WHERE email LIKE ? OR nickname LIKE ?' : '';
  const args = kw ? [`%${kw}%`, `%${kw}%`] : [];
  const total = db.prepare(`SELECT COUNT(*) c FROM users ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT id, email, nickname, role, credits, member_expires_at, banned, created_at FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...args, size, (page - 1) * size);
  return ok(res, {
    total, page, size,
    list: rows.map(u => ({
      id: u.id, email: u.email, nickname: u.nickname, role: u.role, credits: u.credits,
      isMember: !!(u.member_expires_at && u.member_expires_at > Date.now()),
      banned: !!u.banned, createdAt: u.created_at
    }))
  });
});

// 调整用户算力（正加负减）
router.post('/users/:id/credits', auth, adminOnly, (req, res) => {
  const { change, remark } = req.body || {};
  const n = Number(change);
  if (!Number.isFinite(n) || n === 0) return fail(res, 400, '请输入非零的调整数值');
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!u) return fail(res, 404, '用户不存在');
  try {
    const balance = changeCredits(u.id, n, n > 0 ? 'recharge' : 'consume', remark || `管理员调整${n}算力`);
    return ok(res, { balance }, '调整成功');
  } catch (e) {
    if (e.code === 429) return fail(res, 400, '扣减后余额不能为负');
    throw e;
  }
});

// 封禁/解封
router.post('/users/:id/ban', auth, adminOnly, (req, res) => {
  const u = db.prepare('SELECT id, banned, role FROM users WHERE id = ?').get(req.params.id);
  if (!u) return fail(res, 404, '用户不存在');
  if (u.role === 'admin') return fail(res, 400, '不能封禁管理员');
  const banned = req.body?.banned ? 1 : 0;
  db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned, u.id);
  return ok(res, { banned: !!banned }, banned ? '已封禁' : '已解封');
});

// 错误日志（排查线上问题）
router.get('/errors', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 100').all();
  return ok(res, {
    list: rows.map(r => ({ id: r.id, source: r.source, message: r.message, stack: r.stack, url: r.url, createdAt: r.created_at }))
  });
});

// 最近生成内容（抽查）
router.get('/generations', auth, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT g.id, g.result_path, g.source_path, g.status, g.cost, g.created_at, u.email
    FROM generations g JOIN users u ON u.id = g.user_id
    ORDER BY g.created_at DESC LIMIT 24`).all();
  return ok(res, {
    list: rows.map(g => ({
      id: g.id, email: g.email, status: g.status, cost: g.cost, createdAt: g.created_at,
      resultUrl: g.result_path ? `/results/${g.result_path}` : null,
      sourceUrl: `/uploads/${g.source_path}`
    }))
  });
});

// ---------- 套餐在线配置（仅管理员，替代写死config） ----------
const pkgRow = r => ({
  id: r.id, type: r.type, title: r.title, price: r.price,
  priceYuan: (r.price / 100).toFixed(2), credits: r.credits, days: r.days,
  desc: r.description, sort: r.sort, active: !!r.active
});

function validatePkg(body) {
  const { type, title, price, credits, days } = body || {};
  if (!['credits', 'member'].includes(type)) return '套餐类型需为 credits 或 member';
  if (!title || !String(title).trim()) return '请填写套餐名称';
  if (!Number.isInteger(price) || price <= 0) return '价格需为正整数（单位：分）';
  if (!Number.isInteger(credits) || credits <= 0) return '算力需为正整数';
  if (type === 'member' && (!Number.isInteger(days) || days <= 0)) return '会员套餐需填写有效天数';
  return null;
}

// 全部套餐（含已下架）
router.get('/packages', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM packages ORDER BY sort ASC, rowid ASC').all();
  return ok(res, { list: rows.map(pkgRow) });
});

// 新建套餐
router.post('/packages', auth, adminOnly, (req, res) => {
  const errMsg = validatePkg(req.body);
  if (errMsg) return fail(res, 400, errMsg);
  const { type, title, price, credits, days = 0, desc = '', sort = 99 } = req.body;
  const id = `pk_${Date.now()}`;
  db.prepare('INSERT INTO packages (id, type, title, price, credits, days, description, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
    .run(id, type, String(title).trim(), price, credits, type === 'member' ? days : 0, desc, sort);
  return ok(res, { id }, '套餐已创建');
});

// 修改套餐（历史订单不受影响，仅影响后续购买）
router.put('/packages/:id', auth, adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, 404, '套餐不存在');
  const errMsg = validatePkg(req.body);
  if (errMsg) return fail(res, 400, errMsg);
  const { type, title, price, credits, days = 0, desc = '', sort } = req.body;
  db.prepare('UPDATE packages SET type = ?, title = ?, price = ?, credits = ?, days = ?, description = ?, sort = ? WHERE id = ?')
    .run(type, String(title).trim(), price, credits, type === 'member' ? days : 0, desc, sort ?? row.sort, row.id);
  return ok(res, {}, '套餐已更新');
});

// 上架/下架（不做物理删除，避免历史订单失去引用）
router.post('/packages/:id/toggle', auth, adminOnly, (req, res) => {
  const row = db.prepare('SELECT id, active FROM packages WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, 404, '套餐不存在');
  const active = row.active ? 0 : 1;
  db.prepare('UPDATE packages SET active = ? WHERE id = ?').run(active, row.id);
  return ok(res, { active: !!active }, active ? '已上架' : '已下架');
});

// 后台数据总览（仅管理员）
router.get('/overview', auth, adminOnly, (req, res) => {
  const now = Date.now();
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const q = sql => db.prepare(sql).get();

  return ok(res, {
    users: {
      total: q('SELECT COUNT(*) c FROM users').c,
      today: db.prepare('SELECT COUNT(*) c FROM users WHERE created_at >= ?').get(dayStart).c,
      members: db.prepare('SELECT COUNT(*) c FROM users WHERE member_expires_at > ?').get(now).c
    },
    generations: {
      total: q('SELECT COUNT(*) c FROM generations').c,
      today: db.prepare('SELECT COUNT(*) c FROM generations WHERE created_at >= ?').get(dayStart).c,
      success: q("SELECT COUNT(*) c FROM generations WHERE status = 'success'").c,
      failed: q("SELECT COUNT(*) c FROM generations WHERE status = 'failed'").c
    },
    credits: {
      consumed: Math.abs(q("SELECT COALESCE(SUM(change),0) s FROM credit_logs WHERE type = 'consume'").s),
      consumedToday: Math.abs(db.prepare("SELECT COALESCE(SUM(change),0) s FROM credit_logs WHERE type = 'consume' AND created_at >= ?").get(dayStart).s),
      recharged: q("SELECT COALESCE(SUM(change),0) s FROM credit_logs WHERE type = 'recharge'").s
    },
    revenue: {
      total: q("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE status = 'paid'").s,
      today: db.prepare("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE status = 'paid' AND paid_at >= ?").get(dayStart).s,
      orders: q("SELECT COUNT(*) c FROM orders WHERE status = 'paid'").c
    },
    // 转化漏斗：注册 → 出过图 → 算力耗尽（余额不够一次生成）→ 付过费
    funnel: (() => {
      const registered = q('SELECT COUNT(*) c FROM users').c;
      const generated = q('SELECT COUNT(DISTINCT user_id) c FROM generations').c;
      const exhausted = db.prepare('SELECT COUNT(*) c FROM users WHERE credits < ?').get(config.costPerGeneration).c;
      const paid = q("SELECT COUNT(DISTINCT user_id) c FROM orders WHERE status = 'paid'").c;
      const rate = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
      return {
        registered, generated, exhausted, paid,
        generatedRate: rate(generated, registered), // 注册→出图
        paidRate: rate(paid, registered)            // 注册→付费
      };
    })(),
    // 近7天趋势
    trend: [...Array(7)].map((_, i) => {
      const start = dayStart - (6 - i) * 86400000;
      const end = start + 86400000;
      return {
        date: new Date(start).toISOString().slice(5, 10),
        generations: db.prepare('SELECT COUNT(*) c FROM generations WHERE created_at >= ? AND created_at < ?').get(start, end).c,
        newUsers: db.prepare('SELECT COUNT(*) c FROM users WHERE created_at >= ? AND created_at < ?').get(start, end).c
      };
    })
  });
});

module.exports = router;
