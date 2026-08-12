# saas-identity-platform-msw

> MSW v2 mock layer — consumes shared OpenAPI, produces MSW handlers + cross-frontend fixture data.

## 1. 这是什么

SaaS Identity Platform 的 mock 边界。从 shared 仓的 OpenAPI 派生 handler 结构 + 用 faker 生成跨端一致的 fixture 数据。

## 2. 禁止事项

- 禁止手写 fetch / axios / 真后端调用
- 禁止改 shared 的 OpenAPI（如果 API 变了，改 shared 仓的 main.tsp）
- 禁止在某端单独修改 fixture（破坏跨端一致性）

## 3. 指向别处

- shared 仓：../saas-identity-platform-shared（OpenAPI 真源）
- 三个前端消费方：react / vue / nextjs

## 4. 工作循环

1. 改 src/fixtures/seed.ts（跨端 fixture）
2. npm run gen:handlers（同步 shared OpenAPI 变更）
3. python ../scripts/gate.py -p saas-identity-platform-msw
