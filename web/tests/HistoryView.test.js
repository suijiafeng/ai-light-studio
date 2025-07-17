import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import HistoryView from '@/views/HistoryView.vue'
import { mountView, flush } from './utils.js'

const mockList = [
  { id: 'g1', sourceUrl: '/uploads/a.jpg', resultUrl: '/results/g1.jpg', params: { style: 'night_warm' }, status: 'success', cost: 5, createdAt: Date.now() },
  { id: 'g2', sourceUrl: '/uploads/b.jpg', resultUrl: null, params: { style: 'daylight' }, status: 'failed', cost: 5, createdAt: Date.now() }
]

vi.mock('@/api', () => ({
  apiHistory: vi.fn(async params => ({
    total: params?.style ? 1 : 2, page: 1, size: 12,
    list: params?.style ? mockList.filter(i => i.params.style === params.style) : mockList
  })),
  apiDeleteGeneration: vi.fn(),
  apiShare: vi.fn(async () => ({ shareId: 'sh123' }))
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

import { apiHistory } from '@/api'

describe('历史图库', () => {
  beforeEach(() => { apiHistory.mockClear() })

  it('加载并渲染记录，失败项显示失败标签', async () => {
    const w = mountView(HistoryView)
    await flush(); await nextTick()
    expect(w.findAll('.item')).toHaveLength(2)
    expect(w.text()).toContain('夜景暖光')
    expect(w.text()).toContain('失败')
    w.unmount()
  })

  it('点击缩略图只打开一个查看弹窗，弹窗内是对比滑块', async () => {
    const w = mountView(HistoryView)
    await flush(); await nextTick()

    await w.findAll('.thumb')[0].trigger('click')
    await nextTick(); await flush(); await nextTick()

    // 关键回归断言：全局有且只有一个弹窗
    const dialogs = document.querySelectorAll('.el-dialog')
    expect(dialogs).toHaveLength(1)
    expect(document.body.textContent).toContain('夜景暖光')
    // 弹窗内是对比滑块而非多个预览层
    expect(document.querySelectorAll('.compare')).toHaveLength(1)
    expect(document.querySelectorAll('.el-image-viewer__wrapper')).toHaveLength(0)
    w.unmount()
  })

  it('无结果图的记录弹窗降级显示原图提示', async () => {
    const w = mountView(HistoryView)
    await flush(); await nextTick()
    await w.findAll('.thumb')[1].trigger('click')
    await nextTick(); await flush(); await nextTick()
    expect(document.body.textContent).toContain('该记录暂无结果图')
    expect(document.querySelectorAll('.compare')).toHaveLength(0)
    w.unmount()
  })

  it('切换风格筛选会携带参数重新请求', async () => {
    const w = mountView(HistoryView)
    await flush(); await nextTick()

    const select = w.findAllComponents({ name: 'ElSelect' })[0]
    select.vm.$emit('update:modelValue', 'daylight')
    select.vm.$emit('change', 'daylight')
    await flush(); await nextTick()

    const lastCall = apiHistory.mock.calls.at(-1)[0]
    expect(lastCall.style).toBe('daylight')
    expect(w.findAll('.item')).toHaveLength(1)
    w.unmount()
  })
})
