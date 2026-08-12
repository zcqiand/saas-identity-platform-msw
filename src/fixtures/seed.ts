// Cross-frontend seed data — deterministic across react/vue/nextjs.
// MSW handlers re-export from src/handlers-array.ts (orval-generated).

import type {
  Tenant,
  User,
  Role,
  ApiKey,
  AuditEvent,
  TenantMembership,
  OAuthApp,
} from "../generated_ts_shim";

// === Tenants (3 canonical demo tenants, all UUIDs fixed) ===
export const TENANT_IDS = {
  acme: "00000000-0000-0000-0000-000000000001",
  globex: "00000000-0000-0000-0000-000000000002",
  initech: "00000000-0000-0000-0000-000000000003",
} as const;

export const tenants: Tenant[] = [
  {
    id: TENANT_IDS.acme,
    code: "acme",
    name: "ACME Corp",
    status: "active",
    createdAt: "2026-01-15T08:00:00Z",
    updatedAt: "2026-08-12T10:00:00Z",
  },
  {
    id: TENANT_IDS.globex,
    code: "globex",
    name: "Globex Industries",
    status: "active",
    createdAt: "2026-02-20T09:00:00Z",
    updatedAt: "2026-08-10T14:00:00Z",
  },
  {
    id: TENANT_IDS.initech,
    code: "initech",
    name: "Initech",
    status: "suspended",
    createdAt: "2026-03-10T10:00:00Z",
    updatedAt: "2026-08-01T12:00:00Z",
  },
];

// === Roles (per tenant) ===
const roleFor = (tenantId: string, code: string, name: string): Role => ({
  id: `${tenantId}-role-${code}`,
  tenantId,
  code,
  name,
  permissionIds: code === "admin" ? ["users.read", "users.write", "roles.read", "roles.write"] : ["users.read"],
  createdAt: "2026-01-15T08:00:00Z",
  updatedAt: "2026-01-15T08:00:00Z",
});

export const roles: Role[] = [
  roleFor(TENANT_IDS.acme, "admin", "Administrator"),
  roleFor(TENANT_IDS.acme, "member", "Member"),
  roleFor(TENANT_IDS.globex, "admin", "Administrator"),
  roleFor(TENANT_IDS.initech, "admin", "Administrator"),
];

// === Users (per tenant) ===
const userFor = (
  tenantId: string,
  username: string,
  email: string,
  roleCode: string,
  status: "active" | "invited" | "suspended" | "disabled" = "active",
): User => ({
  id: `${tenantId}-user-${username}`,
  tenantId,
  username,
  email,
  status,
  roleIds: [`${tenantId}-role-${roleCode}`],
  createdAt: "2026-01-20T08:00:00Z",
  updatedAt: "2026-08-12T10:00:00Z",
});

export const users: User[] = [
  userFor(TENANT_IDS.acme, "alice", "alice@acme.io", "admin"),
  userFor(TENANT_IDS.acme, "bob", "bob@acme.io", "member"),
  userFor(TENANT_IDS.acme, "carol", "carol@acme.io", "member", "invited"),
  userFor(TENANT_IDS.globex, "dave", "dave@globex.io", "admin"),
  userFor(TENANT_IDS.initech, "eve", "eve@initech.io", "admin", "suspended"),
];

// === API Keys (per tenant) ===
export const apiKeys: ApiKey[] = [
  {
    id: `${TENANT_IDS.acme}-key-prod`,
    tenantId: TENANT_IDS.acme,
    name: "Production Key",
    prefix: "sk_live",
    status: "active",
    scopes: ["users.read", "users.write"],
    createdAt: "2026-04-01T08:00:00Z",
    expiresAt: "2027-04-01T08:00:00Z",
  },
  {
    id: `${TENANT_IDS.globex}-key-prod`,
    tenantId: TENANT_IDS.globex,
    name: "Production Key",
    prefix: "sk_live",
    status: "active",
    scopes: ["users.read"],
    createdAt: "2026-05-15T10:00:00Z",
  },
];

// === OAuth Apps (platform-level, not tenant-scoped) ===
export const oauthApps: OAuthApp[] = [
  {
    id: `${TENANT_IDS.acme}-app-demo`,
    clientId: "demo-client-id",
    name: "Demo Integration",
    redirectUris: ["http://localhost:3000/callback"],
    scopes: ["openid", "profile", "email"],
    grantTypes: ["authorization_code", "refresh_token"],
    isFirstParty: true,
    createdAt: "2026-06-01T08:00:00Z",
  },
];

// === Audit Events (per tenant) ===
export const auditEvents: AuditEvent[] = [
  {
    id: `${TENANT_IDS.acme}-evt-1`,
    tenantId: TENANT_IDS.acme,
    actorUserId: `${TENANT_IDS.acme}-user-alice`,
    action: "user_created",
    targetUserId: `${TENANT_IDS.acme}-user-bob`,
    occurredAt: "2026-08-10T10:00:00Z",
  },
  {
    id: `${TENANT_IDS.acme}-evt-2`,
    tenantId: TENANT_IDS.acme,
    actorUserId: `${TENANT_IDS.acme}-user-alice`,
    action: "login_success",
    occurredAt: "2026-08-12T08:30:00Z",
  },
  {
    id: `${TENANT_IDS.globex}-evt-1`,
    tenantId: TENANT_IDS.globex,
    actorUserId: `${TENANT_IDS.globex}-user-dave`,
    action: "api_key_created",
    occurredAt: "2026-08-11T14:20:00Z",
  },
];

// === Tenant Membership (User ↔ Tenant many-to-many) ===
export const memberships: TenantMembership[] = users.map((u, idx) => ({
  id: `${u.id}-mem-${idx}`,
  userId: u.id,
  tenantId: u.tenantId,
  roleIds: u.roleIds,
  status: u.status === "active" ? "active" : u.status === "invited" ? "invited" : "active",
  joinedAt: u.createdAt,
}));

// === Helpers used by handlers ===
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
export const listAuditEvents = (tenantId: string) =>
  auditEvents.filter((e) => e.tenantId === tenantId);

export default {
  tenants,
  users,
  roles,
  apiKeys,
  oauthApps,
  auditEvents,
  memberships,
};