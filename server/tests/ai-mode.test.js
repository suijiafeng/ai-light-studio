import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, register, uploadImage, waitGeneration } from './helpers.js'

async function getAdminToken() {
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'test123456' })
  if (login.body.code === 200) return login.body.data.token
  return (await register('admin@test.com')).token
}

describe('AI出图模式运行时切换（演示/真实）', () => {
  it('普通用户无权查看与切换', async () => {
    const { token } = await register('am1@test.com')
    expect((await request(app).get('/api/stats/ai-mode').set('Authorization', `Bearer ${token}`)).body.code).toBe(403)
    expect((await request(app).post('/api/stats/ai-mode').set('Authorization', `Bearer ${token}`).send({ provider: 'mock' })).body.code).toBe(403)
  })

  it('管理员查看当前模式与可用性', async () => {
    const adminToken = await getAdminToken()
    const res = await request(app).get('/api/stats/ai-mode').set('Authorization', `Bearer ${adminToken}`)
    expect(res.body.code).toBe(200)
    expect(res.body.data.provider).toBe('mock') // 测试环境默认演示模式
    expect(res.body.data.available.mock).toBe(true)
    expect(res.body.data.available.fal).toBe(false) // 测试环境未配密钥
  })

  it('无效模式与未配密钥的模式被拒绝', async () => {
    const adminToken = await getAdminToken()
    const bad = await request(app).post('/api/stats/ai-mode')
      .set('Authorization', `Bearer ${adminToken}`).send({ provider: 'xxx' })
    expect(bad.body.code).toBe(400)
    const noKey = await request(app).post('/api/stats/ai-mode')
      .set('Authorization', `Bearer ${adminToken}`).send({ provider: 'fal' })
    expect(noKey.body.code).toBe(400)
    expect(noKey.body.msg).toContain('FAL_API_KEY')
  })

  it('切换为演示模式后生成走本地模拟且持久生效', async () => {
    const adminToken = await getAdminToken()
    const set = await request(app).post('/api/stats/ai-mode')
      .set('Authorization', `Bearer ${adminToken}`).send({ provider: 'mock' })
    expect(set.body.code).toBe(200)

    // styles 接口对外暴露当前模式（前端演示角标依赖它）
    const styles = await request(app).get('/api/generate/styles')
    expect(styles.body.data.aiProvider).toBe('mock')

    // 演示模式下完整出图可用
    const { token } = await register('am2@test.com')
    const fileId = await uploadImage(token)
    const gen = await request(app).post('/api/generate')
      .set('Authorization', `Bearer ${token}`).send({ fileId, params: {} })
    const done = await waitGeneration(token, gen.body.data.id)
    expect(done.status).toBe('success')
  })
})
