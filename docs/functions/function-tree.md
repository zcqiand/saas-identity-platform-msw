# saas-identity-platform-msw 功能树

> MSW v2 mock layer — consumes shared OpenAPI spec, produces MSW handlers + cross-frontend fixture data.

## 模块总览

| 模块 ID | 模块名称 | 说明 | 状态 |
|---|---|---|---|
| M05 | API Key 管理 | tenant-scoped Key 生命周期 | 规划 |
| M99 | MSW Mock Layer | 跨端 mock handlers + 共享 fixtures | 规划 |

---

## M05 API Key 管理

| 功能 ID | 功能名称 | 说明 | 状态 |
|---|---|---|---|
| M05.F01 | API Key 生命周期（tenant-scoped） | 接口 | 规划 |

### M05.F01 API Key 生命周期（tenant-scoped）

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M05.F01.I05 | `http.delete` /tenants/:tenantId/api-keys/:keyId 物理删（区别于 I03 revoke 软删；幂等——重复删 → 404，无 audit） | 接口 | 前端+后端 |  | 已上线 |

---

## M99 MSW Mock Layer

| 功能 ID | 功能名称 | 说明 | 状态 |
|---|---|---|---|
| M99.F01 | Fixture data consistency | Fixture data consistency | 规划 |
| M99.F02 | MSW handlers emit OAuth 2.0 server（/oauth/authorize + /oauth/token + code/refresh 映射） | MSW handlers emit OAuth 2.0 server（/oauth/authorize + /oauth/token + code/refresh 映射） | 开发中 |
| M99.F03 | 独立 HTTP 服务暴露（Express + @mswjs/http-middleware，ADR-0012 B 强度） | 独立 HTTP 服务暴露（Express + @mswjs/http-middleware，ADR-0012 B 强度） | 开发中 |

### M99.F01 Fixture data consistency

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M99.F01.I01 | 跨端 seed data 一致性 | 接口 | 前端+后端 |  | 规划 |

### M99.F02 MSW handlers emit OAuth 2.0 server（/oauth/authorize + /oauth/token + code/refresh 映射）

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M99.F02.I01 | MSW handlers 与 shared OpenAPI 同步 | 接口 | 前端+后端 |  | 规划 |

### M99.F03 独立 HTTP 服务暴露（Express + @mswjs/http-middleware，ADR-0012 B 强度）

| 子项 ID | 名称 | 类型 | 交付 | 说明 | 状态 |
|---|---|---|---|---|---|
| M99.F03.I01 | Express + @mswjs/http-middleware 装配（src/server.ts + handlers 零修改） | 接口 | 前端+后端 |  | 规划 |
| M99.F03.I02 | 健康检查端点 /healthz（{ ok, mode:'msw', uptime }） | 接口 | 前端+后端 |  | 规划 |
| M99.F03.I03 | Dockerfile 与容器化（multi-stage + registry.npmmirror.com） | 接口 | 前端+后端 |  | 规划 |
| M99.F03.I04 | 端口约定（saas-msw=5100）+ multi-repo-family §6 端口表同步 | 接口 | 前端+后端 |  | 规划 |