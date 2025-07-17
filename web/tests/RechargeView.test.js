import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import RechargeView from '@/views/RechargeView.vue'
import { mountView, flush } from './utils.js'

vi.mock('@/api', () => ({
  apiPackages: vi.fn(async () => ({
    packages: [
      { id: 'p_10', type: 'credits', title: '体验包', price: 990, priceYuan: '9.90', credits: 100, desc: '100算力' },
      { id: 'm_month', type: 'member', title: '月度会员', price: 3990, priceYuan: '39.90', credits: 600, days: 30, desc: '600算力/月' }
    ],
    payProvider: 'mock'
  })),
  apiCreateOrder: vi.fn(async () => ({ orderId: 'O123', codeUrl: 'weixin://mock', mock: true })),
  apiOrderStatus: vi.fn(async () => ({ id: 'O123', status: 'pending', amountYuan: '9.90', credits: 100 })),
  apiMockPay: vi.fn(async () => ({ status: 'paid' })),
  apiMe: vi.fn(async () => ({ user: { id: 'u1', credits: 20 }, dailyBonus: 0 })),
  apiLogin: vi.fn(), apiRegister: vi.fn()
}))

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,MOCK') }
}))

import { apiCreateOrder, apiMockPay } from '@/api'

describe('充值中心', () => {
  it('渲染算力包与会员套餐，未选中时支付按钮禁用', async () => {
    const w = mountView(RechargeView)
    await flush(); await nextTick()

    expect(w.text()).toContain('体验包')
    expect(w.text()).toContain('月度会员')
    const payBtn = w.findAll('button').find(b => b.text().includes('微信扫码支付'))
    expect(payBtn.attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('选中套餐→下单→弹出二维码与沙箱模拟支付按钮→点击触发支付', async () => {
    const w = mountView(RechargeView)
    await flush(); await nextTick()

    await w.findAll('.pkg')[0].trigger('click')
    expect(w.findAll('.pkg')[0].classes()).toContain('active')

    const payBtn = w.findAll('button').find(b => b.text().includes('微信扫码支付'))
    expect(payBtn.attributes('disabled')).toBeUndefined()
    await payBtn.trigger('click')
    await flush(); await nextTick(); await flush(); await nextTick()

    expect(apiCreateOrder).toHaveBeenCalledWith('p_10')
    // 弹窗出现：二维码 + 模拟支付按钮
    expect(document.querySelectorAll('.el-dialog')).toHaveLength(1)
    expect(document.querySelector('.qr')).toBeTruthy()
    const mockBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('模拟支付成功'))
    expect(mockBtn).toBeTruthy()

    mockBtn.click()
    await flush()
    expect(apiMockPay).toHaveBeenCalledWith('O123')
    w.unmount()
  })
})
