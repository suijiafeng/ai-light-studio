import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CompareSlider from '@/components/CompareSlider.vue'

describe('CompareSlider 对比滑块', () => {
  it('渲染前后两张图与滑块手柄', () => {
    const w = mount(CompareSlider, { props: { before: '/a.jpg', after: '/b.jpg' } })
    const imgs = w.findAll('img')
    expect(imgs).toHaveLength(2)
    expect(w.find('.handle').exists()).toBe(true)
    expect(w.text()).toContain('原图')
    expect(w.text()).toContain('效果图')
  })

  it('按下拖动更新分割位置', async () => {
    const w = mount(CompareSlider, { props: { before: '/a.jpg', after: '/b.jpg' }, attachTo: document.body })
    // jsdom 无布局，mock 容器尺寸
    w.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 })
    await w.trigger('pointerdown', { clientX: 50 })
    expect(w.find('.before-clip').attributes('style')).toContain('width: 25%')
    await w.trigger('pointermove', { clientX: 150 })
    expect(w.find('.before-clip').attributes('style')).toContain('width: 75%')
    // 边界钳制
    await w.trigger('pointermove', { clientX: 999 })
    expect(w.find('.before-clip').attributes('style')).toContain('width: 100%')
    w.unmount()
  })
})
