import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, register } from './helpers.js'

describe('认证与账号', () => {
  it('注册成功并赠送免费算力', async () => {
    const { token, user } = await register('auth1@test.com')
    expect(token).toBeTruthy()
    expect(user.email).toBe('auth1@test.com')
    expect(user.credits).toBe(20)
    expect(user.inviteCode).toBeTruthy()
  })

  it('邮箱格式不正确返回400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bad', password: 'test123456' })
    expect(res.body.code).toBe(400)
  })

  it('密码少于6位返回400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'auth2@test.com', password: '123' })
    expect(res.body.code).toBe(400)
  })

  it('重复注册返回400', async () => {
    await register('auth3@test.com')
    const res = await request(app).post('/api/auth/register').send({ email: 'auth3@test.com', password: 'test123456' })
    expect(res.body.code).toBe(400)
    expect(res.body.msg).toContain('已注册')
  })

  it('登录成功 / 密码错误返回400', async () => {
    await register('auth4@test.com')
    const okRes = await request(app).post('/api/auth/login').send({ email: 'auth4@test.com', password: 'test123456' })
    expect(okRes.body.code).toBe(200)
    const badRes = await request(app).post('/api/auth/login').send({ email: 'auth4@test.com', password: 'wrong666' })
    expect(badRes.body.code).toBe(400)
  })

  it('无Token访问受保护接口返回401', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.body.code).toBe(401)
  })

  it('每日奖励同一天只发一次', async () => {
    const { token } = await register('auth5@test.com')
    const first = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(first.body.data.dailyBonus).toBe(5) // 注册当天首次访问发放
    const second = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(second.body.data.dailyBonus).toBe(0) // 同日第二次不再发放
    expect(second.body.data.user.credits).toBe(25)
  })

  it('邀请注册双方各得奖励', async () => {
    const a = await register('inviter@test.com')
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${a.token}`)
    const inviteCode = me.body.data.user.inviteCode
    const b = await register('invitee@test.com', 'test123456', { inviteCode })
    expect(b.user.credits).toBe(30) // 20注册 + 10受邀
    const after = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${a.token}`)
    expect(after.body.data.credits).toBe(35) // 20 + 5日签 + 10邀请
  })

  it('管理员邮箱注册自动获得admin角色', async () => {
    const { user } = await register('admin@test.com')
    expect(user.role).toBe('admin')
  })

  it('找回密码：验证码重置后可用新密码登录', async () => {
    await register('reset@test.com')
    const send = await request(app).post('/api/auth/send-code').send({ email: 'reset@test.com', purpose: 'reset' })
    expect(send.body.code).toBe(200)
    const code = send.body.data.devCode // 未配SMTP为开发模式
    const reset = await request(app).post('/api/auth/reset-password')
      .send({ email: 'reset@test.com', code, newPassword: 'newpass888' })
    expect(reset.body.code).toBe(200)
    const login = await request(app).post('/api/auth/login').send({ email: 'reset@test.com', password: 'newpass888' })
    expect(login.body.code).toBe(200)
  })

  it('注销账号：密码校验、数据删除、无法再登录', async () => {
    const { token } = await register('bye@test.com')
    const wrong = await request(app).delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`).send({ password: 'wrong666' })
    expect(wrong.body.code).toBe(400)
    const okRes = await request(app).delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`).send({ password: 'test123456' })
    expect(okRes.body.code).toBe(200)
    const login = await request(app).post('/api/auth/login').send({ email: 'bye@test.com', password: 'test123456' })
    expect(login.body.code).toBe(400)
  })
})
