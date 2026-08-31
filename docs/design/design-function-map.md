# 设计与功能对齐 — saas-identity-platform-msw

> 人填、人评审。机器只检查功能 ID 存在性。
> 回答一个问题：**这个功能子项，落到哪段代码、哪段 handler、哪份 fixture 上？**
> 答不上来的行，说明设计没做完，别开工。

## 映射表

| 功能子项 ID | Handler/组件 | 接口 | Fixture / 数据来源 | 权限码 | 设计稿 | 状态 |
|---|---|---|---|---|---|---|
| M05.F01.I05 | `src/handlers-extra.ts` M05 block `http.delete` L1018 | DELETE `/api/v1/tenants/:tenantId/api-keys/:keyId` | in-memory `apiKeys[]`（src/handlers-extra.ts 顶部 fixture） | M05.F01.I05 | – | 已上线 |

> MSW mock 层是 oracle — 它必须先绿于真后端；其余已上线 fn 暂无（仅 M05.F01.I05 一条）。
> 后续 Phase 若新增 已上线 fn（其余 M05.F01 子项、M99 mock infra 等），按同样模式补行。
> ADR-0012 B 强度：MSW 独立 HTTP 后端 `src/server.ts`，`/healthz` 报告 mode='msw'。