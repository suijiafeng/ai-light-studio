import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, register, uploadImage } from './helpers.js'

/** 轮询等待工作流运行到终态 */
async function waitRun(token, runId, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await request(app).get(`/api/workflow/run/${runId}`).set('Authorization', `Bearer ${token}`)
    const { run, nodes } = res.body.data
    // status='canceled' 由 /cancel 立即翻转，但真正的收尾（退款/finished_at）由引擎下一次调度 tick 完成，
    // 必须等 finishedAt 落地才算真正到达终态，否则会读到"已取消但节点仍在跑"的中间态
    if (['success', 'failed', 'canceled'].includes(run.status) && run.finishedAt) return { run, nodes }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('工作流运行超时')
}

async function createWorkflow(token, graph, name = '测试工作流') {
  const res = await request(app).post('/api/workflow').set('Authorization', `Bearer ${token}`).send({ name, graph })
  if (res.body.code !== 200) throw new Error(`创建工作流失败: ${res.body.msg}`)
  return res.body.data.id
}

async function balance(token) {
  const res = await request(app).get('/api/credits/balance').set('Authorization', `Bearer ${token}`)
  return res.body.data.credits
}

const relightData = (overrides = {}) => ({
  style: 'night_warm', brightness: 50, colorTemp: 3000, intensity: 50, detail: 50, direction: 'none', ...overrides
})

function chainGraph(fileId, extraRelightNode = false) {
  const nodes = [
    { id: 'n1', type: 'image-input', position: { x: 0, y: 0 }, data: { fileId } },
    { id: 'n2', type: 'relight', position: { x: 200, y: 0 }, data: relightData() }
  ]
  const edges = [{ id: 'e1', source: 'n1', target: 'n2' }]
  if (extraRelightNode) {
    nodes.push({ id: 'n3', type: 'relight', position: { x: 400, y: 0 }, data: relightData({ style: 'daylight', colorTemp: 5600 }) })
    edges.push({ id: 'e2', source: 'n2', target: 'n3' })
    nodes.push({ id: 'n4', type: 'output', position: { x: 600, y: 0 }, data: {} })
    edges.push({ id: 'e3', source: 'n3', target: 'n4' })
  } else {
    nodes.push({ id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: {} })
    edges.push({ id: 'e2', source: 'n2', target: 'n3' })
  }
  return { version: 1, nodes, edges }
}

