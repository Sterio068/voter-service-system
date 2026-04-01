import axios from 'axios'
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

// 回應攔截：401 自動登出
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isLoggingOut) {
      isLoggingOut = true
      useAuthStore.getState().logout()
      // 短暫延遲確保 Zustand 狀態寫入完成
      setTimeout(() => {
        window.location.href = '/login'
        isLoggingOut = false
      }, 100)
    }
    return Promise.reject(error)
  }
)

export default api
