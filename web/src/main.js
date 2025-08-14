import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import './styles/index.scss'

const app = createApp(App)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
let errCount = 0
setInterval(() => { errCount = 0 }, 60000)
const reportError = (message, stack) => {
  if (errCount++ >= 3) return
  fetch('/api/log/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: String(message).slice(0, 300), stack: String(stack || '').slice(0, 2000), url: location.href })
  }).catch(() => {})
}
app.config.errorHandler = (err, instance, info) => {
  console.error(err)
  reportError(err?.message || err, `${err?.stack || ''}\n[vue info] ${info}`)
}
window.addEventListener('unhandledrejection', e => {
  if (e.reason && e.reason.code !== undefined) return
  if (e.reason === 'cancel' || e.reason === 'close') return
  reportError(e.reason?.message || e.reason, e.reason?.stack)
})
document.addEventListener('gesturestart', e => e.preventDefault())
document.addEventListener('gesturechange', e => e.preventDefault())
let lastTouch = 0
document.addEventListener('touchend', e => {
  const now = Date.now()
  if (now - lastTouch <= 300) e.preventDefault() // 拦截双击放大
  lastTouch = now
}, { passive: false })

app.mount('#app')
