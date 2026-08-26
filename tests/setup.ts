// tests/setup.ts — vitest 全局 setup (Phase 1A v0.4.0)
//
// HS256 真签发需要 JWT_SIGNING_KEY env。vitest 不自动加载 .env.test，
// 这里在 setupFiles 阶段显式设定。dev key 与 .env.test / .env.example 一致。

import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../.env.test") });

// 兜底：即使 .env.test 缺失，也用 dev 默认 key（≥32 字节硬约束）
process.env.JWT_SIGNING_KEY ??= "dev-key-32-bytes-minimum-length!";
process.env.JWT_ISSUER ??= "saas-identity-platform";
process.env.JWT_AUDIENCE ??= "saas-identity-platform-clients";
process.env.JWT_TTL_SECONDS ??= "3600";