const { v4: uuid } = require('uuid');
const db = require('../db');

/**
 * 变更用户算力并写流水（事务）
 * @param {string} userId
 * @param {number} change 正数增加 / 负数扣减
 * @param {string} type register|recharge|consume|refund
 * @param {string} remark
 * @returns {number} 变更后余额
 */
const changeCredits = db.transaction((userId, change, type, remark) => {
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('用户不存在');
  const balance = user.credits + change;
  if (balance < 0) {
    const err = new Error('算力不足');
    err.code = 429;
    throw err;
  }
  db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(balance, userId);
  db.prepare(
    'INSERT INTO credit_logs (id, user_id, change, balance, type, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(uuid(), userId, change, balance, type, remark || '', Date.now());
  return balance;
});

/**
 * 是否享受高清无水印：会员 或 有任意已支付订单（单条SQL）
 * 从 routes/generate.js 搬迁至此，供普通生成与工作流引擎共用同一份判定逻辑。
 */
function isPremium(userId) {
  const row = db.prepare(`
    SELECT (
      EXISTS(SELECT 1 FROM users WHERE id = ? AND member_expires_at > ?)
      OR EXISTS(SELECT 1 FROM orders WHERE user_id = ? AND status = 'paid')
    ) AS p`).get(userId, Date.now(), userId);
  return !!row?.p;
}

module.exports = { changeCredits, isPremium };
