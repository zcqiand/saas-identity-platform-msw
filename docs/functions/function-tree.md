# saas-identity-platform-msw 功能树

> MSW v2 mock layer — consumes shared OpenAPI spec, produces MSW handlers + cross-frontend fixture data.

## 模块总览

| 模块 ID | 模块名称 | 说明 | 状态 |
|---|---|---|---|
| M05 | API Key 管理 | tenant-scoped Key 生命周期 | 已废弃 |
| M99 | MSW Mock Layer | 跨端 mock handlers + 共享 fixtures（ADR-0012 B 强度，HTTP-server only） | 规划 |

---

## M05 API Key 管理

| 功能 ID | 功能名称 | 说明 | 状态 |
|---|---|---|---|
| M05.F01 | API Key 生命周期（tenant-scoped） | 接口 | 已废弃 |

### M05.F01 API Key 生命周期（tenant-scoped）

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M05.F01.I05 | `http.delete` /tenants/:tenantId/api-keys/:keyId 物理删（区别于 I03 revoke 软删；幂等——重复删 → 404，无 audit） | 接口 | 前端+后端 |  | 已废弃 |

---

## M99 MSW Mock Layer

| 功能 ID | 功能名称 | 说明 | 状态 |
|---|---|---|---|
| M99.F01 | Fixture data consistency | 跨端 seed + 进程内 Map 状态 | 规划 |
| M99.F02 | MSW handlers emit OAuth 2.0 server（RFC 6749 字段 + code/refresh 映射 + grant_type 校验） | MSW handlers emit OAuth 2.0 server（RFC 6749 字段 + code/refresh 映射 + grant_type 校验） | 开发中 |
| M99.F03 | 独立 HTTP 服务暴露（Express + @mswjs/http-middleware，ADR-0012 B 强度） | 独立 HTTP 服务暴露（Express + @mswjs/http-middleware，ADR-0012 B 强度） | 开发中 |
| M99.F04 | handler 覆盖范围 / 全局一致性 | handler 派生 + 手写扩展 + 分页 / 错误 / method 白名单 | 规划 |
| M99.F05 | trace.json fns 集合 | fnReporter 正则兼容 + trace_env PORT | 规划 |
| M99.F06 | Contract-test live mode（ADR-0016） | msw-as-HTTP-server 供 4 后端 + ct 仓断言；重启即清契约 | 规划 |

### M99.F01 Fixture data consistency

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M99.F01.I01 | 跨端 seed data 一致性 | 接口 | 前端+后端 |  | 规划 |
| M99.F01.I02 | seed manifest + 13 个 seed JSON 家族（saas: api-keys/apps/audit-events/audit-retention-policies/memberships/menus/permissions/role-menu-grants/role-permissions/roles/tenants/users + manifest.json） | 接口 | 前端+后端 |  | 规划 |
| M99.F01.I03 | 运行时内存状态（saasSessions / oauthCodes / oauthRefreshTokens / saasRefreshTokens 进程内 Map） | 接口 | 前端+后端 |  | 规划 |

### M99.F02 MSW handlers emit OAuth 2.0 server（RFC 6749 字段 + code/refresh 映射 + grant_type 校验）

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M99.F02.I01 | MSW handlers 与 shared OpenAPI 同步 | 接口 | 前端+后端 |  | 规划 |
| M99.F02.I02 | /oauth/authorize 签发 authorization code（RFC 6749 §4.1.1：response_type=code + client_id + redirect_uri + state） | 接口 | 前端+后端 |  | 规划 |
| M99.F02.I03 | /oauth/token code→access_token+refresh_token 交换（RFC 6749 §4.1.3：grant_type=authorization_code） | 接口 | 前端+后端 |  | 规划 |
| M99.F02.I04 | refresh token rotate（M03.F02.I04 contract-test 第三期：一次性消费 + 旧签新） | 接口 | 前端+后端 |  | 规划 |
| M99.F02.I05 | Set-Cookie HttpOnly + msw node fetch API 屏蔽（debug export 模式暴露 saasSessionsForTest / saasRefreshTokensForTest） | 接口 | 前端+后端 |  | 规划 |
| M99.F02.I06 | grant_type 校验 + client_id 必带（RFC 6749 §4.1.1） | 接口 | 前端+后端 |  | 规划 |

### M99.F03 独立 HTTP 服务暴露（Express + @mswjs/http-middleware，ADR-0012 B 强度）

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M99.F03.I01 | Express + @mswjs/http-middleware 装配（src/server.ts + handlers 零修改） | 接口 | 前端+后端 |  | 规划 |
| M99.F03.I02 | 健康检查端点 /healthz（{ ok, mode:'msw', uptime }） | 接口 | 前端+后端 |  | 规划 |
| M99.F03.I03 | Dockerfile 与容器化（multi-stage + registry.npmmirror.com） | 接口 | 前端+后端 |  | 规划 |
| M99.F03.I04 | 端口约定（saas-msw=5100）+ multi-repo-family §6 端口表同步 | 接口 | 前端+后端 |  | 规划 |
| M99.F03.I05 | CORS 白名单（跨源前端 dev origin：http://localhost:5102 react / :5103 vue / :5201 nextjs） | 接口 | 前端+后端 |  | 规划 |
| M99.F03.I06 | handler URL 相对路径规范（禁止 :port 硬编码；@mswjs/http-middleware 自动补 origin） | 接口 | 前端+后端 |  | 规划 |

### M99.F04 handler 覆盖范围 / 全局一致性

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M99.F04.I01 | handlers-array.ts 自动派生（orval 从 shared OpenAPI 生成，npm run gen:handlers） | 接口 | 前端+后端 |  | 规划 |
| M99.F04.I02 | handlers-extra.ts 手写扩展（M00 admin tenants / M01 tenant users / M03 auth / M05 api-keys / M07 apps + menus / M09 roles + role-menu-grants 共 56+ 端点） | 接口 | 前端+后端 |  | 规划 |
| M99.F04.I03 | 分页对齐家族约定（page 0-indexed / pageSize 默认 20 / total=tenant-scoped；contract-test I44 2026-09-01 修订） | 接口 | 前端+后端 |  | 规划 |
| M99.F04.I04 | 全局错误格式（4xx/5xx 统一响应 shape：{ error: { code, message, details } }） | 接口 | 前端+后端 |  | 规划 |
| M99.F04.I05 | HTTP method whitelist（GET/POST/PUT/PATCH/DELETE；其他方法返 405） | 接口 | 前端+后端 |  | 规划 |

### M99.F05 trace.json fns 集合

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M99.F05.I01 | fnReporter 正则 `M\d{2}\.F\d{2}\.I\d{2}` 兼容（it() 标题走同一正则，msw handlers 注释与 orval types 双源都可挂 ID） | 接口 | 前端+后端 |  | 规划 |
| M99.F05.I02 | trace_env PORT 默认值（saas-msw=5100，harness 启动时注入 .harness/stack.json） | 接口 | 前端+后端 |  | 规划 |

### M99.F06 Contract-test live mode（ADR-0016）

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M99.F06.I01 | msw :5100 启动 + ct 仓 fetch `http://localhost:5100/api/v1/*` 断言（contract-test-run-live.md 步骤） | 接口 | 前端+后端 |  | 规划 |
| M99.F06.I02 | 跨进程并发假设（handlers 内存数组进程内 Map 共享；Node 单线程 + 事件循环天然串行，不需加锁） | 接口 | 前端+后端 |  | 规划 |
| M99.F06.I03 | 重启即清契约 + /healthz mode='msw' 让消费者识别「不可当 staging 用」 | 接口 | 前端+后端 |  | 规划 |