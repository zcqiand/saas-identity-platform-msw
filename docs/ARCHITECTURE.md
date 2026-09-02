# saas-identity-platform-msw Architecture

> saas 家族的 Mock 仓（`M99`）。zoom-in 到这一个仓：
> 它怎么从 `saas-identity-platform-shared` 的 OpenAPI 派生 handler、
> 怎么跨前端共享 fixture、怎么按 ADR-0012 B 强度把自己做成独立 HTTP 服务。

> **范围**：本文档只描述 *架构*（结构 / 边界 / 数据流 / 决策）。
> 编码细则见 [`docs/conventions/`](conventions/)，单个决策的 ADR 见
> [`docs/adr/`](adr/) + suite [`docs/adr/0012-msw-as-http-server.md`](../../docs/adr/0012-msw-as-http-server.md)，
> 功能清单见 [`docs/functions/function-tree.md`](functions/function-tree.md)。

---

## 0. 阅读路径

| 你是… | 直接看 |
|---|---|
| 新人，要 20 分钟搞懂这个仓 | §1 → §2 → §3.1 |
| 想知道 handlers 怎么生成 / 怎么覆盖 | §3.2 → §3.3 |
| 想加一个新 endpoint / 新模块 | §3.4（fixtures）+ §5（流程 1）|
| 想把前端切到这个仓 | §4 |
| 想问"为什么这样设计" | §6（决策索引）→ 对应 ADR |
| 想理解它和兄弟 msw 仓的差异 | §2.3、附录 A |

---

## 1. 角色与定位

**这个仓是 saas-identity-platform 家族的 Mock 边界**——也是 ADR-0012 「B 强度」选型的落地形态之一。

```
                saas-identity-platform-shared
                  (OpenAPI 真源 + SQL 真源)
                          │
                          ▼ files (../shared/generated/openapi/openapi.yaml)
                ┌──────────────────────────┐
                │   saas-identity-platform- │
                │   msw   ← 本仓            │
                │   handlers + cross-fend   │
                │   fixtures + Express HTTP │
                └──────┬──────────┬─────────┘
                       │ :5100    │ :5100
                       ▼          ▼
       6 个前端仓（react / vue / nextjs × 6）切 env 调它
```

| 维度 | 取值 |
|---|---|
| **家族角色** | Mock（saas 家族第 2/7 仓）|
| **实现形态** | ADR-0012 B 强度：Express + `@mswjs/http-middleware` 独立 HTTP 服务 |
| **默认端口** | `:5100`（saas 段 X00，见 `M99.F03.I04` 与 conventions §6）|
| **健康探针** | `GET /healthz → { ok:true, mode:"msw", uptime }`（明牌"我是 mock"，禁止当 staging）|
| **持久化** | 全内存；handlers 对 fixture 数组 push/splice，进程重启即清（与 `src/Dockerfile` 多阶段构建一致）|
| **fixture 形态** | `src/seeds/*.json`（9 张表 + `manifest.json`）+ `src/fixtures/seed.ts` 暴露可变数组 + ID constants |
| **handlers 形态** | 两层：orval codegen（`src/handlers.msw.ts`，faker 兜底）+ 手写 extra（`src/handlers-extra.ts`，确定性）|
| **测试方式** | vitest，两种路径：in-process `setupServer(...handlers)`（fast）+ 跨进程 `fetch(:5100)`（integration）|
| **禁止事项** | ❌ 调任何真后端 / ❌ 持久化到磁盘 / ❌ 改 shared 的 OpenAPI / ❌ 单端修 fixture（破坏跨端一致）|

**为什么需要这个仓**：

1. **6 个前端仓不能各搭一套 fixture**——react / vue / nextjs × 同一份契约，需要 *跨端一致* 的种子数据，否则
   「lab-react 显示 alice、saas-react 显示 bob」这种漂移在 CI 里没法追。
2. **MSW 原生只在浏览器侧用 Service Worker 拦截**——但 saas-nextjs 兼全栈后端（Drizzle + jose），
   它需要 *server-side* mock（`app/api/v1/oauth/authorize` 在 dev 也要走 fixture）；
   把 msw 仓做成 HTTP 后端才能让 *所有* 消费方（不论浏览器、Node、Vitest、Drizzle 启动时）都 fetch 同一个端点。
3. **生产 vs mock 不能混淆**——`/healthz` 暴露 `mode:"msw"` 让消费者一眼识别，
   也让 deploy 脚本的探针不把 msw 误判成 staging。