describe('工作流执行引擎', () => {
  it('正常链路：image-input → relight → output 跑通，relight算力被扣且未退款', async () => {
    const { token } = await register('wfrun1@test.com')
    const fileId = await uploadImage(token)
    const graph = chainGraph(fileId)
    const wfId = await createWorkflow(token, graph)

    const before = await balance(token)
    expect(before).toBe(20)

    const runRes = await request(app).post(`/api/workflow/${wfId}/run`).set('Authorization', `Bearer ${token}`)
    expect(runRes.body.code).toBe(200)
    const runId = runRes.body.data.runId
    expect(runId).toBeTruthy()

    const { run, nodes } = await waitRun(token, runId)
    expect(run.status).toBe('success')
    expect(run.outputs).toBeTruthy()
    expect(run.outputs.length).toBe(1)

    const relightNode = nodes.find(n => n.nodeId === 'n2')
    expect(relightNode.status).toBe('success')
    expect(relightNode.cost).toBe(5)
    const imageInputNode = nodes.find(n => n.nodeId === 'n1')
    expect(imageInputNode.status).toBe('success')
    const outputNode = nodes.find(n => n.nodeId === 'n3')
    expect(outputNode.status).toBe('success')

    const after = await balance(token)
    expect(after).toBe(before - 5) // 只有relight节点花了算力，且未退款
  })

  it('算力不足：0算力用户 /run 应429，不产生任何 workflow_runs/node_runs 行', async () => {
    const { token, user } = await register('wfrun2@test.com')
    const { changeCredits } = await import('../src/services/credits.js')
    changeCredits(user.id, -20, 'consume', '清零用于测试')
    expect(await balance(token)).toBe(0)

    const fileId = await uploadImage(token)
    const graph = chainGraph(fileId)
    const wfId = await createWorkflow(token, graph)

    const runRes = await request(app).post(`/api/workflow/${wfId}/run`).set('Authorization', `Bearer ${token}`)
    expect(runRes.body.code).toBe(429)

    const db = (await import('../src/db.js')).default
    const runCount = db.prepare('SELECT COUNT(*) c FROM workflow_runs WHERE user_id = ?').get(user.id).c
    const nodeCount = db.prepare('SELECT COUNT(*) c FROM node_runs WHERE user_id = ?').get(user.id).c
    expect(runCount).toBe(0)
    expect(nodeCount).toBe(0)
  })

  it('图不合法：未知节点类型 / 必填输入缺少连线，/estimate 与 /run 都应400且不扣费', async () => {
    const { token } = await register('wfrun3@test.com')
    const fileId = await uploadImage(token)

    // 未知节点类型
    const badTypeGraph = {
      version: 1,
      nodes: [{ id: 'n1', type: 'not-a-real-type', position: { x: 0, y: 0 }, data: {} }],
      edges: []
    }
    const wfBadType = await createWorkflow(token, badTypeGraph)
    const est1 = await request(app).post(`/api/workflow/${wfBadType}/estimate`)
      .set('Authorization', `Bearer ${token}`).send({ graph: badTypeGraph })
    expect(est1.body.code).toBe(400)
    const run1 = await request(app).post(`/api/workflow/${wfBadType}/run`).set('Authorization', `Bearer ${token}`)
    expect(run1.body.code).toBe(400)

    // 必填输入缺少上游连线：relight 没有连 image-input
    const missingEdgeGraph = {
      version: 1,
      nodes: [
        { id: 'n1', type: 'image-input', position: { x: 0, y: 0 }, data: { fileId } },
        { id: 'n2', type: 'relight', position: { x: 200, y: 0 }, data: relightData() },
        { id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: {} }
      ],
      edges: [{ id: 'e2', source: 'n2', target: 'n3' }] // 缺少 n1 -> n2
    }
    const wfMissing = await createWorkflow(token, missingEdgeGraph)
    const est2 = await request(app).post(`/api/workflow/${wfMissing}/estimate`)
      .set('Authorization', `Bearer ${token}`).send({ graph: missingEdgeGraph })
    expect(est2.body.code).toBe(400)
    const run2 = await request(app).post(`/api/workflow/${wfMissing}/run`).set('Authorization', `Bearer ${token}`)
    expect(run2.body.code).toBe(400)

    expect(await balance(token)).toBe(20) // 全程未扣费
  })

  it('缓存命中：同图同图片跑两次，第二次relight节点cached且算力被退还', async () => {
    const { token } = await register('wfrun4@test.com')
    const fileId = await uploadImage(token)
    const graph = chainGraph(fileId)
    const wfId = await createWorkflow(token, graph)

    const run1Res = await request(app).post(`/api/workflow/${wfId}/run`).set('Authorization', `Bearer ${token}`)
    const { run: run1 } = await waitRun(token, run1Res.body.data.runId)
    expect(run1.status).toBe('success')
    const afterRun1 = await balance(token)
    expect(afterRun1).toBe(15) // 20 - 5

    const run2Res = await request(app).post(`/api/workflow/${wfId}/run`).set('Authorization', `Bearer ${token}`)
    const { run: run2, nodes: nodes2 } = await waitRun(token, run2Res.body.data.runId)
    expect(run2.status).toBe('success')

    const relightNode2 = nodes2.find(n => n.nodeId === 'n2')
    expect(relightNode2.status).toBe('cached')

    const afterRun2 = await balance(token)
    expect(afterRun2).toBe(15) // 先扣5后退5，净不变
  })

  it('取消：跑起来后立刻cancel，终态canceled，未执行节点算力被退还', async () => {
    const { token } = await register('wfrun5@test.com')
    const fileId = await uploadImage(token)
    const graph = chainGraph(fileId, true) // image-input -> relight1 -> relight2 -> output，总成本10
    const wfId = await createWorkflow(token, graph)

    const before = await balance(token)
    expect(before).toBe(20)

    const runRes = await request(app).post(`/api/workflow/${wfId}/run`).set('Authorization', `Bearer ${token}`)
    const runId = runRes.body.data.runId
    expect(runId).toBeTruthy()

    const cancelRes = await request(app).post(`/api/workflow/run/${runId}/cancel`).set('Authorization', `Bearer ${token}`)
    expect(cancelRes.body.code).toBe(200)

    const { run, nodes } = await waitRun(token, runId)
    expect(run.status).toBe('canceled')

    // relight1 早已开始执行（先于cancel生效），必然跑完；relight2/output 来不及执行被跳过退款
    const relight1 = nodes.find(n => n.nodeId === 'n2')
    const relight2 = nodes.find(n => n.nodeId === 'n3')
    const outputNode = nodes.find(n => n.nodeId === 'n4')
    expect(relight1.status).toBe('success')
    expect(relight2.status).toBe('skipped')
    expect(outputNode.status).toBe('skipped')

    const after = await balance(token)
    expect(after).toBe(before - 5) // 只有relight1真正消耗了算力

    // 二次取消应400（已是终态）
    const cancelAgain = await request(app).post(`/api/workflow/run/${runId}/cancel`).set('Authorization', `Bearer ${token}`)
    expect(cancelAgain.body.code).toBe(400)
  })
})

