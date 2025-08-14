const path = require('path');
require('dotenv').config();

const root = path.resolve(__dirname, '..');
const resolve = (p, def) => path.resolve(root, p || def);

module.exports = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  dbPath: resolve(process.env.DB_PATH, './data/app.db'),
  uploadDir: resolve(process.env.UPLOAD_DIR, './data/uploads'),
  resultDir: resolve(process.env.RESULT_DIR, './data/results'),
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  superAdminEmails: (process.env.SUPER_ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),

  freeCredits: Number(process.env.FREE_CREDITS || 20),
  costPerGeneration: Number(process.env.COST_PER_GENERATION || 5),
  dailyCredits: Number(process.env.DAILY_CREDITS || 5),
  multiCost: Number(process.env.MULTI_COST || 8),
  inviteBonus: Number(process.env.INVITE_BONUS || 10),
  bulkLimit: Number(process.env.BULK_LIMIT || 20),
  memberDiscount: Number(process.env.MEMBER_DISCOUNT || 0.9), // 会员购算力包折扣（1为不打折）
  freeMaxSize: Number(process.env.FREE_MAX_SIZE || 1024),
  premiumMaxSize: Number(process.env.PREMIUM_MAX_SIZE || 2048),
  watermarkText: process.env.WATERMARK_TEXT || '代码工匠AI灯光设计',

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  },
  emailVerify: process.env.EMAIL_VERIFY === 'on',

  ai: {
    provider: process.env.AI_PROVIDER || 'mock', // mock演示 | fal | replicate（后台可运行时切换）
    falKey: process.env.FAL_API_KEY || '',
    falModel: process.env.FAL_MODEL || 'fal-ai/iclight-v2',
    replicateToken: process.env.REPLICATE_API_TOKEN || '',
    replicateVersion: process.env.REPLICATE_MODEL_VERSION || '',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 180000)
  },
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o-mini'
  },

  pay: {
    provider: process.env.PAY_PROVIDER || 'mock',
    appid: process.env.WXPAY_APPID || '',
    mchid: process.env.WXPAY_MCHID || '',
    serial: process.env.WXPAY_SERIAL || '',
    privateKeyPath: process.env.WXPAY_PRIVATE_KEY_PATH ? resolve(process.env.WXPAY_PRIVATE_KEY_PATH, './cert/apiclient_key.pem') : '',
    apiv3Key: process.env.WXPAY_APIV3_KEY || '',
    notifyUrl: process.env.WXPAY_NOTIFY_URL || ''
  },
  packages: [
    { id: 'p_10', type: 'credits', title: '体验包', price: 990, credits: 100, desc: '100算力 · 约20次生成' },
    { id: 'p_30', type: 'credits', title: '进阶包', price: 2990, credits: 350, desc: '350算力 · 约70次生成' },
    { id: 'p_100', type: 'credits', title: '专业包', price: 9900, credits: 1500, desc: '1500算力 · 约300次生成' },
    { id: 'm_month', type: 'member', title: '月度会员', price: 3990, credits: 600, days: 30, desc: '600算力/月 · 会员标识 · 优先生成' },
    { id: 'm_year', type: 'member', title: '年度会员', price: 39900, credits: 8000, days: 365, desc: '8000算力/年 · 会员标识 · 优先生成' }
  ]
};
