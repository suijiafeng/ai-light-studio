/** 错误日志落库（供全局错误处理与前端上报使用） */
const { v4: uuid } = require('uuid');
const db = require('../db');

function logError({ source = 'server', message = '', stack = '', url = '', userId = null }) {
  try {
    db.prepare('INSERT INTO error_logs (id, source, message, stack, url, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuid(), source, String(message).slice(0, 500), String(stack || '').slice(0, 3000), String(url || '').slice(0, 300), userId, Date.now());
    // 只保留最近2000条
    db.prepare('DELETE FROM error_logs WHERE id NOT IN (SELECT id FROM error_logs ORDER BY created_at DESC LIMIT 2000)').run();
  } catch (e) { /* 日志失败不影响主流程 */ }
}

module.exports = { logError };
