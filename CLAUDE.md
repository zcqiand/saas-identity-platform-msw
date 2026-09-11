# CLAUDE.md — SaaS身份平台Mock后端

> 书稿配套仓 + harness 门禁仓双身份。入口，不是手册。L0 门强制上限 60 行。
> 本仓为《（书稿信息待补）》案例（待补）的可运行配套工程，是书稿代码块的 **source of truth**。

## 1. 项目定位

SaaS 多租户多应用身份平台的 mock 边界。**传统 Mock Server / HTTP 中间件模式**（ADR-0012 B 强度）：
MSW v2 handlers 经 `@mswjs/http-middleware` 挂载到 Express，`src/server.ts` 监听**真 TCP :5100**
（健康检查 `/healthz`），请求真实穿越网络栈——CORS / Set-Cookie / HttpOnly 均为真语义。
**MSW 原生浏览器 SW / Node 内存拦截模式已废弃**（v0.3.0 删；勿回引 `mockServiceWorker.js` / `setupWorker`）。
seeds 与 saas_dev 真库**严格镜像**（`tests/seed-parity.test.ts` 锁文件集合= DB 种子表集合 + 内容深度相等）；
**前端仓对本仓零 npm 依赖**（单测 fixtures 走相对路径直连本仓 `src/fixtures/seed.ts`）。不持久化。

## 2. 铁律

- **TDD**：先写失败测试 → 确认红 → 实现 → 确认绿 → commit
- **版本钉死**：依赖与 `version-lock.json` 的 `version_lock` 一致；不引入 lock 外的库
- **tag 即放行**：全量回归绿后打 `v<MAJOR>.<MINOR>.<PATCH>-<YYYYMMDD>`（如 `v0.3.6-20260825`）
- **mock-friendly**：安装 + 测试在无 Key、无 Docker、无网下全绿
- **功能清单是锚点**：改 function-tree 走 `/tree-change`；同 commit；废弃只改状态，编号不复用
- 禁止对外 axios/fetch 调真后端（只服务 mock；不调任何外部 backend，ADR-0012）
- 禁止改 shared 的 OpenAPI（API 变了改 shared 仓 main.tsp）
- 禁止在某端单独修改 fixture（破坏跨端一致性）
- 禁止发布为 npm 包 / 被前端 `file:` 依赖（node_modules 拷贝漂移致门禁假绿，2026-09-11 已根除）
- 禁止 seeds 里出现 DB 没有的表（契约下线连 seeds 一起删；守门= seed-parity 严格镜像）

## 3. 技术栈与版本（钉死于 version-lock.json）

MSW v2 + @mswjs/http-middleware + Express + faker + jose（JWT mock 签发）+ Drizzle ORM schema types（**DB-First via drizzle-kit pull**，ADR-0025）。明细见 `version-lock.json`。

DB schema 不在 msw 手写 — 由 `scripts/pull-schema.sh` 从真库（saas_dev）反推 `src/db/schema.ts`（commit 入 git）；CI L4.db.drift 子门守 schema 与 DB 一致。本仓无 DB 连接（B 强度，ADR-0012），schema 仅作 handler / seed fixture 的 PG column 类型参考。

门禁命令见 `.harness/stack.json`。**不要改它来让门变松。**

## 4. 验收

- suite 根目录跑 `python scripts/gate.py -p saas-identity-platform-msw`
- `npm run dev`（HTTP server `:5100`）/ `npm start`（生产路径）
- DB schema 漂移：先确认 shared 已 `db:migrate`，再 `bash scripts/pull-schema.sh && git add src/db/schema.ts && git commit`

## 5. 指向别处

- OpenAPI 真源 → `../saas-identity-platform-shared`
- 三个前端消费方 → react / vue / nextjs
- 决策 → `docs/adr/`；细则 → `docs/conventions/`；待办 → `PLAN.md`；版本 → `CHANGELOG.md`

## 6. 工作循环

1. 改 fixture：`src/fixtures/seed.ts`；改 handler：`src/handlers-extra.ts`
2. shared 变更 → `npm run gen:handlers`
3. gate exit 1 修；exit 2 停下问人
4. `/handoff` 更新 `.state/session.json`
