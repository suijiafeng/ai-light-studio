import { nodeDef } from './nodeTypes'

// 工作流模板：解决"新建后一片空白,不知道搭什么"的冷启动问题。
// 每个模板产出一份完整的 graph(节点+连线+排好的坐标),和 buildGraph()/loadGraph() 的
// 序列化格式完全一致,创建后可直接运行(只差在图片输入节点里传一张图)。

const relightData = overrides => ({ ...nodeDef('relight').data(), ...overrides })

// 统一布局参数:三列(输入/打光/输出),行高按默认卡片高度留出间距
const COL = { input: 40, relight: 360, output: 680 }
const ROW_H = 240

// 生成一条"1个输入 → N个打光(参数各不同) → N个输出"的扇形图
const fanOut = variants => {
  const midY = ((variants.length - 1) * ROW_H) / 2 + 60
  const nodes = [{ id: 'image-input-1', type: 'image-input', position: { x: COL.input, y: midY }, data: nodeDef('image-input').data() }]
  const edges = []
  variants.forEach((v, i) => {
    const y = 60 + i * ROW_H
    const rid = `relight-${i + 2}`
    const oid = `output-${i + 2 + variants.length}`
    nodes.push({ id: rid, type: 'relight', position: { x: COL.relight, y }, data: relightData(v) })
    nodes.push({ id: oid, type: 'output', position: { x: COL.output, y }, data: {} })
    edges.push({ id: `e-in-${rid}`, source: 'image-input-1', target: rid })
    edges.push({ id: `e-${rid}-${oid}`, source: rid, target: oid })
  })
  return { version: 1, nodes, edges }
}

export const TEMPLATES = [
  {
    key: 'blank',
    name: '空白画布',
    desc: '从零开始自由搭建',
    icon: 'DocumentAdd',
    accent: '#909399',
    nodeCount: 0,
    build: () => ({ version: 1, nodes: [], edges: [] })
  },
  {
    key: 'basic',
    name: '基础打光',
    desc: '上传 → 打光 → 输出,最简单的一条链',
    icon: 'MagicStick',
    accent: '#7c6cff',
    nodeCount: 3,
    build: () => ({
      version: 1,
      nodes: [
        { id: 'image-input-1', type: 'image-input', position: { x: COL.input, y: 120 }, data: nodeDef('image-input').data() },
        { id: 'relight-2', type: 'relight', position: { x: COL.relight, y: 120 }, data: relightData({}) },
        { id: 'output-3', type: 'output', position: { x: COL.output, y: 120 }, data: {} }
      ],
      edges: [
        { id: 'e1', source: 'image-input-1', target: 'relight-2' },
        { id: 'e2', source: 'relight-2', target: 'output-3' }
      ]
    })
  },
  {
    key: 'four-styles',
    name: '四风格对比',
    desc: '一张照片同时生成夜景暖光/日光/办公冷光/洗墙光,一次运行全部产出、并排对比',
    icon: 'Grid',
    accent: '#4dd0e1',
    nodeCount: 9,
    build: () => fanOut([
      { style: 'night_warm', colorTemp: 3000 },
      { style: 'daylight', colorTemp: 5600 },
      { style: 'office_cool', colorTemp: 6500 },
      { style: 'wall_wash', colorTemp: 3500 }
    ])
  },
  {
    key: 'temp-scan',
    name: '色温梯度',
    desc: '同一风格下 2700K / 3500K / 5000K 三档色温对比,选出最合适的一档',
    icon: 'Odometer',
    accent: '#e6a23c',
    nodeCount: 7,
    build: () => fanOut([
      { style: 'night_warm', colorTemp: 2700 },
      { style: 'night_warm', colorTemp: 3500 },
      { style: 'night_warm', colorTemp: 5000 }
    ])
  }
]

export const templateByKey = key => TEMPLATES.find(t => t.key === key) || null
