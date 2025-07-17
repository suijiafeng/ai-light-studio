import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, register } from './helpers.js'

describe('支付与会员', () => {
  it('套餐列表包含算力包与会员套餐', async () => {
    const res = await request(app).get('/api/pay/packages')
    expect(res.body.code).toBe(200)
    const types = res.body.data.packages.map(p => p.type)
    expect(types).toContain('credits')
    expect(types).toContain('member')
  })

  it('无效套餐下单返回400', async () => {
    const { token } = await register('pay1@test.com')
    const res = await request(app).post('/api/pay/order')
      .set('Authorization', `Bearer ${token}`).send({ packageId: 'nope' })
    expect(res.body.code).toBe(400)
  })

  it('算力包：下单→模拟支付→算力到账→重复支付幂等', async () => {
    const { token } = await register('pay2@test.com')
    const order = await request(app).post('/api/pay/order')
      .set('Authorization', `Bearer ${token}`).send({ packageId: 'p_10' })
    expect(order.body.data.codeUrl).toBeTruthy()
    const orderId = order.body.data.orderId

    const pay = await request(app).post(`/api/pay/mock/${orderId}`).set('Authorization', `Bearer ${token}`)
    expect(pay.body.data.status).toBe('paid')

    const bal = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${token}`)
    expect(bal.body.data.credits).toBe(120) // 20 + 100

    // 幂等：重复模拟支付不重复加钱
    await request(app).post(`/api/pay/mock/${orderId}`).set('Authorization', `Bearer ${token}`)
    const bal2 = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${token}`)
    expect(bal2.body.data.credits).toBe(120)
  })

  it('会员套餐：支付后会员生效且有到期时间', async () => {
    const { token } = await register('pay3@test.com')
    const order = await request(app).post('/api/pay/order')
      .set('Authorization', `Bearer ${token}`).send({ packageId: 'm_month' })
    await request(app).post(`/api/pay/mock/${order.body.data.orderId}`).set('Authorization', `Bearer ${token}`)

    const bal = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${token}`)
    expect(bal.body.data.isMember).toBe(true)
    expect(bal.body.data.memberExpiresAt).toBeGreaterThan(Date.now() + 29 * 86400000)
  })

  it('订单列表可查询', async () => {
    const { token } = await register('pay4@test.com')
    await request(app).post('/api/pay/order').set('Authorization', `Bearer ${token}`).send({ packageId: 'p_10' })
    const res = await request(app).get('/api/pay/orders').set('Authorization', `Bearer ${token}`)
    expect(res.body.data.total).toBe(1)
    expect(res.body.data.list[0].status).toBe('pending')
  })
})
