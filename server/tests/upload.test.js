import { describe, it, expect } from 'vitest'
import request from 'supertest'
import sharp from 'sharp'
import { app, register } from './helpers.js'

const uploadBuf = (token, buf, name, type) =>
  request(app).post('/api/generate/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buf, { filename: name, contentType: type })

describe('上传校验', () => {
  it('正常图片上传成功并返回真实尺寸，扩展名按内容归一', async () => {
    const { token } = await register('up1@test.com')
    const buf = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#888' } }).png().toBuffer()
    // 故意用错误扩展名和mimetype伪装成jpg
    const res = await uploadBuf(token, buf, 'fake.jpg', 'image/jpeg')
    expect(res.body.code).toBe(200)
    expect(res.body.data.width).toBe(300)
    expect(res.body.data.height).toBe(200)
    expect(res.body.data.fileId).toMatch(/\.png$/) // 按真实内容（png）归一扩展名
  })

  it('伪装成图片的文本文件被内容嗅探拒绝', async () => {
    const { token } = await register('up2@test.com')
    const res = await uploadBuf(token, Buffer.from('<script>alert(1)</script>不是图片'), 'evil.jpg', 'image/jpeg')
    expect(res.body.code).toBe(400)
    expect(res.body.msg).toContain('不是有效图片')
  })

  it('mimetype不合法直接拒绝', async () => {
    const { token } = await register('up3@test.com')
    const res = await uploadBuf(token, Buffer.from('%PDF-1.4'), 'doc.pdf', 'application/pdf')
    expect(res.body.code).toBe(400)
    expect(res.body.msg).toContain('仅支持')
  })

  it('尺寸过小的图片被拒绝', async () => {
    const { token } = await register('up4@test.com')
    const buf = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#888' } }).jpeg().toBuffer()
    const res = await uploadBuf(token, buf, 'tiny.jpg', 'image/jpeg')
    expect(res.body.code).toBe(400)
    expect(res.body.msg).toContain('过小')
  })

  it('超大文件（>15MB）被拒绝', async () => {
    const { token } = await register('up5@test.com')
    // 构造16MB伪jpg（会先被大小限制拦截，无需真实图片）
    const big = Buffer.alloc(16 * 1024 * 1024, 1)
    const res = await uploadBuf(token, big, 'big.jpg', 'image/jpeg')
    expect(res.body.code).toBe(400)
    expect(res.body.msg).toContain('15MB')
  })

  it('未登录不能上传', async () => {
    const buf = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#888' } }).jpeg().toBuffer()
    const res = await request(app).post('/api/generate/upload').attach('file', buf, 'a.jpg')
    expect(res.body.code).toBe(401)
  })
})
