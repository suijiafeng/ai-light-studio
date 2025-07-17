import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, register, uploadImage, waitGeneration } from './helpers.js'

describe('AI生成', () => {
  it('风格列表包含4种风格与5个光向', async () => {
    const res = await request(app).get('/api/generate/styles')
    expect(res.body.data.styles).toHaveLength(4)
    expect(res.body.data.directions).toHaveLength(5)
    expect(res.body.data.costPerGeneration).toBe(5)
  })

  it('缺少图片/无效参数返回400', async () => {
    const { token } = await register('gen1@test.com')
    const noFile = await request(app).post('/api/generate')
      .set('Authorization', `Bearer ${token}`).send({ params: {} })
    expect(noFile.body.code).toBe(400)

    const fileId = await uploadImage(token)
    const badStyle = await request(app).post('/api/generate')
      .set('Authorization', `Bearer ${token}`).send({ fileId, params: { style: 'xxx' } })
    expect(badStyle.body.code).toBe(400)
    const badTemp = await request(app).post('/api/generate')
      .set('Authorization', `Bearer ${token}`).send({ fileId, params: { colorTemp: 999 } })
    expect(badTemp.body.code).toBe(400)
  })

  it('完整生成：扣费→出图成功→历史可查', async () => {
    const { token } = await register('gen2@test.com')
    const fileId = await uploadImage(token)
    const res = await request(app).post('/api/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileId, params: { style: 'night_warm', brightness: 60, direction: 'left' } })
    expect(res.body.code).toBe(200)

    const done = await waitGeneration(token, res.body.data.id)
    expect(done.status).toBe('success')
    expect(done.resultUrl).toMatch(/^\/results\//)

    // 扣费5：20 - 5 = 15
    const bal = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${token}`)
    expect(bal.body.data.credits).toBe(15)

    // 历史与筛选
    const hist = await request(app).get('/api/generate?style=night_warm').set('Authorization', `Bearer ${token}`)
    expect(hist.body.data.total).toBe(1)
    const none = await request(app).get('/api/generate?style=daylight').set('Authorization', `Bearer ${token}`)
    expect(none.body.data.total).toBe(0)
  })

  it('算力不足返回429且不创建任务', async () => {
    const { token, user } = await register('gen3@test.com')
    const { changeCredits } = await import('../src/services/credits.js')
    changeCredits(user.id, -18, 'consume', '压到2') // 余额2 < 5
    const fileId = await uploadImage(token)
    const res = await request(app).post('/api/generate')
      .set('Authorization', `Bearer ${token}`).send({ fileId, params: {} })
    expect(res.body.code).toBe(429)
  })

  it('4风格连拍：4条任务全部成功、总扣8算力', async () => {
    const { token } = await register('gen4@test.com')
    const fileId = await uploadImage(token)
    const res = await request(app).post('/api/generate/batch')
      .set('Authorization', `Bearer ${token}`).send({ fileId, params: { brightness: 50 } })
    expect(res.body.data.ids).toHaveLength(4)

    for (const id of res.body.data.ids) {
      const g = await waitGeneration(token, id)
      expect(g.status).toBe('success')
    }
    const bal = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${token}`)
    expect(bal.body.data.credits).toBe(12) // 20 - 8
  })

  it('批量处理：未付费403，模拟支付后可用', async () => {
    const { token } = await register('gen5@test.com')
    const fileId = await uploadImage(token)
    const forbid = await request(app).post('/api/generate/bulk')
      .set('Authorization', `Bearer ${token}`).send({ fileIds: [fileId], params: {} })
    expect(forbid.body.code).toBe(403)

    // 模拟支付解锁
    const order = await request(app).post('/api/pay/order')
      .set('Authorization', `Bearer ${token}`).send({ packageId: 'p_10' })
    await request(app).post(`/api/pay/mock/${order.body.data.orderId}`).set('Authorization', `Bearer ${token}`)
    const okRes = await request(app).post('/api/generate/bulk')
      .set('Authorization', `Bearer ${token}`).send({ fileIds: [fileId], params: { style: 'daylight' } })
    expect(okRes.body.code).toBe(200)
  })

  it('AI灯光顾问返回推荐参数与理由', async () => {
    const { token } = await register('gen6@test.com')
    const fileId = await uploadImage(token)
    const res = await request(app).post('/api/generate/advise')
      .set('Authorization', `Bearer ${token}`).send({ fileId })
    expect(res.body.code).toBe(200)
    expect(res.body.data.recommend).toHaveProperty('style')
    expect(res.body.data.recommend).toHaveProperty('colorTemp')
    expect(res.body.data.reason.length).toBeGreaterThan(10)
  })

  it('分享：生成链接后可公开访问，无效ID返回404', async () => {
    const { token } = await register('gen7@test.com')
    const fileId = await uploadImage(token)
    const gen = await request(app).post('/api/generate')
      .set('Authorization', `Bearer ${token}`).send({ fileId, params: {} })
    await waitGeneration(token, gen.body.data.id)

    const share = await request(app).post(`/api/generate/${gen.body.data.id}/share`)
      .set('Authorization', `Bearer ${token}`)
    const shareId = share.body.data.shareId
    expect(shareId).toBeTruthy()

    const pub = await request(app).get(`/api/generate/share/${shareId}`) // 无需登录
    expect(pub.body.code).toBe(200)
    expect(pub.body.data.resultUrl).toBeTruthy()

    const notFound = await request(app).get('/api/generate/share/nope404')
    expect(notFound.body.code).toBe(404)
  })
})