---

## 2. 目录骨架

### 2.1 当前形态

```
saas-identity-platform-msw/
├── CLAUDE.md                      ← 入口：禁真后端调用 / 指 src/server.ts / ADR-0012
├── .harness/stack.json            ← suite 门禁读的项目自描述
├── docs/
│   ├── ARCHITECTURE.md            ← 本文档
│   ├── functions/function-tree.md ← M99.F01/F02/F03 + 7 个 I 子项
│   ├── adr/                       ← 本仓特有 ADR（目前随 suite 通用）
│   ├── design/                    ← 设计稿（人评审）
│   └── conventions/               ← 本仓编码细则
├── src/
│   ├── server.ts                  ← Express + cors + @mswjs/http-middleware + /healthz
│   ├── handlers-array.ts          ← [extra, ...orval] 包装，导出 handlers
│   ├── handlers-extra.ts          ← 手写确定性 handlers（auth/oauth/tenants/users/...）
│   ├── handlers.msw.ts            ← orval codegen 产物（faker handlers，655 行）
│   ├── handlers.msw.msw.ts        ← orval codegen 产物（faker mock factory，getTitleMock）
│   ├── handlers.msw.schemas.ts    ← orval codegen 产物（Zod schemas）
│   ├── generated_ts_shim.ts       ← 运行时类型 shim（与 shared OpenAPI 对齐）
│   ├── fixtures/
│   │   └── seed.ts                ← 可变数组 + lookup helpers + ID constants
│   ├── seeds/
│   │   ├── index.ts               ← JSON-per-table barrel（12 张表）
│   │   ├── manifest.json          ← 元数据：version/extracted_at/source/tables[]
│   │   ├── tenants.json  apps.json  users.json  roles.json
│   │   ├── api-keys.json  menus.json  role-menu-grants.json
│   │   ├── audit-events.json  memberships.json  permissions.json
│   │   ├── role-permissions.json  audit-retention-policies.json
│   ├── index.ts                   ← 公共 API surface（fixtures + helpers；不 re-export handlers/Server）
│   └── node.ts                    ← setupNodeMocks（msw/node interceptor，test only）
├── tests/
│   ├── oauth-server.test.ts       ← M99.F02 OAuth 契约测试（in-process setupServer）
│   ├── fixtures.test.ts           ← 跨端 fixture 一致性 + ID canonical 校验
│   └── fnReporter.ts              ← 自定义 vitest reporter（fnTest → trace.json）
├── orval.config.ts                ← 读 ../shared/generated/openapi/openapi.yaml → handlers.msw.ts
├── vitest.config.ts               ← esbuild.format=esm（必填，详见 §6）
├── package.json                   ← deps: express + cors + @mswjs/http-middleware + msw + faker
├── tsconfig.json
├── Dockerfile                     ← multi-stage builder + runner（multi-stage，registry.npmmirror.com）
└── README.md
```

### 2.2 与 suite 父仓 `5 段式` 骨架的映射

