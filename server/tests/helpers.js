import request from 'supertest'
import sharp from 'sharp'
import app from '../src/app.js'

export { app }

/** 注册并返回 { token, user } */
export async function register(email, password = 'test123456', extra = {}) {
  const res = await request(app).post('/api/auth/register').send({ email, password, ...extra })
  if (res.body.code !== 200) throw new Error(`注册失败: ${res.body.msg}`)
  return res.body.data
}

/** 生成一张测试图片Buffer */
export function makeImage(width = 320, height = 240) {
  return sharp({ create: { width, height, channels: 3, background: { r: 160, g: 150, b: 140 } } })
    .jpeg().toBuffer()
}

/** 上传测试图，返回 fileId */
export async function uploadImage(token) {
  const buf = await makeImage()
  const res = await request(app)
    .post('/api/generate/upload')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buf, 'room.jpg')
  return res.body.data.fileId
}

/** 轮询等待生成任务完成 */
export async function waitGeneration(token, id, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await request(app).get(`/api/generate/${id}`).set('Authorization', `Bearer ${token}`)
    if (res.body.data.status !== 'processing') return res.body.data
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('生成超时')
}
