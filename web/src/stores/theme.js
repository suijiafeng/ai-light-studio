import { defineStore } from 'pinia'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    dark: localStorage.getItem('theme') !== 'light'
  }),
  actions: {
    apply() {
      document.documentElement.classList.toggle('dark', this.dark)
    },
    toggle() {
      // 切换期间禁用过渡：所有元素颜色同帧统一变化，避免深浅参差
      document.documentElement.classList.add('theme-switching')
      this.dark = !this.dark
      localStorage.setItem('theme', this.dark ? 'dark' : 'light')
      this.apply()
      requestAnimationFrame(() => requestAnimationFrame(() =>
        document.documentElement.classList.remove('theme-switching')
      ))
    }
  }
})
