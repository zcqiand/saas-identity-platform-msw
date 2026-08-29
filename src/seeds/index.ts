// Seeds barrel — JSON-per-table format (v0.4.0).
// Pattern follows backup/saas-identity-platform-shared/seeds:
//   - src/seeds/{table}.json  (1 file per table)
//   - src/seeds/manifest.json (schema metadata)
//   - src/seeds/index.ts      (this barrel: named value + type exports)
//
// Mutability note: JSON `import X from "./x.json"` gives an immutable
// view, but we cast to mutable arrays in fixtures/seed.ts where handlers
// need to write. Type-level readonly is not enforced at runtime.

import _TENANTS from "./tenants.json" with { type: "json" };
import _ROLES from "./roles.json" with { type: "json" };
import _USERS from "./users.json" with { type: "json" };
import _API_KEYS from "./api-keys.json" with { type: "json" };
import _APPS from "./apps.json" with { type: "json" };
import _MENUS from "./menus.json" with { type: "json" };
import _ROLE_MENU_GRANTS from "./role-menu-grants.json" with { type: "json" };
import _AUDIT_EVENTS from "./audit-events.json" with { type: "json" };
import _MEMBERSHIPS from "./memberships.json" with { type: "json" };
import _PERMISSIONS from "./permissions.json" with { type: "json" };
import _ROLE_PERMISSIONS from "./role-permissions.json" with { type: "json" };
import _AUDIT_RETENTION_POLICIES from "./audit-retention-policies.json" with { type: "json" };

// === Identity constants (canonical UUIDs; readable from react/vue/nextjs) ===
export const TENANT_IDS = {
  acme: _TENANTS[0].id,
  globex: _TENANTS[1].id,
  initech: _TENANTS[2].id,
} as const;

export const APP_IDS = {
  lab: _APPS[0].id,
  erp: _APPS[1].id,
  crm: _APPS[2].id,
} as const;

// MENU_IDS 派生自 menus.json（避免硬编码漂移）
function toCamel(code: string): string {
  return code.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
export const MENU_IDS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(_MENUS.map((m) => [toCamel(m.code), m.id])),
);

// USER_IDS / ROLE_IDS 同样派生自 JSON。
// 2026-08-29 补：种子 ID 收敛到可读 UUID（shared V016）之前，handler 与测试里散着
// `${TENANT_IDS.acme}-role-admin` 这类拼串，收敛后全部失效。派生常量让「ID 长什么样」
// 只由 JSON 决定，调用方不再拼字符串 —— 下次改 ID 规范时这里零改动。
export const USER_IDS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(_USERS.map((u) => [u.username, u.id])),
);

const _TENANT_CODE_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(_TENANTS.map((t) => [t.id, t.code])),
);

/** key = `<租户 code><角色 code 首字母大写>`，如 `acmeAdmin` / `globexAdmin`。 */
export const ROLE_IDS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    _ROLES.map((r) => [
      `${_TENANT_CODE_BY_ID[r.tenantId]}${r.code.charAt(0).toUpperCase()}${r.code.slice(1)}`,
      r.id,
    ]),
  ),
);

// === Tables (named value exports for handlers/fixtures to read+write) ===
export const tenants = _TENANTS;
export const roles = _ROLES;
export const users = _USERS;
export const apiKeys = _API_KEYS;
export const apps = _APPS;
export const menus = _MENUS;
export const roleMenuGrants = _ROLE_MENU_GRANTS;
export const auditEvents = _AUDIT_EVENTS;
export const memberships = _MEMBERSHIPS;
export const permissions = _PERMISSIONS;
export const rolePermissions = _ROLE_PERMISSIONS;
export const auditRetentionPolicies = _AUDIT_RETENTION_POLICIES;

// === Type exports ===
export type Tenant = (typeof _TENANTS)[number];
export type Role = (typeof _ROLES)[number];
export type User = (typeof _USERS)[number];
export type ApiKey = (typeof _API_KEYS)[number];
export type App = (typeof _APPS)[number];
export type Menu = (typeof _MENUS)[number];
export type RoleMenuGrant = (typeof _ROLE_MENU_GRANTS)[number];
export type AuditEvent = (typeof _AUDIT_EVENTS)[number];
export type TenantMembership = (typeof _MEMBERSHIPS)[number];
export type Permission = (typeof _PERMISSIONS)[number];
export type RolePermission = (typeof _ROLE_PERMISSIONS)[number];
export type AuditRetentionPolicy = (typeof _AUDIT_RETENTION_POLICIES)[number];

export default {
  tenants,
  roles,
  users,
  apiKeys,
  apps,
  menus,
  roleMenuGrants,
  auditEvents,
  memberships,
  permissions,
  rolePermissions,
  auditRetentionPolicies,
} as const;