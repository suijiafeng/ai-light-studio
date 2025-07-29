/**
 * 初始化/重置 超级管理员 或 管理员 账号（首次上线用）
 * 直接写库，不走邮箱验证码——仅限服务器本机命令行执行，安全可靠。
 *
 * 用法（在 server 目录下）：
 *   node scripts/init-admin.js <邮箱> [密码] [--admin]
 *
 * 示例：
 *   node scripts/init-admin.js boss@corp.com                 # 超管，自动生成随机强密码并打印
 *   node scripts/init-admin.js boss@corp.com MyPass@2026     # 超管，指定密码
 *   node scripts/init-admin.js ops@corp.com Ops@2026 --admin # 普通管理员
 *
 * 账号已存在时：仅重置其密码与角色（不动算力和数据）。
 * 密码规则：8-32位，须同时含字母和数字。
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../src/db');

const args = process.argv.slice(2);
const isAdmin = args.includes('--admin');
const rest = args.filter(a => a !== '--admin');
const email = (rest[0] || '').toLowerCase().trim();
let password = rest[1];

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('用法: node scripts/init-admin.js <邮箱> [密码] [--admin]');
  process.exit(1);
}

// 未提供密码则生成随机强密码（含大小写字母+数字）
if (!password) {
  const base = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  password = 'A' + base.slice(0, 9) + '9';
}
const valid = password.length >= 8 && password.length <= 32 && /[a-zA-Z]/.test(password) && /\d/.test(password);
if (!valid) {
  console.error('✖ 密码需 8-32 位且同时包含字母和数字');
  process.exit(1);
}

const role = isAdmin ? 'admin' : 'super';
const hash = bcrypt.hashSync(password, 10);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

if (existing) {
  db.prepare('UPDATE users SET password_hash = ?, role = ?, banned = 0 WHERE id = ?').run(hash, role, existing.id);
  console.log(`✔ 已重置账号 ${email} 的密码与角色`);
} else {
  const id = uuid();
  db.prepare('INSERT INTO users (id, email, password_hash, nickname, role, credits, created_at, invite_code) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
    .run(id, email, hash, isAdmin ? '管理员' : '超级管理员', role, Date.now(), id.slice(0, 8));
  console.log(`✔ 已创建${isAdmin ? '管理员' : '超级管理员'}账号 ${email}`);
}

console.log('────────────────────────────────');
console.log(`  角色: ${role === 'super' ? '超级管理员' : '管理员'}`);
console.log(`  邮箱: ${email}`);
console.log(`  密码: ${password}`);
console.log('────────────────────────────────');
console.log('请立即用此密码登录，并在个人中心尽快修改。');
if (role === 'super') {
  console.log('提示：建议同时把该邮箱写入 .env 的 SUPER_ADMIN_EMAILS，以固化超管身份。');
}
