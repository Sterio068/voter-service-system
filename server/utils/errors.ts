export interface ApiError {
  code: number
  message: string
  details?: unknown
}

export function createErrorResponse(code: number, message: string, details?: unknown) {
  return { success: false as const, error: { code, message, details } }
}

export const ERROR_MESSAGES: Record<string, string> = {
  'SQLITE_BUSY': '系統忙碌，請稍後再試',
  'SQLITE_LOCKED': '系統忙碌，請稍後再試',
  'database is locked': '系統忙碌，請稍後再試',
  'UNIQUE constraint failed': '資料已存在，請檢查是否重複',
  'NOT NULL constraint failed': '必填欄位不可為空',
  'FOREIGN KEY constraint failed': '關聯資料不存在，請確認後再試',
  'no such table': '系統錯誤，請重新啟動應用程式',
}

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const [key, friendly] of Object.entries(ERROR_MESSAGES)) {
    if (msg.includes(key)) return friendly
  }
  return '操作失敗，請稍後再試'
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const Errors = {
  notFound: (resource: string) => new AppError(404, 'NOT_FOUND', `${resource}不存在`),
  badRequest: (msg: string) => new AppError(400, 'BAD_REQUEST', msg),
  conflict: (msg: string) => new AppError(409, 'CONFLICT', msg),
  forbidden: () => new AppError(403, 'FORBIDDEN', '權限不足'),
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', '請先登入'),
}
