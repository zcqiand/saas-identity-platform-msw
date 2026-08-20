# saas-identity-platform-msw 功能树

> MSW v2 mock layer — consumes shared OpenAPI spec, produces MSW handlers + cross-frontend fixture data.

## 模块总览

| ID  | 模块 | 业务域边界 | 状态 |
|-----|------|-----------|------|
| M99 | MSW Mock Layer | 跨端 mock handlers + 共享 fixtures | 规划 |

## 功能级（M0x.F0y）

| ID       | 功能 | 类型 | 状态 |
|----------|------|------|------|
| M99.F01  | Fixture data consistency | 接口 | 规划 |
| M99.F02  | MSW handlers emit OAuth 2.0 server（/oauth/authorize + /oauth/token + code/refresh 映射） | 接口 | 开发中 |

## 子项级（M0x.F0y.I0y）

| ID             | 子项 | 类型 | 状态 |
|----------------|------|------|------|
| M99.F01.I01    | 跨端 seed data 一致性 | 接口 | 规划 |
| M99.F02.I01    | MSW handlers 与 shared OpenAPI 同步 | 接口 | 规划 |
