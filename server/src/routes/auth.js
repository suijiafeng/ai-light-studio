const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');
const config = require('../config');
const { ok, fail } = require('../utils/response');
const { auth } = require('../middleware/auth');
const { changeCredits } = require('../services/credits');
const { sendCode, verifyCode } = require('../services/mailer');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// 防滥用限流
const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, key: 'reg', message: '注册太频繁，请1小时后再试' });
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, key: 'login', message: '尝试次数过多，请15分钟后再试' });
const codeLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, key: 'code', message: '验证码请求太频繁，请稍后再试' });

// 每日登录奖励：每个自然日首次访问赠送算力
function grantDaily(userId) {
  const u = db.prepare('SELECT last_daily_at FROM users WHERE id = ?').get(userId);
  const today = new Date().setHours(0, 0, 0, 0);
  if (u && (!u.last_daily_at || u.last_daily_at < today)) {
    db.prepare('UPDATE users SET last_daily_at = ? WHERE id = ?').run(Date.now(), userId);
    changeCredits(userId, config.dailyCredits, 'daily', `每日登录奖励${config.dailyCredits}算力`);
    return config.dailyCredits;
  }
  return 0;
}

const publicUser = u => ({
  id: u.id, email: u.email, nickname: u.nickname, role: u.role,
  credits: u.credits, memberExpiresAt: u.member_expires_at,
  isMember: !!(u.member_expires_at && u.member_expires_at > Date.now()),
  inviteCode: u.invite_code,
  createdAt: u.created_at
});

// 发送邮箱验证码（注册验证 / 找回密码）
router.post('/send-code', codeLimit, async (req, res) => {
  const { email, purpose } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, '邮箱格式不正确');
  if (!['register', 'reset'].includes(purpose)) return fail(res, 400, '无效的用途');
  if (purpose === 'reset' && !db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase())) {
    return fail(res, 400, '该邮箱未注册');
  }
  try {
    const r = await sendCode(email.toLowerCase(), purpose);
    return ok(res, r.sent ? {} : { devCode: r.devCode }, r.sent ? '验证码已发送，请查收邮箱' : '开发模式：验证码已生成（未配置SMTP）');
  } catch (e) {
    return fail(res, e.code === 429 ? 429 : 500, e.message);
  }
});

// 找回密码
router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  if (!email || !code || !newPassword) return fail(res, 400, '请填写完整');
  if (newPassword.length < 6) return fail(res, 400, '新密码至少6位');
  if (!verifyCode(String(email).toLowerCase(), 'reset', code)) return fail(res, 400, '验证码错误或已过期');
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user) return fail(res, 400, '该邮箱未注册');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(newPassword, 10), user.id);
  return ok(res, {}, '密码已重置，请重新登录');
});

// 注册
router.post('/register', registerLimit, async (req, res) => {
  const { email, password, nickname, code, inviteCode } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, '邮箱格式不正确');
  if (!password || password.length < 6) return fail(res, 400, '密码至少6位');
  if (config.emailVerify && !verifyCode(email.toLowerCase(), 'register', code || '')) {
    return fail(res, 400, '邮箱验证码错误或已过期');
  }
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return fail(res, 400, '该邮箱已注册');

  const id = uuid();
  const role = config.adminEmails.includes(email.toLowerCase()) ? 'admin' : 'user';
  const myInviteCode = id.slice(0, 8);
  // 邀请人校验
  let inviter = null;
  if (inviteCode) {
    inviter = db.prepare('SELECT id FROM users WHERE invite_code = ?').get(String(inviteCode).trim());
  }
  db.prepare('INSERT INTO users (id, email, password_hash, nickname, role, credits, created_at, invite_code, invited_by) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)')
    .run(id, email.toLowerCase(), await bcrypt.hash(password, 10), nickname || email.split('@')[0], role, Date.now(), myInviteCode, inviter?.id || null);
  // 新用户免费算力
  changeCredits(id, config.freeCredits, 'register', `新用户注册赠送${config.freeCredits}算力`);
  // 邀请裂变：双方各得奖励
  if (inviter) {
    changeCredits(id, config.inviteBonus, 'invite', `受邀注册奖励${config.inviteBonus}算力`);
    changeCredits(inviter.id, config.inviteBonus, 'invite', `成功邀请好友奖励${config.inviteBonus}算力`);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const token = jwt.sign({ uid: id }, config.jwtSecret, { expiresIn: config.jwtExpires });
  return ok(res, { token, user: publicUser(user) }, '注册成功');
});

// 登录
router.post('/login', loginLimit, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, '请输入邮箱和密码');
  const found = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!found || !(await bcrypt.compare(password, found.password_hash))) {
    return fail(res, 400, '邮箱或密码错误');
  }
  const dailyBonus = grantDaily(found.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(found.id);
  const token = jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: config.jwtExpires });
  return ok(res, { token, user: publicUser(user), dailyBonus }, '登录成功');
});

// 当前用户信息（自动发放每日登录奖励；为老用户补发邀请码）
router.get('/me', auth, (req, res) => {
  if (!db.prepare('SELECT invite_code FROM users WHERE id = ?').get(req.user.id).invite_code) {
    db.prepare('UPDATE users SET invite_code = ? WHERE id = ?').run(req.user.id.slice(0, 8), req.user.id);
  }
  const dailyBonus = grantDaily(req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return ok(res, { user: publicUser(user), dailyBonus });
});

// 修改资料 / 密码
router.put('/profile', auth, async (req, res) => {
  const { nickname, oldPassword, newPassword } = req.body || {};
  if (nickname) {
    db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(String(nickname).slice(0, 30), req.user.id);
  }
  if (newPassword) {
    if (newPassword.length < 6) return fail(res, 400, '新密码至少6位');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!(await bcrypt.compare(oldPassword || '', user.password_hash))) return fail(res, 400, '原密码错误');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(newPassword, 10), req.user.id);
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return ok(res, { user: publicUser(user) }, '修改成功');
});

// 账号注销（合规要求）：校验密码后删除全部数据与文件
router.delete('/account', auth, async (req, res) => {
  const { password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!(await bcrypt.compare(password || '', user.password_hash))) {
    return fail(res, 400, '密码错误，注销失败');
  }
  if (user.role === 'admin') return fail(res, 400, '管理员账号不可自助注销');

  const fs = require('fs');
  const path = require('path');
  const cfg = require('../config');
  // 删除生成的图片文件
  const gens = db.prepare('SELECT source_path, result_path FROM generations WHERE user_id = ?').all(user.id);
  for (const g of gens) {
    for (const [dir, name] of [[cfg.uploadDir, g.source_path], [cfg.resultDir, g.result_path]]) {
      if (name) { const p = path.join(dir, name); if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) {} } }
    }
  }
  // 删除全部数据
  const wipe = db.transaction(() => {
    db.prepare('DELETE FROM generations WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM credit_logs WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM email_codes WHERE email = ?').run(user.email);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  });
  wipe();
  return ok(res, {}, '账号已注销，全部数据已删除');
});

module.exports = { router, publicUser };
