# 流程与功能对齐 — saas-identity-platform-msw

> 业务流程图与功能清单映射。机器从「### 孤儿功能」段读取白名单（未在任何流程的 已上线 子项）。

## 流程

（暂无 — MSW mock 仓的设计意图是「端点 → handler」的 1:1 直查，不承载业务流程。
所有 mock handler 都被 contract-test 仓四方比对消费，业务流程图属业务仓责任。）

### 孤儿功能

| 子项 ID | 名称 | 类型 | 已上线原因（不在流程图） |
|---|---|---|---|
| M05.F01.I05 | `http.delete` /tenants/:tenantId/api-keys/:keyId 物理删（幂等 — 重复删 → 404，无 audit） | 接口 | 单端点契约对齐 saas-{aspnetcore,springboot,nextjs} 同 endpoint 行为；不参与业务仓流程图 |

> MSW 仓的「流程」段长期为空是设计预期（ADR-0012）：MSW 是 oracle，不是业务路径。孤儿功能段是 L5 软告警清零的入口。