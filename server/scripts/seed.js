/**
 * 演示种子数据（幂等，可重复执行）
 * 用法: cd server && npm run seed        （或容器内 node scripts/seed.js）
 *
 * 创建两个演示账号（已存在则跳过，只补足算力）:
 *   管理员  admin@demo.com / Demo@2026   —— 可看管理后台
 *   演示用户 demo@demo.com  / Demo@2026   —— 预充500算力，可演示会员/批量等付费功能
 *
 * 账号密码可用环境变量覆盖: SEED_ADMIN_EMAIL / SEED_DEMO_EMAIL / SEED_PASSWORD
 */
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../src/db');
const { changeCredits } = require('../src/services/credits');

const PASSWORD = process.env.SEED_PASSWORD || 'Demo@2026';
const ACCOUNTS = [
  { email: process.env.SEED_ADMIN_EMAIL || 'admin@demo.com', nickname: '演示管理员', role: 'admin', credits: 200 },
  { email: process.env.SEED_DEMO_EMAIL || 'demo@demo.com', nickname: '演示用户', role: 'user', credits: 500 }
];

for (const acc of ACCOUNTS) {
  const email = acc.email.toLowerCase();
  let user = db.prepare('SELECT id, credits FROM users WHERE email = ?').get(email);
  if (!user) {
    const id = uuid();
    db.prepare(
      'INSERT INTO users (id, email, password_hash, nickname, role, credits, created_at, invite_code) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
    ).run(id, email, bcrypt.hashSync(PASSWORD, 10), acc.nickname, acc.role, Date.now(), id.slice(0, 8));
    changeCredits(id, acc.credits, 'register', '演示账号初始算力');
    console.log(`✔ 已创建 ${acc.role === 'admin' ? '管理员' : '用户'}: ${email} / ${PASSWORD}（${acc.credits}算力）`);
  } else if (user.credits < acc.credits) {
    changeCredits(user.id, acc.credits - user.credits, 'recharge', '演示账号算力补足');
    console.log(`✔ 已存在 ${email}，算力补足至 ${acc.credits}`);
  } else {
    console.log(`- 已存在 ${email}（${user.credits}算力），跳过`);
  }
}

console.log('种子数据完成。演示账号密码: ' + PASSWORD);
