import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

/** 统一挂载：注册 Element Plus、图标、Pinia，并挂到 document.body（弹窗teleport需要） */
export function mountView(component, options = {}) {
  const icons = {}
  for (const [name, comp] of Object.entries(ElementPlusIconsVue)) icons[name] = comp

  return mount(component, {
    attachTo: document.body,
    ...options,
    global: {
      plugins: [ElementPlus, createPinia(), ...(options.global?.plugins || [])],
      components: { ...icons, ...(options.global?.components || {}) },
      mocks: { $router: { push: () => {} }, ...(options.global?.mocks || {}) },
      stubs: options.global?.stubs || {}
    }
  })
}

export const flush = () => new Promise(r => setTimeout(r, 0))
