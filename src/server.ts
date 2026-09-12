// saas-msw HTTP 后端服务入口（ADR-0012 B 强度 / M99.F03）
// dotenv 必须在第一行 — process.env.JWT_SIGNING_KEY (M99.F02.I01 jwt-signer.ts)
// 启动时 fail-fast 要 >=32B (HS256 RFC 7518 硬约束)。
// .env.example 已进仓含真值; .env.local 不在 msw .gitignore 里, 本地可加覆盖。
// 家族四仓共享同一 JWT_SIGNING_KEY (ADR-0015 §Decision.5), MSW 签的 token 在真后端 dev profile 也验签通过。
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createMiddleware } from '@mswjs/http-middleware'
import { handlers } from './handlers-array'
import { resetFixtures } from './fixtures/seed'
import { resetTenantApplications } from './handlers-extra'

const PORT = Number(process.env.PORT ?? 5100)

// CORS 白名单走 env 契约 SAAS_CORS_ALLOWED_ORIGINS（ADR-0014 全家族共享同一 key，
// springboot/aspnetcore/nextjs middleware 同名）。2026-09-13 修复：此前硬编码 localhost
// dev 列表，.env.production 里的 key 没有读者 —— 三前端 prod 域名跨源调 msw 全被拒。
// 禁 env 默认值兜底（CLAUDE.md §2）：key 缺失/为空 fail-fast，不允许字面量回退。
const rawOrigins = process.env.SAAS_CORS_ALLOWED_ORIGINS ?? ''
const ALLOWED_ORIGINS = rawOrigins
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
if (ALLOWED_ORIGINS.length === 0) {
  console.error(
    'SAAS_CORS_ALLOWED_ORIGINS env is required (comma-separated origin list; see .env.example)',
  )
  process.exit(1)
}

const app = express()
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true)
      }
      return cb(new Error(`CORS: origin ${origin} not allowed`))
    },
    credentials: true,
  }),
)
app.use(express.json()) // body 解析后由 @mswjs/http-middleware 重建 Request
// E2E reset（2026-09-11）：mock-server 专属调试端点——fixtures 内存还原到启动快照。
// 必须挂在 createMiddleware 之前：501 兜底(http.all */api/v1/*)会截走未匹配请求。
app.post('/api/v1/__e2e/reset', (_req, res) => {
  resetFixtures()
  resetTenantApplications()
  res.json({ ok: true, reset: true })
})

app.use(createMiddleware(...handlers)) // ★ 核心：handlers 零修改

// 健康检查（容器探活 + 显式 mode 标识防止被当 staging）
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, mode: 'msw', uptime: process.uptime() })
})


app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[saas-msw] mock http server listening on :${PORT} (mode=msw)`)
})
