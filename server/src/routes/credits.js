const express = require('express');
const db = require('../db');
const { ok } = require('../utils/response');
const { auth } = require('../middleware/auth');

const router = express.Router();
router.get('/balance', auth, (req, res) => {
  const u = db.prepare('SELECT credits, member_expires_at FROM users WHERE id = ?').get(req.user.id);
  return ok(res, {
    credits: u.credits,
    isMember: !!(u.member_expires_at && u.member_expires_at > Date.now()),
    memberExpiresAt: u.member_expires_at
  });
});
router.get('/logs', auth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(req.query.size) || 15));
  const total = db.prepare('SELECT COUNT(*) c FROM credit_logs WHERE user_id = ?').get(req.user.id).c;
  const rows = db.prepare('SELECT * FROM credit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(req.user.id, size, (page - 1) * size);
  return ok(res, {
    total, page, size,
    list: rows.map(r => ({ id: r.id, change: r.change, balance: r.balance, type: r.type, remark: r.remark, createdAt: r.created_at }))
  });
});

module.exports = router;
