const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../db');
const config = require('../config');

const CODE_TTL = 10 * 60 * 1000; // 10分钟有效
const SEND_INTERVAL = 60 * 1000; // 同邮箱60秒一次

let transporter = null;
function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass }
    });
  }
  return transporter;
}

async function sendCode(email, purpose) {
  const last = db.prepare('SELECT created_at FROM email_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1')
    .get(email, purpose);
  if (last && Date.now() - last.created_at < SEND_INTERVAL) {
    const err = new Error('发送太频繁，请60秒后再试');
    err.code = 429;
    throw err;
  }
  const code = String(crypto.randomInt(100000, 999999));
  db.prepare('INSERT INTO email_codes (id, email, code, purpose, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .run(uuid(), email, code, purpose, Date.now() + CODE_TTL, Date.now());

  const t = getTransporter();
  if (t) {
    await t.sendMail({
      from: `"AI灯光设计" <${config.smtp.from}>`,
      to: email,
      subject: `【AI灯光设计】验证码：${code}`,
      html: `<p>您的验证码为：<b style="font-size:20px">${code}</b>，10分钟内有效。</p><p>如非本人操作请忽略本邮件。</p>`
    });
    return { sent: true };
  }
  console.log(`📧 [开发模式] 邮箱验证码 ${email} (${purpose}): ${code}`);
  return { sent: false, devCode: code };
}

const MAX_VERIFY_ATTEMPTS = 5; // 单个验证码最多允许猜测次数，超过即作废，防暴力枚举

function verifyCode(email, purpose, code) {
  const row = db.prepare(
    'SELECT * FROM email_codes WHERE email = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
  ).get(email, purpose);
  if (!row || row.expires_at < Date.now()) return false;
  if (row.code !== String(code)) {
    const attempts = (row.attempts || 0) + 1;
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      db.prepare('UPDATE email_codes SET used = 1 WHERE id = ?').run(row.id);
    } else {
      db.prepare('UPDATE email_codes SET attempts = ? WHERE id = ?').run(attempts, row.id);
    }
    return false;
  }
  db.prepare('UPDATE email_codes SET used = 1 WHERE id = ?').run(row.id);
  return true;
}

module.exports = { sendCode, verifyCode };
