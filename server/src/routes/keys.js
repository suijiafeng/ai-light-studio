/**
 * 开放API密钥管理
 * 第三方系统携带请求头 X-API-Key 即可调用 /api/generate 系列接口
 */
const express = require('express');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');

const router = express.Router();
const MAX_KEYS = 5;

router.get('/', auth, (req, res) => {
  const rows = db.prepare('SELECT id, key, name, created_at FROM api_keys WHERE user_id = ? AND revoked = 0 ORDER BY created_at DESC')
    .all(req.user.id);
  return ok(res, {
    list: rows.map(k => ({
      id: k.id, name: k.name,
      keyMasked: k.key.slice(0, 8) + '****' + k.key.slice(-4),
      createdAt: k.created_at
    }))
  });
});

router.post('/', auth, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM api_keys WHERE user_id = ? AND revoked = 0').get(req.user.id).c;
  if (count >= MAX_KEYS) return fail(res, 400, `最多创建${MAX_KEYS}个密钥`);
  const key = 'als_' + crypto.randomBytes(24).toString('hex');
  const id = uuid();
  db.prepare('INSERT INTO api_keys (id, user_id, key, name, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.user.id, key, String(req.body?.name || '默认密钥').slice(0, 30), Date.now());
  // 完整密钥仅在创建时返回一次
  return ok(res, { id, key }, '创建成功，请立即保存密钥（仅显示一次）');
});

router.delete('/:id', auth, (req, res) => {
  const r = db.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!r.changes) return fail(res, 404, '密钥不存在');
  return ok(res, {}, '已吊销');
});

module.exports = router;
