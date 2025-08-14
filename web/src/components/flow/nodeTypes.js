// 节点类型注册表 —— 前端画布 / 属性面板共用的唯一契约。
// I/O 类型系统用于连线校验：'any' 与任意类型兼容，否则需类型相等。
// fields 采用 schema 驱动，新增节点类型只需在此追加数据，无需改组件。

export const STYLE_OPTIONS = [
  { key: 'night_warm', name: '夜景暖光' },
  { key: 'daylight', name: '日间自然光' },
  { key: 'office_cool', name: '办公冷光' },
  { key: 'wall_wash', name: '氛围洗墙光' }
]

export const DIRECTION_OPTIONS = [
  { key: 'none', name: '环境光' }, { key: 'left', name: '左侧' }, { key: 'right', name: '右侧' },
  { key: 'top', name: '顶部' }, { key: 'bottom', name: '底部' }
]

export const NODE_TYPES = {
  'image-input': {
    label: '图片输入',
    icon: 'Picture',
    accent: '#4dd0e1',
    desc: '上传一张室内实景照片作为工作流起点',
    inputs: [],
    outputs: [{ name: 'image', type: 'image' }],
    data: () => ({ fileId: '', url: '' }),
    fields: [] // 上传交互由 Inspector 特殊处理
  },
  'relight': {
    label: '智能打光',
    icon: 'MagicStick',
    accent: '#7c6cff',
    desc: '按所选风格与参数对上游图片重新打光',
    inputs: [{ name: 'image', type: 'image', required: true }],
    outputs: [{ name: 'image', type: 'image' }],
    data: () => ({ style: 'night_warm', brightness: 50, colorTemp: 3000, intensity: 50, detail: 50, direction: 'none', provider: 'default' }),
    fields: [
      { key: 'style', label: '风格', type: 'select', options: STYLE_OPTIONS },
      { key: 'brightness', label: '亮度', type: 'slider', min: 0, max: 100 },
      { key: 'colorTemp', label: '色温', type: 'slider', min: 2000, max: 8000, step: 100, unit: 'K' },
      { key: 'intensity', label: '光影强度', type: 'slider', min: 0, max: 100 },
      { key: 'detail', label: '明暗细节', type: 'slider', min: 0, max: 100 },
      { key: 'direction', label: '光源方向', type: 'select', options: DIRECTION_OPTIONS },
      { key: 'provider', label: '生成模型', type: 'select', options: [
        { key: 'default', name: '跟随全局' }, { key: 'mock', name: '演示（本地）' },
        { key: 'fal', name: 'fal.ai' }, { key: 'replicate', name: 'Replicate' }
      ] }
    ]
  },
  'output': {
    label: '输出',
    icon: 'Download',
    accent: '#67c23a',
    desc: '标记工作流的最终产物',
    inputs: [{ name: 'in', type: 'any', required: true }],
    outputs: [],
    data: () => ({}),
    fields: []
  }
}

// M1 面板中可拖入的节点（后续里程碑再开放 fanout/compare/img2video 等）
export const PALETTE = ['image-input', 'relight', 'output']

export const nodeDef = type => NODE_TYPES[type] || null

// 连线类型校验：source 的输出类型 与 target 的输入类型 是否兼容
export function canConnect(sourceType, targetType) {
  const s = NODE_TYPES[sourceType], t = NODE_TYPES[targetType]
  if (!s || !t) return false
  if (!s.outputs.length || !t.inputs.length) return false
  const out = s.outputs[0].type
  const inp = t.inputs[0].type
  return out === inp || out === 'any' || inp === 'any'
}
