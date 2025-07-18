import request from './request'

// ---------- 认证 ----------
export const apiRegister = data => request.post('/auth/register', data)
export const apiLogin = data => request.post('/auth/login', data)
export const apiMe = () => request.get('/auth/me')
export const apiUpdateProfile = data => request.put('/auth/profile', data)
export const apiSendCode = data => request.post('/auth/send-code', data)
export const apiResetPassword = data => request.post('/auth/reset-password', data)
export const apiDeleteAccount = password => request.delete('/auth/account', { data: { password } })

// ---------- 生成 ----------
export const apiUpload = (file, onProgress) => {
  const fd = new FormData()
  fd.append('file', file)
  return request.post('/generate/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
  })
}
export const apiStyles = () => request.get('/generate/styles')
export const apiGenerate = data => request.post('/generate', data)
export const apiGenerateStatus = id => request.get(`/generate/${id}`)
export const apiGenerateBatch = data => request.post('/generate/batch', data)
export const apiBatchStatus = batchId => request.get(`/generate/batch/${batchId}`)
export const apiHistory = params => request.get('/generate', { params })
export const apiDeleteGeneration = id => request.delete(`/generate/${id}`)

// ---------- 算力 ----------
export const apiBalance = () => request.get('/credits/balance')
export const apiCreditLogs = params => request.get('/credits/logs', { params })

// ---------- 支付 ----------
export const apiPackages = () => request.get('/pay/packages')
export const apiCreateOrder = packageId => request.post('/pay/order', { packageId })
export const apiOrderStatus = id => request.get(`/pay/order/${id}`)
export const apiOrders = params => request.get('/pay/orders', { params })
export const apiMockPay = id => request.post(`/pay/mock/${id}`)

// ---------- 分享 / 顾问 / 批量 ----------
export const apiShare = id => request.post(`/generate/${id}/share`)
export const apiShareInfo = shareId => request.get(`/generate/share/${shareId}`)
export const apiAdvise = fileId => request.post('/generate/advise', { fileId })
export const apiBulk = data => request.post('/generate/bulk', data)

// ---------- API密钥 ----------
export const apiKeys = () => request.get('/keys')
export const apiCreateKey = name => request.post('/keys', { name })
export const apiRevokeKey = id => request.delete(`/keys/${id}`)

// ---------- 统计与后台 ----------
export const apiStatsOverview = () => request.get('/stats/overview')
export const apiAdminUsers = params => request.get('/stats/users', { params })
export const apiAdminAdjustCredits = (id, data) => request.post(`/stats/users/${id}/credits`, data)
export const apiAdminBan = (id, banned) => request.post(`/stats/users/${id}/ban`, { banned })
export const apiAdminGenerations = () => request.get('/stats/generations')
export const apiAdminErrors = () => request.get('/stats/errors')
export const apiAdminRefund = (orderId, reason) => request.post(`/pay/refund/${orderId}`, { reason })
export const apiAdminOrders = params => request.get('/stats/orders', { params })
export const apiAdminDeleteGeneration = id => request.delete(`/stats/generations/${id}`)
export const apiAiMode = () => request.get('/stats/ai-mode')
export const apiSetAiMode = provider => request.post('/stats/ai-mode', { provider })
export const apiAdminPackages = () => request.get('/stats/packages')
export const apiAdminCreatePackage = data => request.post('/stats/packages', data)
export const apiAdminUpdatePackage = (id, data) => request.put(`/stats/packages/${id}`, data)
export const apiAdminTogglePackage = id => request.post(`/stats/packages/${id}/toggle`)
