import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

// 统一请求封装：baseURL 固定为 /api，由 Vite 代理 / Nginx 转发，避免URL拼接异常
const request = axios.create({
  baseURL: '/api',
  timeout: 60000
})

// 请求拦截：统一携带Token
request.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截：统一处理 { code, msg, data }
request.interceptors.response.use(
  resp => {
    const { code, msg, data } = resp.data || {}
    if (code === 200) return data
    return Promise.reject(Object.assign(new Error(msg || '请求失败'), { code }))
  },
  err => {
    const resp = err.response
    if (resp && resp.data && resp.data.code) {
      const { code, msg } = resp.data
      if (code === 401) {
        localStorage.removeItem('token')
        if (router.currentRoute.value.meta.auth) {
          router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
        }
      }
      return Promise.reject(Object.assign(new Error(msg || '请求失败'), { code }))
    }
    const msg = err.code === 'ECONNABORTED' ? '请求超时，请重试' : '网络异常，请检查服务是否启动'
    ElMessage.error(msg)
    return Promise.reject(Object.assign(new Error(msg), { code: -1 }))
  }
)

export default request
