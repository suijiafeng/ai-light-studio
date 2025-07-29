/**
 * 数据库查看工具（兼容 better-sqlite3 与 node:sqlite 两种驱动）
 *
 * 用法（在 server 目录下）：
 *   node scripts/query.js                          # 列出所有表与行数
 *   node scripts/query.js "SELECT * FROM users"    # 执行任意只读SQL
 *   node scripts/query.js users                    # 快捷查看某表最近20行
 */
const db = require('../src/db');

const arg = process.argv.slice(2).join(' ').trim();

function printRows(rows) {
  if (!rows.length) return console.log('（无数据）');
  console.table(rows.map(r => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      // 时间戳友好显示
      o[k] = /(_at|At)$/.test(k) && typeof v === 'number' && v > 1e12
        ? new Date(v).toLocaleString('zh-CN')
        : (typeof v === 'string' && v.length > 60 ? v.slice(0, 57) + '...' : v);
    }
    return o;
  }));
}

if (!arg) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  console.log('数据表一览：');
  for (const t of tables) {
    const c = db.prepare(`SELECT COUNT(*) c FROM "${t.name}"`).get().c;
    console.log(`  ${t.name.padEnd(16)} ${c} 行`);
  }
  console.log('\n查看某表: node scripts/query.js users\n执行SQL: node scripts/query.js "SELECT email, credits FROM users"');
} else if (/^[a-zA-Z_]+$/.test(arg)) {
  printRows(db.prepare(`SELECT * FROM "${arg}" ORDER BY rowid DESC LIMIT 20`).all());
} else if (/^\s*select/i.test(arg)) {
  printRows(db.prepare(arg).all());
} else {
  console.error('仅支持 SELECT 查询（防误改数据）');
  process.exit(1);
}
