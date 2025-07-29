/**
 * UI与交互专项E2E：主题切换、模板直达、移动端布局、路由守卫、管理后台
 */
import { test, expect } from '@playwright/test'

const closeToasts = page => page.evaluate(() => document.querySelectorAll('.el-message').forEach(e => e.remove()))

async function registerUser(page, email) {
  const pwd = 'e2epass123'
  const base = 'http://localhost:3000'
  // 账号准备走API（管理员邮箱注册需验证码，此处自动取devCode），避免UI注册受管理员邮箱限制
  const reg = await page.request.post(base + '/api/auth/register', { data: { email, password: pwd } })
  if (reg.status() !== 200) {
    const body = await reg.json().catch(() => ({}))
    if (/验证码/.test(body.msg || '')) {
      const sc = await page.request.post(base + '/api/auth/send-code', { data: { email, purpose: 'register' } })
      const code = (await sc.json()).data?.devCode
      await page.request.post(base + '/api/auth/register', { data: { email, password: pwd, code } })
    }
    // 已注册等其余情况：忽略，直接登录
  }
  // UI 登录（验证登录交互本身）
  await page.goto('/login')
  await page.getByPlaceholder('请输入邮箱').fill(email)
  await page.getByPlaceholder('8-32位，含字母和数字').fill(pwd)
  await page.getByRole('button', { name: '登 录', exact: true }).click()
  await page.waitForURL(/\/studio/)
  await closeToasts(page)
}

test('双主题切换全局生效且持久化', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/dark/) // 默认暗黑
  await page.locator('.header-right .el-button.is-circle').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).not.toHaveClass(/dark/) // 刷新后保持
  await page.locator('.header-right .el-button.is-circle').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('未登录访问受保护页自动跳登录，出现提示与抖动动画', async ({ page }) => {
  await page.goto('/history')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  // 抖动class是稳定信号（toast会自动消失，不作强断言）
  await expect(page.locator('.login-card.shake')).toBeVisible()
  // 已在登录页时点击其他受保护菜单，同样触发（URL变化即证明守卫生效）
  await page.getByRole('link', { name: '充值中心' }).click()
  await expect(page).toHaveURL(/redirect=(%2F|\/)recharge/)
})

test('首页模板卡片一键套用参数直达工作台', async ({ page }) => {
  await registerUser(page, `tpl${Date.now()}@test.com`)
  await page.goto('/')
  await page.locator('.tpl').first().click() // 客厅暖夜：3000K/亮度62/顶部
  await expect(page).toHaveURL(/\/studio\?/)
  await expect(page.locator('.param-label', { hasText: '色温' })).toContainText('3000K')
  await expect(page.locator('.param-label', { hasText: '亮度' })).toContainText('62')
  await expect(page.locator('.dir-item.active')).toHaveText('顶部')
})

test('移动端视口下工作台变为纵向单列布局', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await registerUser(page, `mob${Date.now()}@test.com`)
  const cols = await page.locator('.studio-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns)
  expect(cols.trim().split(/\s+/)).toHaveLength(1) // 单列
  // 头部导航仍可用（横向滚动不溢出破版）
  await expect(page.getByRole('link', { name: '历史图库' })).toBeVisible()
})

test('管理后台：五个页签均可访问，订单/用户/错误日志正常渲染', async ({ page }) => {
  await registerUser(page, 'admin@test.com') // ADMIN_EMAILS 中的邮箱
  await page.goto('/admin')
  await expect(page.getByText('权限不足')).toHaveCount(0)
  await expect(page.getByText('总用户 / 今日新增')).toBeVisible()

  await page.getByRole('tab', { name: '用户管理' }).click()
  await expect(page.locator('#pane-users .el-table')).toContainText('admin@test.com')

  await page.getByRole('tab', { name: '订单管理' }).click()
  await expect(page.getByPlaceholder('搜索订单号/邮箱')).toBeVisible()

  await page.getByRole('tab', { name: '错误日志' }).click()
  await expect(page.locator('#pane-errors .el-table')).toBeVisible()

  await page.getByRole('tab', { name: '内容抽查' }).click()
})

test('普通用户访问管理后台被拦截', async ({ page }) => {
  await registerUser(page, `nm${Date.now()}@test.com`)
  await page.goto('/admin')
  await expect(page.locator('.el-alert__title')).toContainText('权限不足')
})
