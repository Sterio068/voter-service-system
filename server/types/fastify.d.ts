import 'fastify'
import type { User } from '../../shared/types'

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * 由 `authenticate` 中介軟體 (server/middleware/auth.ts) 設定。
     * 在透過 `requirePermission` 或 `authenticate` preHandler 的路由中保證存在。
     */
    currentUser?: User
  }
}
