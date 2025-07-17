const fs = require('fs');
const path = require('path');
const config = require('./config');

for (const dir of [path.dirname(config.dbPath), config.uploadDir, config.resultDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 数据库驱动：优先使用 better-sqlite3（性能最佳）；
 * 若当前环境无法编译原生模块，则自动降级为 Node 内置 node:sqlite（Node >= 22.13），
 * 并补齐 pragma / transaction 接口，二者API完全兼容，业务代码零改动。
 */
let db;
// WAL 提升并发性能；个别文件系统不支持时自动忽略
const tryWal = fn => { try { fn(); } catch (e) { /* ignore */ } };
try {
  const Database = require('better-sqlite3');
  db = new Database(config.dbPath);
  tryWal(() => db.pragma('journal_mode = WAL'));
} catch (e) {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(config.dbPath);
  tryWal(() => db.exec('PRAGMA journal_mode = WAL'));
  db.pragma = s => db.exec(`PRAGMA ${s}`);
  // 支持嵌套事务（savepoint），与 better-sqlite3 行为对齐
  let txDepth = 0;
  db.transaction = fn => (...args) => {
    const sp = `sp_${txDepth}`;
    db.exec(txDepth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
    txDepth++;
    try {
      const result = fn(...args);
      txDepth--;
      db.exec(txDepth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
      return result;
    } catch (err) {
      txDepth--;
      db.exec(txDepth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw err;
    }
  };
  console.log('ℹ️  better-sqlite3 不可用，已自动降级为 Node 内置 node:sqlite');
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  credits INTEGER NOT NULL DEFAULT 0,
  member_expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  result_path TEXT,
  params TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  error TEXT,
  cost INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_gen_user ON generations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  member_days INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  pay_method TEXT NOT NULL DEFAULT 'wechat',
  transaction_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_order_user ON orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  change INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  type TEXT NOT NULL,
  remark TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_log_user ON credit_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_code_email ON email_codes(email, purpose, created_at DESC);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  name TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_key ON api_keys(key);

CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  user_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_err_time ON error_logs(created_at DESC);
`);

// 兼容旧库的增量字段（已存在则忽略）
for (const sql of [
  'ALTER TABLE users ADD COLUMN last_daily_at INTEGER',
  'ALTER TABLE users ADD COLUMN invite_code TEXT',
  'ALTER TABLE users ADD COLUMN invited_by TEXT',
  'ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0',
  'ALTER TABLE generations ADD COLUMN batch_id TEXT',
  'ALTER TABLE generations ADD COLUMN share_id TEXT'
]) {
  try { db.exec(sql); } catch (e) { /* column exists */ }
}

module.exports = db;
