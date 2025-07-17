/**
 * 测试环境初始化：独立临时数据目录 + 关闭限流 + 固定配置
 * 必须在业务模块被 require 之前执行（vitest setupFiles 保证）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'als-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.RESULT_DIR = path.join(tmp, 'results');
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_DISABLED = '1';
process.env.AI_PROVIDER = 'mock';
process.env.PAY_PROVIDER = 'mock';
process.env.FREE_CREDITS = '20';
process.env.COST_PER_GENERATION = '5';
process.env.DAILY_CREDITS = '5';
process.env.MULTI_COST = '8';
process.env.INVITE_BONUS = '10';
process.env.ADMIN_EMAILS = 'admin@test.com';
process.env.EMAIL_VERIFY = 'off';
