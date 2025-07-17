const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { fail } = require('../utils/response');

const USER_FIELDS = 'id, email, nickname, role, credits, member_expires_at, banned, created_at';

function auth(req, res, next) {
  // 方式一：开放API密钥（X-API-Key），供第三方系统集成
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const row = db.prepare('SELECT user_id FROM api_keys WHERE key = ? AND revoked = 0').get(String(apiKey));
    if (!row) return fail(res, 401, 'API密钥无效或已吊销');
    const user = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(row.user_id);
    if (!user) return fail(res, 401, '用户不存在');
    if (user.banned) return fail(res, 403, '账号已被封禁');
    req.user = user;
    req.viaApiKey = true;
    return next();
  }
  // 方式二：JWT
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 401, '未登录或登录已过期');
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(payload.uid);
    if (!user) return fail(res, 401, '用户不存在');
    if (user.banned) return fail(res, 403, '账号已被封禁，如有疑问请联系客服');
    req.user = user;
    next();
  } catch (e) {
    return fail(res, 401, '未登录或登录已过期');
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return fail(res, 403, '权限不足');
  next();
}

module.exports = { auth, adminOnly };
