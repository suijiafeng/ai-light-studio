import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import StudioView from '@/views/StudioView.vue'
import { mountView, flush } from './utils.js'

vi.mock('@/api', () => ({
  apiStyles: vi.fn(async () => ({
    styles: [
      { key: 'night_warm', name: '夜景暖光', defaultTemp: 3000 },
      { key: 'daylight', name: '日间自然光', defaultTemp: 5600 },
      { key: 'office_cool', name: '办公冷光', defaultTemp: 6500 },
      { key: 'wall_wash', name: '氛围洗墙光', defaultTemp: 3500 }
    ],
    directions: [
      { key: 'none', name: '环境光' }, { key: 'left', name: '左侧' }, { key: 'right', name: '右侧' },
      { key: 'top', name: '顶部' }, { key: 'bottom', name: '底部' }
    ],
    costPerGeneration: 5,
    multiCost: 8
  })),
  apiMe: vi.fn(async () => ({ user: { id: 'u1', nickname: 't', credits: 20 }, dailyBonus: 0 })),
  apiLogin: vi.fn(), apiRegister: vi.fn(),
  apiUpload: vi.fn(), apiGenerate: vi.fn(), apiGenerateStatus: vi.fn(),
  apiGenerateBatch: vi.fn(), apiBatchStatus: vi.fn(), apiAdvise: vi.fn(), apiShare: vi.fn()
}))

// 工作台是三步式向导：第1步只有上传区，没有 fileId 时风格/光向/生成这些控件根本不会渲染
// （不是渲染出来但 disabled）。第2步（挑选效果）靠 route.query.fileId 预填 source 直接进入
// ——这是"从历史记录点编辑"会走的同一条路径，测试里用它跳过真实上传交互。
let mockQuery = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ push: vi.fn() })
}))

describe('AI灯光工作台', () => {
  it('未上传图片时只显示上传区，不出现风格/生成等第二步控件', async () => {
    mockQuery = {}
    const w = mountView(StudioView)
    await flush(); await nextTick()

    expect(w.find('.drop').exists()).toBe(true)
    expect(w.findAll('.look')).toHaveLength(0)
    expect(w.find('button.btn-primary').exists()).toBe(false)
    w.unmount()
  })

  it('展示4种风格与5个光向，点击风格联动色温', async () => {
    mockQuery = { fileId: 'f1', url: '/uploads/f1.jpg' }
    const w = mountView(StudioView)
    await flush(); await nextTick()

    expect(w.findAll('.look')).toHaveLength(4)
    expect(w.findAll('.dir')).toHaveLength(5)
    expect(w.text()).toContain('3000K') // 默认夜景暖光

    await w.findAll('.look')[1].trigger('click') // 切到日间自然光
    expect(w.text()).toContain('5600K')
    expect(w.findAll('.look')[1].classes()).toContain('on')
    w.unmount()
  })

  it('按钮文案展示正确的算力消耗', async () => {
    mockQuery = { fileId: 'f1', url: '/uploads/f1.jpg' }
    const w = mountView(StudioView)
    await flush(); await nextTick()
    expect(w.text().replace(/\s+/g, '')).toContain('消耗5算力')
    expect(w.text().replace(/\s+/g, '')).toContain('8算力')
    w.unmount()
  })

  it('点击光向切换选中态', async () => {
    mockQuery = { fileId: 'f1', url: '/uploads/f1.jpg' }
    const w = mountView(StudioView)
    await flush(); await nextTick()
    const dirs = w.findAll('.dir')
    expect(dirs[0].classes()).toContain('on') // 默认环境光
    await dirs[2].trigger('click')
    expect(dirs[2].classes()).toContain('on')
    expect(dirs[0].classes()).not.toContain('on')
    w.unmount()
  })
})
