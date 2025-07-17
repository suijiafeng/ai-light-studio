/**
 * 冒烟E2E：注册 → 上传出图 → 图库查看（弹窗唯一性回归）→ 模拟充值到账
 * 真实浏览器完整链路，任何交互层回归都会在这里暴露
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const email = `e2e${Date.now()}@test.com`
const password = 'e2epass123'

// 无头浏览器会节流toast的自动关闭定时器，堆积的toast会遮挡按钮；交互前统一清掉
const closeToasts = page => page.evaluate(() => document.querySelectorAll('.el-message').forEach(e => e.remove()))

test('注册→出图→图库对比→充值 全链路', async ({ page }) => {
  // ---------- 1. 注册 ----------
  await page.goto('/')
  await page.getByRole('button', { name: '登录 / 注册' }).click()
  await page.getByText('免费注册').click()
  await page.getByPlaceholder('请输入邮箱').fill(email)
  await page.getByPlaceholder('至少6位密码').fill(password)
  await page.locator('.agree .el-checkbox__label').click()
  await page.getByRole('button', { name: '注 册', exact: true }).click()

  // 注册成功进入工作台，头部显示算力
  await expect(page).toHaveURL(/\/studio/)
  await expect(page.locator('.credits-tag')).toContainText('算力')

  // ---------- 2. 上传并生成 ----------
  await page.locator('input[type=file]').first().setInputFiles(path.join(__dirname, 'fixtures/room.jpg'))
  await expect(page.getByText('上传成功')).toBeVisible()

  await page.getByRole('button', { name: /开始生成/ }).click()
  // mock模式约2-3秒出图
  await expect(page.getByText('生成完成！')).toBeVisible({ timeout: 60000 })
  await expect(page.locator('.result-actions')).toBeVisible()
  await closeToasts(page)

  // 对比滑块可切换
  await page.getByRole('button', { name: '对比' }).first().click()
  await expect(page.locator('.compare')).toHaveCount(1)

  // ---------- 3. 历史图库：弹窗唯一性回归 ----------
  await page.getByRole('link', { name: '历史图库' }).click()
  await expect(page.locator('.item')).toHaveCount(1)

  await closeToasts(page)
  await page.locator('.thumb').first().click()
  // 关键断言：有且只有一个弹窗，内容是对比滑块，不允许出现多个预览层
  await expect(page.locator('.el-dialog')).toHaveCount(1)
  await expect(page.locator('.el-dialog .compare')).toHaveCount(1)
  await expect(page.locator('.el-image-viewer__wrapper')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.el-dialog')).toHaveCount(0)

  // ---------- 4. 充值：沙箱模拟支付到账 ----------
  await page.getByRole('link', { name: '充值中心' }).click()
  await closeToasts(page)
  await page.locator('.pkg').first().click()
  await page.getByRole('button', { name: /微信扫码支付/ }).click()

  await expect(page.locator('.el-dialog .qr')).toBeVisible()
  await page.getByRole('button', { name: /模拟支付成功/ }).click()
  await expect(page.getByText(/支付成功.*已到账/)).toBeVisible({ timeout: 15000 })

  // 余额准确到账：20注册 + 5日签 - 5生成 + 100充值 = 120
  await expect(page.locator('.credits-tag')).toContainText('120', { timeout: 15000 })
})
