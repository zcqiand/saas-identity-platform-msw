# SaaS 多租户多应用身份平台 · Mock 后端

SaaS 身份平台的 mock 边界 —— MSW v2 handler + 跨前端一致 fixture，独立 HTTP 后端（`:5174`）。

本仓为《（书稿信息待补）》案例（待补）的可运行配套工程，是书稿代码块的 **source of truth**。

## 快速开始

```bash
npm install           # 安装依赖
npm run gen:handlers  # 同步 shared OpenAPI 变更（orval 生成 faker handlers）
npm test              # 全量测试（无 Key / 无 Docker / 无网可跑）
npm run dev           # 起 HTTP server，监听 :5174（健康检查 /healthz）
npm start             # 生产路径
```

## 功能特性

- 从 shared 仓 OpenAPI 派生 handler 结构；`handlers-extra.ts` 手写确定性 handler 优先于 faker 兜底
- faker 生成跨端一致 fixture；lab-mgmt client 白名单 + lab-react 生产回调（seeds）
- 独立 HTTP 部署：`src/server.ts` listen `:5174`，供 react / vue / nextjs 前端直接 fetch

## 技术栈

| 技术 | 版本 |
| :--- | :--- |
| MSW | ^2.7.0 |
| @mswjs/http-middleware | ^0.10.3 |
| Express | ^4.21.0 |
| @faker-js/faker | ^9.0.0 |
| jose（JWT mock 签发） | ^5.10.0 |
| TypeScript | ^5.7.0 |
| Vitest | ^2.1.0 |

> 依赖版本与 `version-lock.json` 的 `version_lock` 一致，不引入 lock 外的库。

## 配套书籍及章节映射

| 章 | 主题 | 对应源文件 |
| :--- | :--- | :--- |
| （待补） | | |

## 快速链接

- [CLAUDE.md](CLAUDE.md) — 开发约定与编码规范
- [系统架构.md](docs/ARCHITECTURE.md) — 结构 / 边界 / 数据流 / 决策
- [功能规格.md](docs/functions/function-tree.md) — 功能名称、描述与验收标准
- [未来开发计划](PLAN.md) — 待办与迭代方向
- [更新日志](CHANGELOG.md) — 版本变更记录
