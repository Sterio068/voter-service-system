import axios from 'axios'
import { message } from 'antd'
import { useAuthStore } from '../stores/authStore'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 請求攔截：自動帶上 JWT
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 防止多個 401 回應觸發多次登出跳轉
let isLoggingOut = false
// 防止網路錯誤短時間連續彈出多個訊息
let lastNetworkErrorAt = 0

// 回應攔截：401 自動登出；網路錯誤統一提示；500 錯誤附帶後端訊息
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isLoggingOut) {
      isLoggingOut = true
      useAuthStore.getState().logout()
      setTimeout(() => {
        window.location.href = '/login'
        isLoggingOut = false
      }, 100)
      return Promise.reject(error)
    }

    // 網路層錯誤（無回應）— 統一提示
    const isNetworkError = !error.response && (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.message === 'Network Error')
    if (isNetworkError) {
      const now = Date.now()
      if (now - lastNetworkErrorAt > 3000) {
        lastNetworkErrorAt = now
        const hint = error.code === 'ECONNABORTED' ? '連線逾時，請稍後再試' : '無法連線到伺服器，請檢查網路或服務狀態'
        message.error(hint)
      }
    }

    return Promise.reject(error)
  }
)

export default api
