// Cross-frontend seed data — re-exports JSON-loaded tables from src/seeds/.
// MSW handlers re-export from src/handlers-array.ts (orval-generated).
//
// v0.4.0: 9 tables live in src/seeds/*.json. This file is now a thin layer
// that exposes the mutable arrays (handlers write to them) + ID constants +
// lookup helpers. The actual data shape comes from the shared TypeSpec —
// see src/generated_ts_shim.ts for the runtime types.

import type {
  Tenant,
  User,
  Role,
  ApiKey,
  AuditEvent,
  TenantMembership,
  App,
  Menu,
  RoleMenuGrant,
} from "../generated_ts_shim";
import {
  tenants as _tenants,
  roles as _roles,
  users as _users,
  apiKeys as _apiKeys,
  apps as _apps,
  menus as _menus,
  roleMenuGrants as _roleMenuGrants,
  auditEvents as _auditEvents,
  auditRetentionPolicies as _auditRetentionPolicies,
  memberships as _memberships,
  TENANT_IDS as _TENANT_IDS,
  APP_IDS as _APP_IDS,
  MENU_IDS as _MENU_IDS,
  USER_IDS as _USER_IDS,
  ROLE_IDS as _ROLE_IDS,
} from "../seeds";

// JSON imports are readonly at type level. Cast to mutable so handlers
// can push/splice. Runtime array references are stable across imports.
export const tenants = _tenants as unknown as Tenant[];
export const roles = _roles as unknown as Role[];
export const users = _users as unknown as User[];
export const apiKeys = _apiKeys as unknown as ApiKey[];
export const apps = _apps as unknown as App[];
export const menus = _menus as unknown as Menu[];
export const roleMenuGrants = _roleMenuGrants as unknown as RoleMenuGrant[];
export const auditEvents = _auditEvents as unknown as AuditEvent[];
export const auditRetentionPolicies = _auditRetentionPolicies as unknown as Array<{
  tenantId: string;
  retentionDays: number;
  updatedAt: string;
}>;
export const memberships = _memberships as unknown as TenantMembership[];

// === Identity constants ===
export const TENANT_IDS = _TENANT_IDS;
export const APP_IDS = _APP_IDS;
export const MENU_IDS = _MENU_IDS;
export const USER_IDS = _USER_IDS;
export const ROLE_IDS = _ROLE_IDS;

// === Lookup helpers ===
export const getTenant = (id: string) => tenants.find((t) => t.id === id);
export const listTenants = () => tenants;

export const getUser = (tenantId: string, userId: string) =>
  users.find((u) => u.tenantId === tenantId && u.id === userId);
export const listUsers = (tenantId: string) =>
  users.filter((u) => u.tenantId === tenantId);

export const getRole = (tenantId: string, roleId: string) =>
  roles.find((r) => r.tenantId === tenantId && r.id === roleId);
export const listRoles = (tenantId: string) =>
  roles.filter((r) => r.tenantId === tenantId);

export const getApiKey = (tenantId: string, keyId: string) =>
  apiKeys.find((k) => k.tenantId === tenantId && k.id === keyId);
export const listApiKeys = (tenantId: string) =>
  apiKeys.filter((k) => k.tenantId === tenantId);

// URL `:appId` 既可能是内部 id（`lab-management`）也可能是 code（`lab-management`）。
// 两者都映射到同一个 App 记录（[src/seeds/apps.json](seeds/apps.json)）。
// ADR-0014 相关无关；saas 镜像早期未统一约定导致 seed 内 id 而 URL 用 code。
function resolveAppId(idOrCode: string): string {
  return apps.find((a) => a.id === idOrCode || a.code === idOrCode)?.id ?? idOrCode;
}

export { resolveAppId };

export const getApp = (idOrCode: string) =>
  apps.find((a) => a.id === idOrCode || a.code === idOrCode);
export const getAppByClientId = (clientId: string) =>
  apps.find((a) => a.clientId === clientId);
export const listApps = () => apps;

export const getMenu = (id: string) => menus.find((m) => m.id === id);
// `appId` 入参兼容内部 id 与 URL code；统一 resolve 到内部 id 再过滤
export const listMenus = (appId: string) =>
  menus.filter((m) => m.appId === resolveAppId(appId));

export const getRoleMenuGrant = (roleId: string) =>
  roleMenuGrants.find((g) => g.roleId === roleId);

export const listAuditEvents = (tenantId: string) =>
  auditEvents.filter((e) => e.tenantId === tenantId);

export default {
  tenants,
  users,
  roles,
  apiKeys,
  apps,
  menus,
  roleMenuGrants,
  auditEvents,
  memberships,
};