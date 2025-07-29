import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, register } from './helpers.js'

// 测试环境：super@test.com 为超管、admin@test.com 为管理员（见 setup.js）
async function tokenOf(email) {
  const login = await request(app).post('/api/auth/login').send({ email, password: 'test123456' })
  if (login.body.code === 200) return login.body.data.token
  return (await register(email)).token
}

describe('超级管理员权限体系', () => {
  it('角色正确：超管super、管理员admin', async () => {
    const st = await tokenOf('super@test.com')
    const at = await tokenOf('admin@test.com')
    const sme = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${st}`)
    const ame = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${at}`)
    expect(sme.body.data.user.role).toBe('super')
    expect(ame.body.data.user.role).toBe('admin')
  })

  it('管理员不可互相操作，也不可操作超管', async () => {
    const at = await tokenOf('admin@test.com')
    const st = await tokenOf('super@test.com')
    const admin2 = await register('admin2t@test.com')
    // 超管先把 admin2 授权为管理员
    const grant = await request(app).post(`/api/stats/users/${admin2.user.id}/role`)
      .set('Authorization', `Bearer ${st}`).send({ role: 'admin' })
    expect(grant.body.code).toBe(200)

    // 管理员封禁另一位管理员 → 403
    const banPeer = await request(app).post(`/api/stats/users/${admin2.user.id}/ban`)
      .set('Authorization', `Bearer ${at}`).send({ banned: true })
    expect(banPeer.body.code).toBe(403)
    expect(banPeer.body.msg).toContain('不可互相操作')

    // 管理员调整另一位管理员算力 → 403
    const adjPeer = await request(app).post(`/api/stats/users/${admin2.user.id}/credits`)
      .set('Authorization', `Bearer ${at}`).send({ change: 10 })
    expect(adjPeer.body.code).toBe(403)

    // 管理员操作超管 → 403
    const sme = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${st}`)
    const banSuper = await request(app).post(`/api/stats/users/${sme.body.data.user.id}/ban`)
      .set('Authorization', `Bearer ${at}`).send({ banned: true })
    expect(banSuper.body.code).toBe(403)
    expect(banSuper.body.msg).toContain('超级管理员')
  })

  it('授权/撤销/删除管理员为超管专属，管理员调用403', async () => {
    const at = await tokenOf('admin@test.com')
    const { user } = await register('normal1@test.com')

    const grantByAdmin = await request(app).post(`/api/stats/users/${user.id}/role`)
      .set('Authorization', `Bearer ${at}`).send({ role: 'admin' })
    expect(grantByAdmin.body.code).toBe(403)

    const delByAdmin = await request(app).delete(`/api/stats/users/${user.id}`)
      .set('Authorization', `Bearer ${at}`)
    expect(delByAdmin.body.code).toBe(403)
  })

  it('超管可授权、撤销、封禁、删除管理员；但不可删除/降级超管', async () => {
    const st = await tokenOf('super@test.com')
    const target = await register('victim2@test.com')

    // 授权
    expect((await request(app).post(`/api/stats/users/${target.user.id}/role`)
      .set('Authorization', `Bearer ${st}`).send({ role: 'admin' })).body.code).toBe(200)
    // 封禁管理员（超管可以）
    expect((await request(app).post(`/api/stats/users/${target.user.id}/ban`)
      .set('Authorization', `Bearer ${st}`).send({ banned: true })).body.code).toBe(200)
    // 删除管理员
    expect((await request(app).delete(`/api/stats/users/${target.user.id}`)
      .set('Authorization', `Bearer ${st}`)).body.code).toBe(200)
    // 删除后无法登录
    const login = await request(app).post('/api/auth/login').send({ email: 'victim2@test.com', password: 'test123456' })
    expect(login.body.code).toBe(400)

    // 不可删除超管自己
    const sme = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${st}`)
    const delSuper = await request(app).delete(`/api/stats/users/${sme.body.data.user.id}`)
      .set('Authorization', `Bearer ${st}`)
    expect(delSuper.body.code).toBe(403)
  })
})
