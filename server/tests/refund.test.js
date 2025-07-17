import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, register } from './helpers.js'

async function getAdminToken() {
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'test123456' })
  if (login.body.code === 200) return login.body.data.token
  return (await register('admin@test.com')).token
}

async function paidOrder(token, packageId = 'p_10') {
  const order = await request(app).post('/api/pay/order')
    .set('Authorization', `Bearer ${token}`).send({ packageId })
  await request(app).post(`/api/pay/mock/${order.body.data.orderId}`).set('Authorization', `Bearer ${token}`)
  return order.body.data.orderId
}

describe('订单退款', () => {
  it('普通用户无权退款', async () => {
    const { token } = await register('rf1@test.com')
    const orderId = await paidOrder(token)
    const res = await request(app).post(`/api/pay/refund/${orderId}`)
      .set('Authorization', `Bearer ${token}`).send({})
    expect(res.body.code).toBe(403)
  })

  it('管理员退款：订单置refunded、算力扣回、幂等拒绝二次退款', async () => {
    const adminToken = await getAdminToken()
    const { token } = await register('rf2@test.com')
    const orderId = await paidOrder(token) // 20 + 100 = 120

    const res = await request(app).post(`/api/pay/refund/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ reason: '测试退款' })
    expect(res.body.code).toBe(200)
    expect(res.body.data.refundId).toBeTruthy()

    const bal = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${token}`)
    expect(bal.body.data.credits).toBe(20) // 扣回100

    const orders = await request(app).get('/api/pay/orders').set('Authorization', `Bearer ${token}`)
    expect(orders.body.data.list[0].status).toBe('refunded')

    // 二次退款被拒
    const again = await request(app).post(`/api/pay/refund/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`).send({})
    expect(again.body.code).toBe(400)
  })

  it('用户余额不足以扣回时拒绝退款', async () => {
    const adminToken = await getAdminToken()
    const { token, user } = await register('rf3@test.com')
    const orderId = await paidOrder(token) // 120
    // 消耗到只剩50，不足扣回100
    const { changeCredits } = await import('../src/services/credits.js')
    changeCredits(user.id, -70, 'consume', '模拟消耗')

    const res = await request(app).post(`/api/pay/refund/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`).send({})
    expect(res.body.code).toBe(400)
    expect(res.body.msg).toContain('不足')
  })

  it('会员套餐退款回收会员时长', async () => {
    const adminToken = await getAdminToken()
    const { token } = await register('rf4@test.com')
    const orderId = await paidOrder(token, 'm_month')

    let bal = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${token}`)
    expect(bal.body.data.isMember).toBe(true)

    await request(app).post(`/api/pay/refund/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`).send({})
    bal = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${token}`)
    expect(bal.body.data.isMember).toBe(false)
  })
})

describe('错误日志', () => {
  it('前端上报入库，管理员可查，普通用户403', async () => {
    await request(app).post('/api/log/error')
      .send({ message: '测试前端错误', stack: 'Error: test\n at x', url: 'http://localhost/studio' })

    const { token } = await register('err1@test.com')
    const forbid = await request(app).get('/api/stats/errors').set('Authorization', `Bearer ${token}`)
    expect(forbid.body.code).toBe(403)

    const adminToken = await getAdminToken()
    const res = await request(app).get('/api/stats/errors').set('Authorization', `Bearer ${adminToken}`)
    expect(res.body.code).toBe(200)
    expect(res.body.data.list.some(e => e.message === '测试前端错误' && e.source === 'web')).toBe(true)
  })
})
