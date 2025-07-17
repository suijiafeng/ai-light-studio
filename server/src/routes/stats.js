const express = require('express');
const db = require('../db');
const { ok, fail } = require('../utils/response');
const { auth, adminOnly } = require('../middleware/auth');
const { changeCredits } = require('../services/credits');

const router = express.Router();

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
