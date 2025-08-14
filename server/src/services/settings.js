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

function currentAiProvider() {
  return get('ai_provider') || config.ai.provider;
}

module.exports = { get, set, currentAiProvider };
