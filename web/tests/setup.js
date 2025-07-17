/** jsdom 环境补齐浏览器API */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserverStub

window.matchMedia = window.matchMedia || (query => ({
  matches: false, media: query,
  addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false }
}))

URL.createObjectURL = URL.createObjectURL || (() => 'blob:mock')
URL.revokeObjectURL = URL.revokeObjectURL || (() => {})

// 每个用例后清掉teleport到body的弹层，避免相互污染
import { afterEach } from 'vitest'
afterEach(() => { document.body.innerHTML = '' })
