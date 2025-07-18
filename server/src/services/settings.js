/**
 * 运行时设置（存库，重启不丢失）
 * 当前用于：AI出图模式的运行时切换（演示mock / 真实fal / replicate），无需改.env重启
 */
const db = require('../db');
const config = require('../config');

function get(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function set(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

/** 当前生效的AI模式：运行时设置优先，其次 .env 的 AI_PROVIDER */
function currentAiProvider() {
  return get('ai_provider') || config.ai.provider;
}

module.exports = { get, set, currentAiProvider };
