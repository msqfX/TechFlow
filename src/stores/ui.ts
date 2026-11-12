import { defineStore } from 'pinia'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'techflow:theme'

/** 默认亮色;仅当用户显式切换过深色(localStorage='dark')时才用深色 */
function loadInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: loadInitialTheme() as ThemeMode,
  }),
  actions: {
    setTheme(theme: ThemeMode) {
      this.theme = theme
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = theme
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, theme)
      }
    },
    toggleTheme() {
      this.setTheme(this.theme === 'dark' ? 'light' : 'dark')
    },
  },
})

/** 应用启动时同步主题到 <html data-theme> */
export function initTheme() {
  const ui = useUiStore()
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = ui.theme
  }
}
