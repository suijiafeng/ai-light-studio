import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, register, uploadImage, waitGeneration } from './helpers.js'

async function getAdminToken() {
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'test123456' })
  if (login.body.code === 200) return login.body.data.token
  return (await register('admin@test.com')).token
}

describe('管理员订单列表', () => {
  it('普通用户403，管理员可分页查询并按状态/关键词筛选', async () => {
    const adminToken = await getAdminToken()
    const { token } = await register('ao1@test.com')
    // 造一笔已支付订单
    const order = await request(app).post('/api/pay/order')
      .set('Authorization', `Bearer ${token}`).send({ packageId: 'p_10' })
    await request(app).post(`/api/pay/mock/${order.body.data.orderId}`).set('Authorization', `Bearer ${token}`)

    const forbid = await request(app).get('/api/stats/orders').set('Authorization', `Bearer ${token}`)
    expect(forbid.body.code).toBe(403)

    const all = await request(app).get('/api/stats/orders').set('Authorization', `Bearer ${adminToken}`)
    expect(all.body.code).toBe(200)
    expect(all.body.data.total).toBeGreaterThan(0)
    expect(all.body.data.list[0]).toHaveProperty('email')

    const paid = await request(app).get('/api/stats/orders?status=paid&keyword=ao1@test.com')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(paid.body.data.total).toBe(1)
    expect(paid.body.data.list[0].status).toBe('paid')

    const none = await request(app).get('/api/stats/orders?status=refunded&keyword=ao1@test.com')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(none.body.data.total).toBe(0)
  })
})

describe('管理员删除生成记录', () => {
  it('删除后记录消失、结果图文件清除，不存在的ID返回404', async () => {
    const adminToken = await getAdminToken()
    const { token } = await register('ao2@test.com')
    const fileId = await uploadImage(token)
    const gen = await request(app).post('/api/generate')
      .set('Authorization', `Bearer ${token}`).send({ fileId, params: {} })
    await waitGeneration(token, gen.body.data.id)

    const del = await request(app).delete(`/api/stats/generations/${gen.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(del.body.code).toBe(200)

    // 用户侧已查不到
    const check = await request(app).get(`/api/generate/${gen.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(check.body.code).toBe(404)

    const notFound = await request(app).delete('/api/stats/generations/nope')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(notFound.body.code).toBe(404)
  })

  it('普通用户无权删除', async () => {
    const { token } = await register('ao3@test.com')
    const res = await request(app).delete('/api/stats/generations/whatever')
      .set('Authorization', `Bearer ${token}`)
    expect(res.body.code).toBe(403)
  })
})
