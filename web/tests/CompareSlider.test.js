import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CompareSlider from '@/components/CompareSlider.vue'

describe('CompareSlider 对比滑块', () => {
  it('渲染前后两张图与滑块手柄', () => {
    const w = mount(CompareSlider, { props: { before: '/a.jpg', after: '/b.jpg' } })
    // 3张 img：1张不可见的 spacer（撑开容器高度用）+ 效果图 + 原图，见组件内注释
    const imgs = w.findAll('img')
    expect(imgs).toHaveLength(3)
    expect(w.find('.handle').exists()).toBe(true)
    expect(w.text()).toContain('原图')
    expect(w.text()).toContain('效果图')
  })

  it('按下拖动更新分割位置', async () => {
    const w = mount(CompareSlider, { props: { before: '/a.jpg', after: '/b.jpg' }, attachTo: document.body })
    // jsdom 无布局，mock 容器尺寸
    w.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 })
    // 裁切方式改用 clip-path（纯 CSS，不依赖 JS 测量容器像素宽度），不再有 .before-clip 包裹层
    await w.trigger('pointerdown', { clientX: 50 })
    expect(w.find('.before-img').attributes('style')).toContain('clip-path: inset(0 75% 0 0)')
    await w.trigger('pointermove', { clientX: 150 })
    expect(w.find('.before-img').attributes('style')).toContain('clip-path: inset(0 25% 0 0)')
    // 边界钳制
    await w.trigger('pointermove', { clientX: 999 })
    expect(w.find('.before-img').attributes('style')).toContain('clip-path: inset(0 0% 0 0)')
    w.unmount()
  })
})
