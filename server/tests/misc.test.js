import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { app, register } from './helpers.js'
import { rateLimit } from '../src/middleware/rateLimit.js'

describe('限流中间件', () => {
  it('超过次数返回429，窗口重置后恢复', () => {
    vi.useFakeTimers()
    const mw = rateLimit({ windowMs: 1000, max: 2, key: 'unit-test' })
    const req = { headers: {}, ip: '1.2.3.4' }
    const results = []
    const res = { status: c => ({ json: b => results.push(b.code) }), json: b => results.push(b.code) }
    const next = () => results.push('pass')

    // RATE_LIMIT_DISABLED=1 时跳过，先临时开启
    const old = process.env.RATE_LIMIT_DISABLED
    delete process.env.RATE_LIMIT_DISABLED

    mw(req, res, next); mw(req, res, next); mw(req, res, next)
    expect(results).toEqual(['pass', 'pass', 429])

    vi.advanceTimersByTime(1100)
    mw(req, res, next)
    expect(results[3]).toBe('pass')

    process.env.RATE_LIMIT_DISABLED = old
    vi.useRealTimers()
  })
})

describe('开放API密钥', () => {
  it('创建密钥→X-API-Key可调用→吊销后失效', async () => {
    const { token } = await register('key1@test.com')
    const created = await request(app).post('/api/keys')
      .set('Authorization', `Bearer ${token}`).send({ name: '测试密钥' })
    const key = created.body.data.key
    expect(key).toMatch(/^als_/)

    const via = await request(app).get('/api/credits/balance').set('X-API-Key', key)
    expect(via.body.code).toBe(200)
    expect(via.body.data.credits).toBe(20)

    await request(app).delete(`/api/keys/${created.body.data.id}`).set('Authorization', `Bearer ${token}`)
    const revoked = await request(app).get('/api/credits/balance').set('X-API-Key', key)
    expect(revoked.body.code).toBe(401)
  })
})

describe('管理后台', () => {
  it('普通用户访问统计返回403，管理员正常', async () => {
    const { token: userToken } = await register('misc1@test.com')
    const forbid = await request(app).get('/api/stats/overview').set('Authorization', `Bearer ${userToken}`)
    expect(forbid.body.code).toBe(403)

    // admin@test.com 在测试配置的 ADMIN_EMAILS 中（auth.test 已注册则直接登录）
    let adminToken
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'test123456' })
    if (login.body.code === 200) adminToken = login.body.data.token
    else adminToken = (await register('admin@test.com')).token

    const okRes = await request(app).get('/api/stats/overview').set('Authorization', `Bearer ${adminToken}`)
    expect(okRes.body.code).toBe(200)
    expect(okRes.body.data.users.total).toBeGreaterThan(0)
  })

  it('管理员调整算力与封禁生效', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'test123456' })
    const adminToken = login.body.data.token
    const { token: vToken, user } = await register('victim@test.com')

    const adj = await request(app).post(`/api/stats/users/${user.id}/credits`)
      .set('Authorization', `Bearer ${adminToken}`).send({ change: 50 })
    expect(adj.body.data.balance).toBe(70)

    await request(app).post(`/api/stats/users/${user.id}/ban`)
      .set('Authorization', `Bearer ${adminToken}`).send({ banned: true })
    const blocked = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${vToken}`)
    expect(blocked.body.code).toBe(403)
  })
})

describe('基础', () => {
  it('健康检查与统一404', async () => {
    const health = await request(app).get('/api/health')
    expect(health.body.code).toBe(200)
    const nf = await request(app).get('/api/not-exist')
    expect(nf.body.code).toBe(404)
  })
})
