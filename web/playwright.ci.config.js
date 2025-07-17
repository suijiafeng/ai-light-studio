// E2E备用配置：服务已在外部启动时使用（CI或手动起服场景）
// 用法：先自行启动后端(3000)与前端(5173)，再执行
//   npx playwright test -c playwright.ci.config.js
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  use: {
    // 可用 E2E_BASE_URL 指向已构建产物的后端地址（如 http://localhost:3000）
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    screenshot: 'only-on-failure'
  }
})
