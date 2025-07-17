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

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() })
}))

describe('AI灯光工作台', () => {
  it('未上传图片时生成/连拍/顾问按钮均禁用', async () => {
    const w = mountView(StudioView)
    await flush(); await nextTick()

    const genBtn = w.findAll('button').find(b => b.text().includes('开始生成'))
    const batchBtn = w.findAll('button').find(b => b.text().includes('连拍'))
    const adviseBtn = w.findAll('button').find(b => b.text().includes('AI灯光顾问'))
    expect(genBtn.attributes('disabled')).toBeDefined()
    expect(batchBtn.attributes('disabled')).toBeDefined()
    expect(adviseBtn.attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('请先上传照片')
    w.unmount()
  })

  it('展示4种风格与5个光向，点击风格联动色温', async () => {
    const w = mountView(StudioView)
    await flush(); await nextTick()

    expect(w.findAll('.style-item')).toHaveLength(4)
    expect(w.findAll('.dir-item')).toHaveLength(5)
    expect(w.text()).toContain('3000K') // 默认夜景暖光

    await w.findAll('.style-item')[1].trigger('click') // 切到日间自然光
    expect(w.text()).toContain('5600K')
    expect(w.findAll('.style-item')[1].classes()).toContain('active')
    w.unmount()
  })

  it('按钮文案展示正确的算力消耗', async () => {
    const w = mountView(StudioView)
    await flush(); await nextTick()
    expect(w.text()).toContain('消耗5算力')
    expect(w.text()).toContain('8算力')
    w.unmount()
  })

  it('点击光向切换选中态', async () => {
    const w = mountView(StudioView)
    await flush(); await nextTick()
    const dirs = w.findAll('.dir-item')
    expect(dirs[0].classes()).toContain('active') // 默认环境光
    await dirs[2].trigger('click')
    expect(dirs[2].classes()).toContain('active')
    expect(dirs[0].classes()).not.toContain('active')
    w.unmount()
  })
})
