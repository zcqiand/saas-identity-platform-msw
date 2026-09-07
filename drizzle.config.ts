// drizzle.config.ts — saas-identity-platform-msw DB-First config（ADR-0025 Phase 7b）
//
// 设计：
// - msw 是 mock 后端（B 强度无持久化，ADR-0012），无 DB 连接
// - 但 schema.ts 是 TS 类型真源；drizzle-kit pull 从真库 introspect 给本仓做类型引用
// - 本仓用 schema.ts 给 handler / seed fixture 提供 PG column 类型
// - 不调 drizzle-kit generate（schema-first SSOT 在 shared 仓）

import { defineConfig } from "drizzle-kit";

const pgHost = process.env.PG_HOST ?? "100.79.128.25";
const pgPort = Number(process.env.PG_PORT ?? 5432);
const pgUser = process.env.PG_USER ?? "postgres";
const pgPassword = process.env.PG_PASSWORD ?? "";
const pgDatabase = process.env.PG_DATABASE ?? "saas_dev";
const pgSsl = process.env.PG_SSL === "1";

export default defineConfig({
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    host: pgHost,
    port: pgPort,
    user: pgUser,
    password: pgPassword,
    database: pgDatabase,
    ssl: pgSsl,
  },
  verbose: true,
  strict: true,
});
