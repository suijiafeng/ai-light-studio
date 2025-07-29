import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import LoginView from '@/views/LoginView.vue'
import { mountView, flush } from './utils.js'

const pushMock = vi.fn()

vi.mock('@/api', () => ({
  apiLogin: vi.fn(async () => ({ token: 't', user: { id: 'u1', credits: 20 } })),
  apiRegister: vi.fn(async () => ({ token: 't', user: { id: 'u1', credits: 20 } })),
  apiMe: vi.fn(async () => ({ user: { id: 'u1', credits: 20 }, dailyBonus: 0 })),
  apiSendCode: vi.fn(async () => ({ devCode: '123456' })),
  apiResetPassword: vi.fn(async () => ({}))
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: pushMock })
}))

import { apiRegister } from '@/api'

describe('登录注册页', () => {
  it('默认登录态，可切换到注册并显示协议勾选', async () => {
    const w = mountView(LoginView)
    expect(w.text()).toContain('欢迎回来')
    await w.findAll('a, .el-link').find(l => l.text().includes('免费注册')).trigger('click')
    await nextTick()
    expect(w.text()).toContain('注册账号')
    expect(w.text()).toContain('用户协议')
    w.unmount()
  })

  it('注册未勾选协议被拦截，不调用注册接口', async () => {
    const w = mountView(LoginView)
    await w.findAll('a, .el-link').find(l => l.text().includes('免费注册')).trigger('click')
    await nextTick()

    const inputs = w.findAll('input')
    await inputs.find(i => i.attributes('placeholder')?.includes('邮箱')).setValue('a@b.com')
    await inputs.find(i => i.attributes('placeholder') === '8-32位，含字母和数字').setValue('pass123456')
    await inputs.find(i => i.attributes('placeholder') === '再次输入密码').setValue('pass123456')

    const submitBtn = w.findAll('button').find(b => b.text().includes('注'))
    await submitBtn.trigger('click')
    await flush(); await nextTick()

    expect(apiRegister).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('请先阅读并勾选')
    w.unmount()
  })

  it('勾选协议后注册成功，自动切回登录并保留邮箱', async () => {
    const w = mountView(LoginView)
    await w.findAll('a, .el-link').find(l => l.text().includes('免费注册')).trigger('click')
    await nextTick()

    const inputs = w.findAll('input')
    await inputs.find(i => i.attributes('placeholder')?.includes('邮箱')).setValue('a@b.com')
    await inputs.find(i => i.attributes('placeholder') === '8-32位，含字母和数字').setValue('pass123456')
    await inputs.find(i => i.attributes('placeholder') === '再次输入密码').setValue('pass123456')
    await w.find('input[type="checkbox"]').setValue(true)

    const submitBtn = w.findAll('button').find(b => b.text().includes('注'))
    await submitBtn.trigger('click')
    await flush(); await nextTick(); await flush()

    expect(apiRegister).toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled() // 不自动登录跳转
    expect(w.text()).toContain('欢迎回来')   // 已切回登录态
    const emailInput = w.findAll('input').find(i => i.attributes('placeholder')?.includes('邮箱'))
    expect(emailInput.element.value).toBe('a@b.com') // 邮箱预填保留
    w.unmount()
  })
})
