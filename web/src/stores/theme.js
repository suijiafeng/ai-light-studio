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
      this.dark = !this.dark
      localStorage.setItem('theme', this.dark ? 'dark' : 'light')
      this.apply()
    }
  }
})
