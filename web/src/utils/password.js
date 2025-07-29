/**
 * 密码策略（与后端保持一致）：8-32位，必须包含字母和数字
 */
export const PASSWORD_RULE_MSG = '密码需8-32位，且同时包含字母和数字'

export function isValidPassword(pwd) {
  return typeof pwd === 'string' && pwd.length >= 8 && pwd.length <= 32 && /[a-zA-Z]/.test(pwd) && /\d/.test(pwd)
}

/** 强度评估：返回 { score:0-4, label, color, percent } */
export function passwordStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '', percent: 0 }
  let score = 0
  if (pwd.length >= 8) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^a-zA-Z0-9]/.test(pwd)) score++
  if (pwd.length >= 14) score++
  score = Math.min(score, 4)
  const map = [
    { label: '过短', color: '#f56c6c' },
    { label: '弱', color: '#f56c6c' },
    { label: '中', color: '#e6a23c' },
    { label: '强', color: '#67c23a' },
    { label: '极强', color: '#67c23a' }
  ]
  return { score, ...map[score], percent: (score / 4) * 100 }
}
