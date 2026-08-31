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

const PORT = Number(process.env.PORT ?? 5174)

// 跨源前端 dev origin 必须进白名单（参见 multi-repo-family §6）
const ALLOWED_ORIGINS = [
  'http://localhost:3000', // nextjs dev
  'http://localhost:5173', // react/vue dev（lab-msw 同源；saas 调 lab 跨源）
  'http://localhost:5174', // react/vue dev（saas-msw 同源）
] as const

const app = express()
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || (ALLOWED_ORIGINS as readonly string[]).includes(origin)) {
        return cb(null, true)
      }
      return cb(new Error(`CORS: origin ${origin} not allowed`))
    },
    credentials: true,
  }),
)
app.use(express.json()) // body 解析后由 @mswjs/http-middleware 重建 Request
app.use(createMiddleware(...handlers)) // ★ 核心：handlers 零修改

// 健康检查（容器探活 + 显式 mode 标识防止被当 staging）
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, mode: 'msw', uptime: process.uptime() })
})

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[saas-msw] mock http server listening on :${PORT} (mode=msw)`)
})
