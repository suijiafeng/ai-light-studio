import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
const request = axios.create({
  baseURL: '/api',
  timeout: 60000
})
request.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
request.interceptors.response.use(
  resp => {
    const { code, msg, data } = resp.data || {}
    if (code === 200) return data
    if (code === 404) {
      ElMessage.error(msg || '接口不存在')
    } else if (code === 403) {
      ElMessage.error(msg || '权限不足')
    }
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
      } else if (code === 404) {
        ElMessage.error(msg || '接口不存在')
      } else if (code === 403) {
        ElMessage.error(msg || '权限不足')
      }
      return Promise.reject(Object.assign(new Error(msg || '请求失败'), { code }))
    }
    if (resp && resp.status === 404) {
      const msg = '接口不存在，请检查 API 路径'
      ElMessage.error(msg)
      return Promise.reject(Object.assign(new Error(msg), { code: 404 }))
    }
    const msg = err.code === 'ECONNABORTED' ? '请求超时，请重试' : '网络异常，请检查服务是否启动'
    ElMessage.error(msg)
    return Promise.reject(Object.assign(new Error(msg), { code: -1 }))
  }
)

export default request
