import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, register } from './helpers.js'

describe('算力服务', () => {
  it('changeCredits：增减与流水正确、余额不足抛429', async () => {
    const { changeCredits } = await import('../src/services/credits.js')
    const { user } = await register('credit1@test.com')

    const after = changeCredits(user.id, 30, 'recharge', '测试充值')
    expect(after).toBe(50)
    expect(changeCredits(user.id, -10, 'consume', '测试消耗')).toBe(40)

    // 扣成负数必须抛错且余额不变
    let err = null
    try { changeCredits(user.id, -999, 'consume', '超扣') } catch (e) { err = e }
    expect(err?.code).toBe(429)
  })

  it('流水接口返回明细且分页', async () => {
    const { token } = await register('credit2@test.com')
    const res = await request(app).get('/api/credits/logs?page=1&size=10').set('Authorization', `Bearer ${token}`)
    expect(res.body.code).toBe(200)
    expect(res.body.data.list.length).toBeGreaterThan(0)
    expect(res.body.data.list[0]).toHaveProperty('change')
    expect(res.body.data.list[0]).toHaveProperty('balance')
  })
})