describe('工作流节点：AI灯光顾问 advise', () => {
  it('image-input → advise → output 跑通，输出推荐参数与理由，消耗1算力且不退款', async () => {
    const { token } = await register('wfadvise1@test.com')
    const fileId = await uploadImage(token)
    const graph = {
      version: 1,
      nodes: [
        { id: 'n1', type: 'image-input', position: { x: 0, y: 0 }, data: { fileId } },
        { id: 'n2', type: 'advise', position: { x: 200, y: 0 }, data: {} },
        { id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: {} }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' }
      ]
    }
    const wfId = await createWorkflow(token, graph)
    const before = await balance(token)

    const runRes = await request(app).post(`/api/workflow/${wfId}/run`).set('Authorization', `Bearer ${token}`)
    expect(runRes.body.code).toBe(200)
    const { run, nodes } = await waitRun(token, runRes.body.data.runId)
    expect(run.status).toBe('success')

    const adviseNode = nodes.find(n => n.nodeId === 'n2')
    expect(adviseNode.status).toBe('success')
    expect(adviseNode.cost).toBe(1)
    expect(adviseNode.output.recommend).toHaveProperty('style')
    expect(adviseNode.output.reason.length).toBeGreaterThan(10)
    expect(run.outputs[0].recommend).toHaveProperty('style')

    expect(await balance(token)).toBe(before - 1)
  })
})

describe('工作流节点：多风格并行 style-fanout', () => {
  it('image-input → style-fanout → output 跑通，一次性并行产出全部预设风格', async () => {
    const { token } = await register('wffanout1@test.com')
    const fileId = await uploadImage(token)
    const graph = {
      version: 1,
      nodes: [
        { id: 'n1', type: 'image-input', position: { x: 0, y: 0 }, data: { fileId } },
        { id: 'n2', type: 'style-fanout', position: { x: 200, y: 0 }, data: {} },
        { id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: {} }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' }
      ]
    }
    const wfId = await createWorkflow(token, graph)
    const before = await balance(token)

    const runRes = await request(app).post(`/api/workflow/${wfId}/run`).set('Authorization', `Bearer ${token}`)
    const { run, nodes } = await waitRun(token, runRes.body.data.runId)
    expect(run.status).toBe('success')

    const fanoutNode = nodes.find(n => n.nodeId === 'n2')
    expect(fanoutNode.status).toBe('success')
    expect(fanoutNode.cost).toBe(8) // MULTI_COST 测试环境固定为8
    expect(fanoutNode.output.images.length).toBe(4) // STYLE_PRESETS 当前共4种预设风格
    fanoutNode.output.images.forEach(img => {
      expect(img.url).toContain('/results/')
      expect(img).toHaveProperty('name')
    })

    expect(await balance(token)).toBe(before - 8)
  })
})

describe('工作流节点：relight 支持逐节点 provider 覆盖', () => {
  it('节点显式指定 provider=fal 时应覆盖全局mock设置（测试环境未配fal密钥故失败并全额退款）', async () => {
    const { token } = await register('wfprovider1@test.com')
    const fileId = await uploadImage(token)
    const graph = {
      version: 1,
      nodes: [
        { id: 'n1', type: 'image-input', position: { x: 0, y: 0 }, data: { fileId } },
        { id: 'n2', type: 'relight', position: { x: 200, y: 0 }, data: relightData({ provider: 'fal' }) },
        { id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: {} }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' }
      ]
    }
    const wfId = await createWorkflow(token, graph)
    const before = await balance(token)

    const runRes = await request(app).post(`/api/workflow/${wfId}/run`).set('Authorization', `Bearer ${token}`)
    const { run, nodes } = await waitRun(token, runRes.body.data.runId)

    // 若覆盖未生效，节点会静默走全局mock分支并成功；覆盖生效则应因fal未配置密钥而失败
    expect(run.status).toBe('failed')
    const relightNode = nodes.find(n => n.nodeId === 'n2')
    expect(relightNode.status).toBe('failed')

    expect(await balance(token)).toBe(before) // 失败节点全额退款
  })

  it('节点 provider=default 或未指定时，仍按全局mock设置正常出图', async () => {
    const { token } = await register('wfprovider2@test.com')
    const fileId = await uploadImage(token)
    const graph = {
      version: 1,
      nodes: [
        { id: 'n1', type: 'image-input', position: { x: 0, y: 0 }, data: { fileId } },
        { id: 'n2', type: 'relight', position: { x: 200, y: 0 }, data: relightData({ provider: 'default' }) },
        { id: 'n3', type: 'output', position: { x: 400, y: 0 }, data: {} }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' }
      ]
    }
    const wfId = await createWorkflow(token, graph)
    const runRes = await request(app).post(`/api/workflow/${wfId}/run`).set('Authorization', `Bearer ${token}`)
    const { run, nodes } = await waitRun(token, runRes.body.data.runId)
    expect(run.status).toBe('success')
    expect(nodes.find(n => n.nodeId === 'n2').status).toBe('success')
  })
})
