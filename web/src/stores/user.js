import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import { apiLogin, apiRegister, apiMe } from '@/api'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: null
  }),
  getters: {
    isLogin: s => !!s.token,
    credits: s => s.user?.credits ?? 0,
    isAdmin: s => s.user?.role === 'admin',
    isMember: s => !!s.user?.isMember
  },
  actions: {
    setAuth({ token, user }) {
      this.token = token
      this.user = user
      localStorage.setItem('token', token)
    },
    notifyDaily(dailyBonus) {
      if (dailyBonus > 0) ElMessage.success(`每日登录奖励 +${dailyBonus} 算力已到账！`)
    },
    async login(payload) {
      const data = await apiLogin(payload)
      this.setAuth(data)
      this.notifyDaily(data.dailyBonus)
    },
    async register(payload) {
      this.setAuth(await apiRegister(payload))
    },
    async fetchMe() {
      if (!this.token) return
      try {
        const { user, dailyBonus } = await apiMe()
        this.user = user
        this.notifyDaily(dailyBonus)
      } catch (e) {
        if (e.code === 401) this.logout()
      }
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('token')
    }
  }
})
