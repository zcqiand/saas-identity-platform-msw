// Public API surface for @saas/identity-platform-msw
// Note: setupNodeMocks is NOT re-exported here — it pulls msw/node
// which fails to bundle in browser environments due to @mswjs/interceptors
// unresolved "./ClientRequest" subpath. Import directly from
// "@saas/identity-platform-msw/node" if you need it (test setup only).
// ADR-0012 + v0.3.0: Service Worker mode 完全删除（msw/browser 不再 re-export）；
// 浏览器侧 MSW 走 @mswjs/http-middleware 起的独立 HTTP server（src/server.ts）。
export { handlers } from "./handlers-array";
export {
  // 原始可写数组（handler 会 push/splice；saas-nextjs 路由也用这些做 server-side tree）
  apps,
  menus,
  roleMenuGrants,
  // helpers + identity constants
  default as fixtures,
  getTenant,
  listTenants,
  getUser,
  listUsers,
  getRole,
  listRoles,
  getApiKey,
  listApiKeys,
  listAuditEvents,
  getApp,
  listApps,
  getMenu,
  listMenus,
  getRoleMenuGrant,
  APP_IDS,
  MENU_IDS,
} from "./fixtures/seed";
