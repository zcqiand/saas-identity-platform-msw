// Public API surface for @saas/identity-platform-msw
// Note: setupNodeMocks is NOT re-exported here — it pulls msw/node
// which fails to bundle in browser environments due to @mswjs/interceptors
// unresolved "./ClientRequest" subpath. Import directly from
// "@saas/identity-platform-msw/node" if you need it (test setup only).
export { handlers } from "./handlers-array";
export {
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
} from "./fixtures/seed";
export { setupBrowserMocks } from "./browser";
