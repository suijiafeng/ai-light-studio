// Playwright E2E 配置
// 运行前一次性安装浏览器：npx playwright install chromium
// 运行：npm run test:e2e   （自动拉起后端+前端，使用独立E2E数据库，不污染真实数据）
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'node src/index.js',
      cwd: '../server',
      port: 3000,
      reuseExistingServer: false,
      env: {
        // 可用 E2E_DATA_DIR 覆盖数据目录（默认 server/data-e2e）
        DB_PATH: `${process.env.E2E_DATA_DIR || './data-e2e'}/app.db`,
        UPLOAD_DIR: `${process.env.E2E_DATA_DIR || './data-e2e'}/uploads`,
        RESULT_DIR: `${process.env.E2E_DATA_DIR || './data-e2e'}/results`,
        AI_PROVIDER: 'mock',
        PAY_PROVIDER: 'mock',
        RATE_LIMIT_DISABLED: '1',
        // 管理后台用例注册 admin@test.com 并断言可进后台；不在此显式声明的话
        // 就会依赖开发者本机 server/.env 的 ADMIN_EMAILS，clean clone 上必然失败
        ADMIN_EMAILS: 'admin@test.com',
        JWT_SECRET: 'e2e-secret'
      }
    },
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: false
    }
  ]
})
