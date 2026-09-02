// Wraps the orval-generated handlers array with a stable `handlers` export.
// orval emits `getTitleMock()` as a default factory — we wrap it for the
// conventional `handlers` symbol used by setupWorker(...handlers) and
// setupServer(...handlers).
//
// orval will write src/handlers.ts (axios client) AND src/handlers.msw.ts
// (mock handlers). After each codegen run, this file is regenerated and
// this wrapper re-imports getTitleMock. If orval renames the factory, update
// this wrapper.
import { getTitleMock } from "./handlers.msw.msw";
import {
  getAuthLoginMockHandler,
  getAuthLogoutMockHandler,
  getOAuthAuthorizeMockHandler,
  getOAuthTokenMockHandler,
  getMeGetMyMenusMockHandler,
} from "./handlers.msw.msw";
import { extraHandlers } from "./handlers-extra";

// 2026-08-27 (PLAN-2026-001 T-7)：过滤 orval 兜底的 OAuth + /auth/login +
// /auth/logout + /me/menus — 这些端点由 extra 接管 (ADR-0013 saas session
// 改造: cookie 检查 + user_id 从 session 取), orval faker 兜底会抢走并
// 破坏 dev 体验 (返 200 OK 而非 401 miss session)。
// 改用 handler 路径匹配过滤 (instance ref 在 orval 多次调用可能不一致)。
const OVERRIDDEN_PATHS = new Set<string>([
  "POST */api/v1/auth/login",
  "POST */api/v1/auth/logout",
  "POST */api/v1/oauth/authorize",
  "POST */api/v1/oauth/token",
  "GET */api/v1/me/menus",
  // 2026-08-30：orval 自动生成用 faker.date.past() 写随机 joinedAt，
  // 与契约测试要求 deterministic 不符（shared V016 写 2026-01-20）。
  // 切到 seed-based handler，参见 handlers-extra.ts meTenantsExtraHandlers。
  "GET */api/v1/me/tenants",
  "GET */api/v1/me",
  // 2026-08-30：orval 兜底 /apps/{code} 用 faker 随机 id，契约要求从 apps.json
  // 取真实 AppPublicInfo。切到 publicAppsExtraHandlers。
  // 路径字面量是 `:code`（orval 用冒号），不是 `{code}`（OpenAPI 用花括号）。
  "GET */api/v1/apps/:code",
  // 2026-08-31 contract-test 第三期：auth/refresh 与 me/tenants/switch 切到
  // 确定性 handler（rotate 存储 / membership 校验），faker 兜底是随机数据不能当 oracle。
  "POST */api/v1/auth/refresh",
  "POST */api/v1/me/tenants/:tenantId/switch",
  // 2026-08-31 contract-test I25：oidc/callback faker 兜底缺 code 也返 200，
  // 切到确定性 handler（错误分支 400 对齐 nextjs zod 契约面）。
  "POST */api/v1/auth/oidc/callback",
]);
function handlerKey(h: { method?: unknown; path?: unknown }): string {
  // MSW v2 handler.info.method/path 类型混合 (string | RegExp | HttpCustomPredicate);
  // 仅取 string|RegExp 的 source 部分作 key
  const m = h.method instanceof RegExp ? h.method.source : (typeof h.method === "string" ? h.method : "*");
  const p = h.path instanceof RegExp ? h.path.source : (typeof h.path === "string" ? h.path : "*");
  return `${m} ${p}`;
}
const orvalMockHandlers = getTitleMock().filter((h) => !OVERRIDDEN_PATHS.has(handlerKey(h.info)));
if (process.env.DEBUG_HANDLERS) {
  console.log("orval mocks total:", getTitleMock().length);
  console.log("filtered orval mocks:", orvalMockHandlers.length);
  console.log("extra handlers count:", extraHandlers.length);
}

// Custom M07/M08/M09 handlers (deterministic fixtures) take precedence over
// orval-generated faker handlers for those routes.
export const handlers = [...extraHandlers, ...orvalMockHandlers];
export default handlers;