suite 父仓 [`docs/ARCHITECTURE.md` §2.3](../../docs/ARCHITECTURE.md#23-仓库矩阵14-个仓各自-5-段结构) 列了所有子仓的 5 段式，本仓逐项对应：

| 段 | 本仓位置 |
|---|---|
| CLAUDE.md | 仓根 |
| `.harness/stack.json` | 仓根 |
| `docs/{functions,adr,design,conventions}/` | `docs/` |
| `src/` | `src/` |
| `tests/` | `tests/` |
| `Dockerfile` | `Dockerfile` |

本仓没有 `scripts/gen-shared.{sh,ts}`（mock 仓不调 codegen，codegen 是 orval 自己跑 `npm run gen:handlers`）。

### 2.3 与兄弟 msw 仓的差异

| 维度 | saas-msw（本仓）| lab-msw |
|---|---|---|
| 默认端口 | **5100** | 5200 |
| 共享 fixture 域 | OAuth / tenants / users / roles / apps / menus / api-keys / audit | 业务域（contracts/receipts/samples/methods）|
| OAuth handler | ✅（`authExtraHandlers` 含 `/oauth/authorize` + `/oauth/token`）| ❌ |
| CORS 白名单中的对侧 msw | lab-msw:5200 | saas-msw:5100 |
| 与 nextjs 全栈仓关系 | saas-nextjs `app/api/v1/` 启动时也 fetch saas-msw | lab-nextjs 不兼全栈 |

---

## 3. 核心模块

### 3.1 HTTP 服务入口（`src/server.ts`）

ADR-0012 B 强度的核心实现，30 行搞定所有 HTTP 装配：

```ts
const PORT = Number(process.env.PORT ?? 5100)
const ALLOWED_ORIGINS = [
  'http://localhost:5101',  // nextjs dev
  'http://localhost:5202',  // react/vue dev (lab-msw 同源; saas 调 lab 跨源)
  'http://localhost:5100',  // react/vue dev (saas-msw 同源)
] as const

const app = express()
app.use(cors({ origin, credentials:true }))
app.use(express.json())
app.use(createMiddleware(...handlers))   // ★ 核心：handlers 零修改

app.get('/healthz', (_req, res) => {
  res.json({ ok:true, mode:'msw', uptime: process.uptime() })
})

app.listen(PORT, () => console.log(`[saas-msw] mock http server listening on :${PORT} (mode=msw)`))
```

**关键决策**：

- **`createMiddleware(...handlers)`** —— `@mswjs/http-middleware` 接收一个 *普通* MSW handlers 数组，
  把 Express req/res 重建为 Web `Request` 然后调 handler，再把 `Response` 写回 res。
  handlers 本身**零修改**（与 in-process `setupServer(...handlers)` 用同一份数组）。
- **`ALLOWED_ORIGINS` 白名单** —— 跨源 dev 必须显式列出；`credentials:true` 让 cookie/session 能跨源。
  新增前端 dev origin（如 vue=5103 已有，但若新增 vite 子项目）必须**同步改两仓**（saas-msw + lab-msw）的 `src/server.ts`，
  否则浏览器报 CORS 错（suite 父仓 [`docs/ARCHITECTURE.md` §3.5](../../docs/ARCHITECTURE.md#35-端口与-cors-对称) 列了同源表）。
- **`/healthz`** —— 三个字段各有用途：
  - `ok:true`：deploy 脚本 30s 间隔 wget 探活；
  - `mode:'msw'`：消费者明确知道这是 mock，不会把它当真后端调用 OAuth redirect；
  - `uptime`：测试「重启即清」语义（fixtures 应在重启后回到 seed 初值）。
- **不调任何真后端** —— `server.ts` 里**没有** `axios.post(...)` / `fetch(...)` 到外部 URL。
  整个 msw 仓的依赖图是个 DAG：shared OpenAPI → handlers → msw serve。无外部联调（CLAUDE.md §2 硬约束）。

### 3.2 Handlers 分层

| 层级 | 文件 | 来源 | 优先级 | 数据来源 |
|---|---|---|---|---|
| **L1 — extra（确定性）** | `src/handlers-extra.ts`（797 行）| 手写 | **先匹配**（`handlers-array.ts` 中 `[...extra, ...faker]`）| `src/fixtures/seed.ts` 的可变数组 |
| **L2 — orval（faker）** | `src/handlers.msw.ts`（655 行）| `npm run gen:handlers` 自动生成 | 兜底 | `@faker-js/faker` |
| **L3 — schemas** | `src/handlers.msw.schemas.ts` | orval 产物 | 校验 | Zod |

**为什么分层**：

- **orval codegen** 保证 handler 形状（path / method / response shape）永远跟得上 shared OpenAPI。
  改完 shared → `npm run gen:handlers` → handlers.msw.ts 自动出新路由。
- **faker 数据** 适合「随便给个 demo 数据」的 endpoint，但**不适合** OAuth state、menu 树、role 权限这种 *有状态* 的接口——
  否则 `oauthCodes` Map 没法维护、`/me/menus` 每次返回的菜单都不一样。
- **extra 优先匹配** 让确定性接口（M00/M01/M02/M03/M05/M07/M08/M09）先吃；
  漏配的接口自动落 orval faker（避免新加 endpoint 时忘改 msw 而 404）。

**`src/handlers-array.ts`** 是装订层：

```ts
export const handlers = [...extraHandlers, ...getTitleMock()]
```

注释里明确写出："如果 orval 改了 factory 名（`getTitleMock`），更新这个 wrapper"——这是 codegen 与手写层的边界契约。

### 3.3 OAuth 2.0 server（`authExtraHandlers`）

`M99.F02` + `M99.F02.I01` 的核心实现（`handlers-extra.ts:256-499`）：

| 端点 | 实现要点 |
|---|---|
| `POST /api/v1/auth/login` | `users[]` 查 username，密码统一 `dev123456`（与 lab-msw 对齐）→ 写 `auditEvents` → 返回 `mock-jwt-<userId>` |
| `POST /api/v1/auth/logout` | noop 204（AuditAction 枚举里没 logout）|
| `GET /api/v1/me` | 解析 `Authorization: Bearer mock-jwt-<userId>` → 查 `users[]` |
| `POST /api/v1/oauth/authorize` | 校验 `clientId/redirectUri/responseType=code/scope/state/tenantId`；code 存 `oauthCodes` Map |
| `POST /api/v1/oauth/token`（authorization_code）| code 一次性（取出立即删）+ 签 `saas-jwt-`/`saas-rt-`；refresh_token 存 `oauthRefreshTokens` Map |
| `POST /api/v1/oauth/token`（refresh_token）| 旧 refresh 立即失效（防重放），发新一对 token |

**内存映射**（`handlers-extra.ts:42-49`）：

```ts
const oauthCodes = new Map<string, { appId; userId; tenantId; scope; redirectUri }>()
const oauthRefreshTokens = new Map<string, { appId; userId; tenantId; scope }>()
```

这两个 Map 在 *模块作用域*，不在 handler 内部——因为数组字面量不能含 `const` 声明，
且它们的生命周期 = server 进程生命周期（**重启即清**，与 §1「全内存」一致）。

**dev 简化**：

- 不验 `clientSecret`（生产 saas-springboot / saas-aspnetcore 真后端验）；
- dev mock 直接用 `clientId` 绑第一个匹配 user（生产走真实用户登录流程）；
- `tenant` 范围不显式建模在 App 上（saas-shared App 模型只到 `redirectUris/scopes/grantTypes`），用「该 tenant 下是否有用户」隐式校验。

### 3.4 Fixtures & Seeds

**两层结构**（v0.4.0 起的现状）：

```
src/seeds/*.json              ← 9 张表的 JSON 真源（per-table 模式）
src/seeds/manifest.json       ← 元数据：version + tables[]（含 count + note）
src/seeds/index.ts            ← JSON-per-table barrel + ID constants
src/fixtures/seed.ts          ← 把 JSON 数组 cast 成可变 + lookup helpers
src/generated_ts_shim.ts      ← 运行时类型 shim（Tenants/Users/Roles/... 类型）
```

**为什么 JSON-per-table**（v0.4.0 之前是单 `seed.ts` 一坨）：

| 优势 | 详情 |
|---|---|
| **diff 友好** | 加一个 user 只改 `users.json` 1 行；旧版 diff 一坨 TS |
| **从 shared SQL 对齐** | manifest.json 的 `extracted_at` + `source` 字段标明「这是从 `backup/saas-identity-platform-shared/seeds/` 抽出来的」|
| **类型与数据分离** | `fixtures/seed.ts` 只放 lookup helpers + ID constants，不掺数据 |

**当前 manifest 版本**：`0.4.0`（V008 补 SQL `roleIds[]` 列后；M04 合并 OAuthApp + M07 → M04）；
`extracted_at: 2026-08-13`。

**可变 vs 只读**：

```ts
// fixtures/seed.ts
export const tenants = _tenants as unknown as Tenant[]   // cast 到可变
export const getTenant = (id: string) => tenants.find((t) => t.id === id)
```

JSON `import` 给的数组类型上是 readonly，但**运行时引用稳定**——handlers `push`/`splice` 修改的就是这个引用，
下次 `getTenant(id)` 能看到新数据。TypeScript 的 readonly 是个 view，不是 runtime invariant。

**`generated_ts_shim.ts`** 是把 shared OpenAPI 的 `tsp/models/*.tsp` 编译出来的 TS 类型**复制**到本仓（手维护）。
为什么不直接 `import` shared？

- shared 是契约仓，**没有 runtime 依赖**（suite [`docs/ARCHITECTURE.md` §4.1](../../docs/ARCHITECTURE.md#41-契约仓shared--2)）；
- msw 仓有 runtime（Express/cors/msw），不能让 shared 被 webpack rollup 拖进来；
- shared 中间产物 `openapi.yaml` 是 OpenAPI 3（不是 TS 类型）——orval 只生成 Zod schemas，不生成 TS 类型（除非另开 orval `client` 输出）。
- 因此手维护 `generated_ts_shim.ts` 是当前最稳的路径（受 v0.3.0 教训驱动）。

### 3.5 Public API surface（`src/index.ts`）

包入口**故意不 re-export**：

- `setupNodeMocks`（msw/node interceptor）—— 它会拖 `msw/node`，浏览器 bundle 失败；
  改走 `"@saas/identity-platform-msw/node"` 子路径（test setup only）。
- `handlers` —— orval 产物 `handlers.msw.msw` 拖 `msw + faker` 进 webpack；
  改走 `"@saas/identity-platform-msw/handlers"` 子路径（v0.3.1 Docker sibling clone 教训）。
- Service Worker 模式（`msw/browser`）—— v0.3.0 起**完全删除**；
  浏览器侧 MSW 走 `@mswjs/http-middleware` 起的独立 HTTP server（`src/server.ts`）。

这些 re-export 边界的副作用都写在 `src/index.ts` 的注释里——和 v0.3.x 的几轮事故一一对应。

---

## 4. 与消费方契约

### 4.1 6 个前端仓怎么切到 `:5100`

| 前端仓 | dev env | 切到本仓的方式 |
|---|---|---|
| `saas-identity-platform-react` | `NEXT_PUBLIC_API_BASE_URL=http://localhost:5100` | axios baseURL 直接指向 msw；`installHttpClient()` 调一次 |
| `saas-identity-platform-vue` | 同上 | 同上 |
| `saas-identity-platform-nextjs`（前端）| 同上 | 同上；同仓的 `app/api/v1/*` 在 dev 改走 fetch(:5100)（避免重复实现 OAuth state）|
| `saas-identity-platform-react`（调 lab）| `LAB_SAAS_API_BASE_URL=http://localhost:5100` | 跨家族调 saas 时用 `lab-msw` 同源（:5200）+ `saas-msw` 跨源（:5100）|

详见 suite [`docs/ARCHITECTURE.md` §3.3](../../docs/ARCHITECTURE.md#33-后端模式env-driven-单-urladr-0014)
（ADR-0014 env-driven 单 URL 模式——`BackendMode` 联合类型已废弃）。

### 4.2 CORS 白名单如何跨源

**单源白名单硬编码在 `src/server.ts::ALLOWED_ORIGINS`**（3 个 origin）：

```
http://localhost:5101   ← nextjs dev（跨源，App Router）
http://localhost:5202   ← lab react/vue dev；也含 lab-msw（5200）
http://localhost:5100   ← 本仓自指（react/vue dev 同源）
```

**新增前端 dev origin 的 checklist**：

1. 改 `src/server.ts::ALLOWED_ORIGINS` 加一行；
2. 同步改 `lab-msw/src/server.ts::ALLOWED_ORIGINS`（同源白名单对称）；
3. 同步改两仓 `.env.example` 模板加 `*_API_BASE_URL`；
4. 跑 `python ../scripts/gate.py --all`（跨仓一致性门）。

漏配 → 浏览器 CORS 错 → Cloudflare 把 502 换皮丢 CORS 头 → 误诊
（详见 `memory/springboot-env-drift-502-trap.md` + suite [`docs/ARCHITECTURE.md` §3.5](../../docs/ARCHITECTURE.md#35-端口与-cors-对称)）。

### 4.3 端点契约对齐

所有 `/api/v1/*` path 必须与 `saas-identity-platform-shared/generated/openapi/openapi.yaml` 一致：

| 本仓 path | shared OpenAPI 定义 |
|---|---|
| `/api/v1/oauth/authorize` | `OidcCallback` op（POST）|
| `/api/v1/oauth/token` | `OidcToken` op（POST）|
| `/api/v1/auth/login` | `LoginRequest` op |
| `/api/v1/admin/apps` | `AdminAppsListApps` op |
| `/api/v1/me/menus` | `MeGetMyMenus` op |
| ... | ... |

orval 从 `openapi.yaml` 生成 `handlers.msw.ts` 后，path 拼写错误会被 TS 编译拦下来（path-template 类型）；
但 path 形似实不同（如 `/admin/app` vs `/admin/apps`）不会——所以 L4 测试覆盖 OAuth state 流转是 *契约测试* 的核心（`tests/oauth-server.test.ts`）。

---

## 5. 核心流程

### 5.1 改一次契约 → handlers 同步

```
1. [shared] 改 tsp/routes/oauth.tsp 或加 op
   ↓ commit + push

2. [shared] npm run build           ← emit:openapi 生成 generated/openapi/openapi.yaml
   gate: python ../scripts/gate.py -p saas-identity-platform-shared
   ↓ exit 0

3. [本仓] npm run gen:handlers     ← orval 读 ../shared/generated/openapi/openapi.yaml
   → 重写 src/handlers.msw.ts + handlers.msw.msw.ts + handlers.msw.schemas.ts
   ↓

4. [本仓] 若新 op 不在 src/handlers-extra.ts 覆盖范围
   → 评估是否需要确定性 fixture：
     a) 无状态 demo 数据 → 让 orval faker 兜底即可（不动 handlers-extra.ts）
     b) OAuth state / 状态机 / CRUD 持久 → 在 src/handlers-extra.ts 加 handler
   ↓

5. [本仓] npm test                  ← vitest 跑 in-process setupServer 测试
   + 手动 curl GET /healthz 确认 dev server 起得来
   ↓

6. [本仓] gate: python ../scripts/gate.py -p saas-identity-platform-msw
   → exit 0 全绿
   ↓

7. [suite] 推 gitlink；其他仓各自 tag 推进指针
```

**关键检查点**：

- 改 `shared` 的 BASE tree F 级（`M99.F0X`）必须**先**于本仓 `handlers-extra.ts` 改 I 级；
  否则 L5 红（"已上线但无 BASE 引用"告警，suite [`docs/ARCHITECTURE.md` §3.7](../../docs/ARCHITECTURE.md#37-function-tree-是-跨端对齐的索引)）；
- `orval.config.ts` 里 `baseURL: "http://localhost:5202"` —— 写错了会让 orval 的 `BaseURL` 类型生成器误判，
  生成的 fetch 调用路径会偏。建议改 path 前先 grep `baseURL`。

### 5.2 启动 dev server → 拦截 → 返回 JSON

```
1. cd output/saas-identity-platform-msw && npm run dev
   → tsx watch src/server.ts
   → Express listen :5100
   → console.log("[saas-msw] mock http server listening on :5100 (mode=msw)")

2. 浏览器 / vitest / saas-nextjs 全栈后端 fetch http://localhost:5100/api/v1/...

3. Express 收请求：
   - cors middleware: 校验 origin ∈ ALLOWED_ORIGINS → 设 Access-Control-* 头
   - express.json(): 解析 body
   - createMiddleware(...handlers):
     a) 重建 Web Request（@mswjs/http-middleware 内部）
     b) 遍历 handlers[]，先匹配 [extra, ...faker]：
        - extra 匹配：HttpResponse.json(...) 直接返回
        - faker 兜底：@faker-js/faker 生成数据 + Zod schema 校验
     c) Response 写回 Express res

4. 客户端收 JSON：
   - axios：直接拿 response.data
   - saas-nextjs app/api/v1/*：Drizzle 同步内存数据时也走 :5100（dev 模式）
```

### 5.3 健康检查与 mode 标识

```
$ curl http://localhost:5100/healthz
{"ok":true,"mode":"msw","uptime":12.345}
```

| 字段 | 用途 |
|---|---|
| `ok:true` | deploy 脚本探活（Dockerfile `HEALTHCHECK` 每 30s wget --spider）|
| `mode:'msw'` | 消费者识别——「这是 mock 不是 staging」，OAuth callback 不会真跳 |
| `uptime` | 测试「重启即清」语义——重启后 fixtures 应回到 seed 初值 |

**禁止** 把 `mode` 改成 `"staging"` / `"production"`——那是欺骗 deploy 脚本；ADR-0012 §3 硬约束。

### 5.4 测试路径

| 路径 | 文件 | 用途 |
|---|---|---|
| **in-process（fast）** | `tests/oauth-server.test.ts`、`tests/fixtures.test.ts` | `setupServer(...handlers)` 拦截；不走真 HTTP；0 网络延迟 |
| **跨进程（integration）** | `tests/integration/*.test.ts`（如存在）| `fetch(http://localhost:5100/...)` 走真 Express；可观测 CORS、body parse |

**vitest config 关键点**（`vitest.config.ts`）：

```ts
esbuild: { format: "esm" }   // ★ 必须显式
```

`package.json` 是 `"type": "module"`，把 `.js` 当 ESM；
esbuild 默认对 `.ts` 输出 CJS（含 `exports` / `require`），会触发 `ReferenceError: exports is not defined`。
强制 `format: "esm"` 让 esbuild 输出 ESM。这是 v0.2.x 教训，注释里明确说明。

### 5.5 Docker 部署

`Dockerfile` multi-stage：

```
builder: node:20-alpine + npm ci + npm run gen:handlers
runner:  node:20-alpine + npm ci --omit=dev + EXPOSE 5100 + HEALTHCHECK wget /healthz
```

- `registry.npmmirror.com`（CLAUDE.md 顶层约束）；
- `ENV PORT=5100`；
- `HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget ... /healthz`；
- 进程启动：`CMD ["npx", "tsx", "src/server.ts"]`（生产也用 tsx，**不**编译成 JS——与 `src/server.ts` 是 TS 入口一致）。

---

## 6. 决策索引

### 6.1 套件级 ADR（来自父仓 `docs/adr/`）

| ADR | 主题 | 一句话 |
|---|---|---|
| [ADR-0007](../../docs/adr/0007-shared-sql-ssot.md) | shared 仓扩到双 SSOT | shared 同时是 API + DB schema 真源；msw 仓从 openapi.yaml 读派生 |
| [ADR-0008](../../docs/adr/0008-nextjs-full-stack.md) | saas-nextjs 兼全栈 | saas-nextjs dev 改走 fetch(:5100) 复用 msw 的 OAuth state |
| [ADR-0012](../../docs/adr/0012-msw-as-http-server.md) | **msw 仓升级为独立 HTTP 服务** | **B 强度**：Express + `@mswjs/http-middleware` 暴露端口；本仓的核心决策 |
| [ADR-0014](../../docs/adr/0014-env-driven-single-url.md) | env-driven 单 URL | 废弃 runtime BackendMode 联合类型；改 env-driven 3 getter |

### 6.2 本仓特有 ADR

| ADR | 主题 | 一句话 |
|---|---|---|
| ADR-v0.3.0 | **删除 msw/browser**（SW 模式）| 浏览器侧 MSW 完全走 `@mswjs/http-middleware`；避免 SW + SSR 双重拦截的复杂性 |
| ADR-v0.3.1 | **handlers 不从根入口 re-export** | `handlers-array` → `handlers.msw.msw` 拖 `msw + faker`；Docker sibling clone 报 module not found；改 `@saas/identity-platform-msw/handlers` 子路径 |
| ADR-v0.4.0 | **JSON-per-table fixture** | seed.ts 单文件 → src/seeds/*.json + manifest.json + index.ts；diff 友好、可从 shared SQL 抽取 |

### 6.3 隐含约束（CLAUDE.md 写明）

- 禁止手写对外 axios / fetch 调真后端（msw 仓只服务 mock；ADR-0012 B 强度）；
- 禁止改 shared 的 OpenAPI（API 变了改 shared 仓的 `main.tsp`）；
- 禁止在某端单独修改 fixture（破坏跨端一致性）；
- npm 依赖走 `registry.npmmirror.com`。

### 6.4 Function Tree 状态

见 [`docs/functions/function-tree.md`](functions/function-tree.md)：

| ID | 名称 | 状态 |
|---|---|---|
| `M99` | MSW Mock Layer | 规划 |
| `M99.F01` | Fixture data consistency | 规划 |
| `M99.F02` | MSW handlers emit OAuth 2.0 server | 开发中 |
| `M99.F03` | 独立 HTTP 服务暴露（ADR-0012 B 强度）| 开发中 |
| `M99.F01.I01` | 跨端 seed data 一致性 | 规划 |
| `M99.F02.I01` | MSW handlers 与 shared OpenAPI 同步 | 规划 |
| `M99.F03.I01` | Express + `@mswjs/http-middleware` 装配 | 规划 |
| `M99.F03.I02` | `/healthz` 端点 | 规划 |
| `M99.F03.I03` | Dockerfile 与容器化 | 规划 |
| `M99.F03.I04` | 端口约定（5100）+ multi-repo-family §6 同步 | 规划 |

---

## 7. 术语表

| 术语 | 含义 | 详细 |
|---|---|---|
| **ADR-0012** | msw-as-http-server 决策 | B 强度：msw 仓从 library 升级为 HTTP 后端服务；本仓的根 |
| **B 强度** | ADR-0012 选定的改造强度 | HTTP server + 内存数组 + `/healthz` 明牌；与 A 强度（仅 library）相对 |
| **extra handlers** | 手写确定性 handlers | `src/handlers-extra.ts`；优先于 orval faker 匹配 |
| **faker handlers** | orval 生成的兜底 handlers | `src/handlers.msw.ts`；无状态时随机生成 demo 数据 |
| **JSON-per-table** | v0.4.0 fixture 形态 | 每张表 1 个 JSON 文件 + `manifest.json` + `index.ts` barrel |
| **handlers-array** | handlers 装订层 | `[...extraHandlers, ...getTitleMock()]`；handlers 与 setupServer/setupMiddleware 都用它 |
| **@mswjs/http-middleware** | msw v2 的 Node 适配器 | 把 Express req/res 重建为 Web `Request`，handlers 零修改 |
| **mode='msw'** | `/healthz` 返回的明牌标识 | 消费者识别「这是 mock 不是 staging」 |
| **fixtures/seed.ts** | fixture 可变层入口 | cast JSON 数组为可变 + lookup helpers + ID constants |
| **seeds/manifest.json** | fixture 元数据 | version + extracted_at + source + tables[].count/note |
| **generated_ts_shim.ts** | 运行时类型 shim | shared OpenAPI TS 类型的复制（手维护，因 shared 无 runtime） |
| **跨端 fixture 一致性** | saas-react / vue / nextjs 看同一份种子 | 改 `seeds/*.json` 必须对全部 6 个前端仓生效 |
| **`OAuthExtraHandlers`** | handlers-extra.ts 内的 auth 子集 | 含 `/auth/{login,logout,me}` + `/oauth/{authorize,token}` |
| **M99** | MSW Mock Layer 模块 ID | 跨家族独立命名空间（与 shared 的 M00-M09 平行）|

---

## 附录 A：与父仓 `docs/ARCHITECTURE.md` 的关系

suite 父仓 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) 是**全景视图**——14 个仓、5 种角色、12 份 ADR、跨仓流程。

**本文档是 zoom-in**——只讲这一个仓的目录结构、handlers 分层、fixtures 形态、dev server 装配。

**两者交叉引用**：

| 父仓章节 | 本仓对应 |
|---|---|
| §2.3 14 子仓角色矩阵 | §2.3 与 lab-msw 的差异表 |
| §3.6 Mock 仓 = 独立 HTTP 服务（B 强度）| §3.1 HTTP 服务入口（具体到 `src/server.ts` 的 30 行实现）|
| §3.5 端口与 CORS 对称 | §4.2 CORS 白名单具体配置 |
| §4.2 Mock 仓目录骨架 | §2.1 当前形态 |
| §4.3 6 个前端仓怎么切 msw | §4.1 6 个前端仓怎么切到 `:5100` |
| §5.1 改一次契约 → 三端同步 | §5.1 改一次契约 → handlers 同步（本仓视角）|
| §5.4 门禁链 | §5.4 测试路径 + §5.5 Docker |
| §7.3 端形态 ADR | §6.1 套件级 ADR（只列与本仓相关的 4 份）|

**本仓特有的决策**（父仓 ARCHITECTURE 没列）见 §6.2——主要是 v0.3.x 的 3 次包形态教训
（删 SW 模式、不 re-export handlers、JSON-per-table fixture）。

---

## 附录 B：相关文档

- 本仓 CLAUDE.md：`../CLAUDE.md`（入口：禁真后端调用 / 指 src/server.ts / ADR-0012）
- 本仓 function tree：`./functions/function-tree.md`
- suite 父仓 ARCHITECTURE：`../../docs/ARCHITECTURE.md`
- suite 父仓 ADR-0012（msw-as-http-server）：`../../docs/adr/0012-msw-as-http-server.md`
- suite 父仓 ADR-0008（nextjs-full-stack）：`../../docs/adr/0008-nextjs-full-stack.md`
- suite 多仓家族规约：`../../docs/conventions/multi-repo-family.md`
- 跨仓经验教训：`../../../memory/`（`springboot-env-drift-502-trap.md` 等）
- 兄弟 msw 仓：`../lab-management-system-msw/docs/ARCHITECTURE.md`（同构，端口 5200）
- 契约源：`../saas-identity-platform-shared/`（`generated/openapi/openapi.yaml`）