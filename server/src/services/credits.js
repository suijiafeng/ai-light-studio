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

module.exports = { changeCredits };
