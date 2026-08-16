// Custom MSW handlers for M00 / M01 / M02 / M03 / M05 / M07 / M08 / M09 —
// backed by deterministic seed fixtures so CRUD persists in-memory.
// orval-generated handlers use faker data which would defeat cross-frontend
// test stability, so we intercept these endpoints before the orval handlers.
import { http, HttpResponse } from "msw";
import {
  apps,
  menus,
  roleMenuGrants,
  tenants,
  users,
  roles,
  apiKeys,
  auditEvents,
  TENANT_IDS,
  APP_IDS,
  getApp,
  getMenu,
  getTenant,
  getUser,
  getRole,
  getApiKey,
  listMenus,
  listUsers,
  listRoles,
  listApiKeys,
  listAuditEvents,
  getRoleMenuGrant,
} from "./fixtures/seed";

const BASE = "/api/v1";
const NOW = () => new Date().toISOString();

// Demo 密码：所有 seed user 共享 demo123，方便前端 demo 登录。
// 真后端（aspnetcore/springboot）实现各自的密码校验。
const DEMO_PASSWORD = "demo123";

function uuidLike(prefix: string): string {
  // 生成看起来像 uuid 的字符串（用 Date.now + 随机，避免碰撞）
  const ts = Date.now().toString(16).padStart(12, "0");
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `00000000-0000-0000-0000-${ts.slice(-8)}${rand}`;
}

// === M07 — Apps ===
export const appsExtraHandlers = [
  http.get(`${BASE}/admin/apps`, () =>
    HttpResponse.json({
      items: apps,
      page: 1,
      pageSize: apps.length,
      total: apps.length,
    }),
  ),

  http.get(`${BASE}/admin/apps/:appId`, ({ params }) => {
    const a = getApp(String(params.appId));
    return a
      ? HttpResponse.json(a)
      : HttpResponse.json({ code: "NOT_FOUND", message: "App not found" }, { status: 404 });
  }),

  http.post(`${BASE}/admin/apps`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newApp = {
      id: `app-${Date.now().toString(36)}`,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      description: body.description as string | undefined,
      icon: body.icon as string | undefined,
      sortOrder: Number(body.sortOrder ?? 0),
      status: (body.status as "active" | "disabled") ?? "active",
      clientId: String(body.clientId ?? `app-${Date.now().toString(36)}`),
      clientSecret: body.clientSecret as string | undefined,
      redirectUris: (body.redirectUris as string[]) ?? [],
      scopes: (body.scopes as string[]) ?? [],
      grantTypes: (body.grantTypes as Array<"authorization_code" | "refresh_token" | "client_credentials" | "password">) ?? [],
      isFirstParty: Boolean(body.isFirstParty ?? false),
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    apps.push(newApp);
    return HttpResponse.json(newApp, { status: 201 });
  }),

  http.patch(`${BASE}/admin/apps/:appId`, async ({ params, request }) => {
    const a = getApp(String(params.appId));
    if (!a) return HttpResponse.json({ code: "NOT_FOUND", message: "App not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(a, body, { updatedAt: NOW() });
    return HttpResponse.json(a);
  }),

  http.delete(`${BASE}/admin/apps/:appId`, ({ params }) => {
    const i = apps.findIndex((a) => a.id === params.appId);
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "App not found" }, { status: 404 });
    apps.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch(`${BASE}/admin/apps/:appId/status`, async ({ params, request }) => {
    const a = getApp(String(params.appId));
    if (!a) return HttpResponse.json({ code: "NOT_FOUND", message: "App not found" }, { status: 404 });
    const body = (await request.json()) as { status: "active" | "disabled" };
    a.status = body.status;
    a.updatedAt = NOW();
    return HttpResponse.json(a);
  }),
];

// === M08 — Menus ===
export const menusExtraHandlers = [
  http.get(`${BASE}/admin/apps/:appId/menus`, ({ params }) =>
    HttpResponse.json(listMenus(String(params.appId))),
  ),

  http.get(`${BASE}/admin/apps/:appId/menus/:menuId`, ({ params }) => {
    const m = getMenu(String(params.menuId));
    if (!m || m.appId !== params.appId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    return HttpResponse.json(m);
  }),

  http.post(`${BASE}/admin/apps/:appId/menus`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newMenu = {
      id: `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`,
      appId: String(params.appId),
      parentId: body.parentId as string | undefined,
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      path: body.path as string | undefined,
      icon: body.icon as string | undefined,
      type: (body.type as "group" | "page" | "action") ?? "page",
      sortOrder: Number(body.sortOrder ?? 0),
      status: (body.status as "active" | "disabled") ?? "active",
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    menus.push(newMenu);
    return HttpResponse.json(newMenu, { status: 201 });
  }),

  http.patch(`${BASE}/admin/apps/:appId/menus/:menuId`, async ({ params, request }) => {
    const m = getMenu(String(params.menuId));
    if (!m || m.appId !== params.appId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(m, body, { updatedAt: NOW() });
    return HttpResponse.json(m);
  }),

  http.delete(`${BASE}/admin/apps/:appId/menus/:menuId`, ({ params }) => {
    const i = menus.findIndex((m) => m.id === params.menuId && m.appId === params.appId);
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    menus.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${BASE}/admin/apps/:appId/menus/:menuId/reorder`, async ({ params, request }) => {
    const m = getMenu(String(params.menuId));
    if (!m || m.appId !== params.appId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    const body = (await request.json()) as { orderedMenuIds: string[] };
    body.orderedMenuIds.forEach((mid, idx) => {
      const target = menus.find((x) => x.id === mid);
      if (target) target.sortOrder = idx;
    });
    return HttpResponse.json(listMenus(String(params.appId)));
  }),

  http.patch(`${BASE}/admin/apps/:appId/menus/:menuId/parent`, async ({ params, request }) => {
    const m = getMenu(String(params.menuId));
    if (!m || m.appId !== params.appId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    const body = (await request.json()) as { parentId?: string };
    m.parentId = body.parentId;
    m.updatedAt = NOW();
    return HttpResponse.json(m);
  }),
];

// === M09 — Role ↔ Menu grants ===
export const roleMenuExtraHandlers = [
  http.get(`${BASE}/tenants/:tenantId/roles/:roleId/menus`, ({ params }) => {
    const grant = getRoleMenuGrant(String(params.roleId));
    return HttpResponse.json(
      grant ?? { roleId: String(params.roleId), menuIds: [], updatedAt: NOW() },
    );
  }),

  http.put(`${BASE}/tenants/:tenantId/roles/:roleId/menus`, async ({ params, request }) => {
    const body = (await request.json()) as { menuIds: string[] };
    const existing = roleMenuGrants.findIndex((g) => g.roleId === params.roleId);
    const grant = { roleId: String(params.roleId), menuIds: body.menuIds, updatedAt: NOW() };
    if (existing >= 0) roleMenuGrants[existing] = grant;
    else roleMenuGrants.push(grant);
    return HttpResponse.json(grant);
  }),

  http.delete(`${BASE}/tenants/:tenantId/roles/:roleId/menus`, ({ params }) => {
    const i = roleMenuGrants.findIndex((g) => g.roleId === params.roleId);
    if (i >= 0) roleMenuGrants.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

// === M09.F03 — Me / my menus (effective tree) ===
// 当前实现：直接返回 acme admin 视角的菜单树（演示用）。
// 真实实现应基于 currentUser + memberships，但 msw 不持有 session，
// 故此处固定返回 acme admin 可见的所有 active 菜单。
export const meExtraHandlers = [
  http.get(`${BASE}/me/menus`, () => {
    const acmeAdminGrant = roleMenuGrants.find(
      (g) => g.roleId === "00000000-0000-0000-0000-000000000001-role-admin",
    );
    const allowed = new Set(acmeAdminGrant?.menuIds ?? []);
    const tree = (parentId: string | undefined, appId: string): Array<Record<string, unknown>> =>
      menus
        .filter((m) => m.appId === appId && m.parentId === parentId && m.status === "active")
        .filter((m) => allowed.has(m.id) || !parentId) // group 节点若不在 grant 中也保留作容器
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => ({ ...m, children: tree(m.id, m.appId) }));

    // 按 app 分组
    const result: Record<string, Array<Record<string, unknown>>> = {};
    for (const a of apps) {
      if (a.status !== "active") continue;
      result[a.code] = tree(undefined, a.id);
    }
    return HttpResponse.json(result);
  }),
];

// === M03 — Auth (deterministic against users fixture + fixed password) ===
export const authExtraHandlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !password) {
      return HttpResponse.json(
        { code: "BAD_REQUEST", message: "username and password are required" },
        { status: 400 },
      );
    }
    if (password !== DEMO_PASSWORD) {
      return HttpResponse.json(
        { code: "INVALID_CREDENTIALS", message: "Invalid username or password" },
        { status: 401 },
      );
    }
    const user = users.find((u) => u.username === username);
    if (!user) {
      return HttpResponse.json(
        { code: "INVALID_CREDENTIALS", message: "Invalid username or password" },
        { status: 401 },
      );
    }
    auditEvents.push({
      id: `${user.tenantId}-evt-${Date.now().toString(36)}`,
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "login_success",
      occurredAt: NOW(),
    });
    return HttpResponse.json({
      accessToken: `mock-jwt-${user.id}`,
      refreshToken: `mock-refresh-${user.id}`,
      tokenType: "Bearer",
      expiresIn: 3600,
      userId: user.id,
      currentTenantId: user.tenantId,
    });
  }),

  http.post(`${BASE}/auth/logout`, () => {
    // best-effort：不写 audit（AuditAction 枚举里没有 logout）
    return new HttpResponse(null, { status: 204 });
  }),

  // GET /me：给前端一个还原 user 信息的接口（刷新页面后 bootstrap）
  http.get(`${BASE}/me`, ({ request }) => {
    const auth = request.headers.get("Authorization") ?? "";
    const userId = auth.replace("Bearer mock-jwt-", "");
    const user = userId ? users.find((u) => u.id === userId) : undefined;
    if (!user) {
      return HttpResponse.json(
        { code: "UNAUTHENTICATED", message: "Missing or invalid token" },
        { status: 401 },
      );
    }
    return HttpResponse.json(user);
  }),
];

// === M00 — Tenants (平台 admin CRUD) ===
export const tenantsExtraHandlers = [
  http.get(`${BASE}/admin/tenants`, () =>
    HttpResponse.json({
      items: tenants,
      page: 1,
      pageSize: tenants.length,
      total: tenants.length,
    }),
  ),

  http.get(`${BASE}/admin/tenants/:id`, ({ params }) => {
    const t = getTenant(String(params.id));
    return t
      ? HttpResponse.json(t)
      : HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
  }),

  http.post(`${BASE}/admin/tenants`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newTenant = {
      id: uuidLike("tenant"),
      code: String(body.code ?? "").trim(),
      name: String(body.name ?? "").trim(),
      status: (body.status as "active" | "suspended" | "archived") ?? "active",
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    if (!newTenant.code || !newTenant.name) {
      return HttpResponse.json(
        { code: "BAD_REQUEST", message: "code and name are required" },
        { status: 400 },
      );
    }
    tenants.push(newTenant);
    return HttpResponse.json(newTenant, { status: 201 });
  }),

  http.patch(`${BASE}/admin/tenants/:id`, async ({ params, request }) => {
    const t = getTenant(String(params.id));
    if (!t) return HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(t, body, { updatedAt: NOW() });
    return HttpResponse.json(t);
  }),

  http.delete(`${BASE}/admin/tenants/:id`, ({ params }) => {
    const i = tenants.findIndex((t) => t.id === params.id);
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
    tenants.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

// === M01 — Users (tenant-scoped CRUD) ===
export const usersExtraHandlers = [
  http.get(`${BASE}/tenants/:tenantId/users`, ({ params }) => {
    return HttpResponse.json({
      items: listUsers(String(params.tenantId)),
      page: 1,
      pageSize: users.length,
      total: users.length,
    });
  }),

  http.get(`${BASE}/tenants/:tenantId/users/:userId`, ({ params }) => {
    const u = getUser(String(params.tenantId), String(params.userId));
    return u
      ? HttpResponse.json(u)
      : HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
  }),

  http.post(`${BASE}/tenants/:tenantId/users`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const username = String(body.username ?? "").trim();
    const email = String(body.email ?? "").trim();
    if (!username || !email) {
      return HttpResponse.json(
        { code: "BAD_REQUEST", message: "username and email are required" },
        { status: 400 },
      );
    }
    const newUser = {
      id: uuidLike("user"),
      tenantId: String(params.tenantId),
      username,
      email,
      status: (body.status as "active" | "invited" | "suspended" | "disabled") ?? "invited",
      roleIds: (body.roleIds as string[]) ?? [],
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    users.push(newUser);
    auditEvents.push({
      id: `${newUser.tenantId}-evt-${Date.now().toString(36)}`,
      tenantId: newUser.tenantId,
      actorUserId: undefined,
      action: "user_created",
      targetUserId: newUser.id,
      occurredAt: NOW(),
    });
    return HttpResponse.json(newUser, { status: 201 });
  }),

  http.patch(`${BASE}/tenants/:tenantId/users/:userId`, async ({ params, request }) => {
    const u = getUser(String(params.tenantId), String(params.userId));
    if (!u) return HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(u, body, { updatedAt: NOW() });
    return HttpResponse.json(u);
  }),

  http.delete(`${BASE}/tenants/:tenantId/users/:userId`, ({ params }) => {
    const i = users.findIndex((u) => u.tenantId === params.tenantId && u.id === params.userId);
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
    users.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${BASE}/tenants/:tenantId/users/:userId/roles`, async ({ params, request }) => {
    const u = getUser(String(params.tenantId), String(params.userId));
    if (!u) return HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
    const body = (await request.json()) as { roleIds: string[] };
    u.roleIds = body.roleIds;
    u.updatedAt = NOW();
    return HttpResponse.json(u);
  }),

  http.patch(`${BASE}/tenants/:tenantId/users/:userId/status`, async ({ params, request }) => {
    const u = getUser(String(params.tenantId), String(params.userId));
    if (!u) return HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
    const body = (await request.json()) as { status: "active" | "invited" | "suspended" | "disabled" };
    u.status = body.status;
    u.updatedAt = NOW();
    return HttpResponse.json(u);
  }),
];

// === M02 — Roles (tenant-scoped CRUD) ===
export const rolesExtraHandlers = [
  http.get(`${BASE}/tenants/:tenantId/roles`, ({ params }) =>
    HttpResponse.json({
      items: listRoles(String(params.tenantId)),
      page: 1,
      pageSize: roles.length,
      total: roles.length,
    }),
  ),

  http.get(`${BASE}/tenants/:tenantId/roles/:roleId`, ({ params }) => {
    const r = getRole(String(params.tenantId), String(params.roleId));
    return r
      ? HttpResponse.json(r)
      : HttpResponse.json({ code: "NOT_FOUND", message: "Role not found" }, { status: 404 });
  }),

  http.post(`${BASE}/tenants/:tenantId/roles`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const code = String(body.code ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!code || !name) {
      return HttpResponse.json(
        { code: "BAD_REQUEST", message: "code and name are required" },
        { status: 400 },
      );
    }
    const newRole = {
      id: uuidLike("role"),
      tenantId: String(params.tenantId),
      code,
      name,
      permissionIds: (body.permissionIds as string[]) ?? [],
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    roles.push(newRole);
    return HttpResponse.json(newRole, { status: 201 });
  }),

  http.patch(`${BASE}/tenants/:tenantId/roles/:roleId`, async ({ params, request }) => {
    const r = getRole(String(params.tenantId), String(params.roleId));
    if (!r) return HttpResponse.json({ code: "NOT_FOUND", message: "Role not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(r, body, { updatedAt: NOW() });
    return HttpResponse.json(r);
  }),

  http.delete(`${BASE}/tenants/:tenantId/roles/:roleId`, ({ params }) => {
    const i = roles.findIndex(
      (r) => r.tenantId === params.tenantId && r.id === params.roleId,
    );
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "Role not found" }, { status: 404 });
    roles.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

// === M05 — API Keys (tenant-scoped) ===
export const apiKeysExtraHandlers = [
  http.get(`${BASE}/tenants/:tenantId/api-keys`, ({ params }) =>
    HttpResponse.json({
      items: listApiKeys(String(params.tenantId)),
      page: 1,
      pageSize: apiKeys.length,
      total: apiKeys.length,
    }),
  ),

  http.post(`${BASE}/tenants/:tenantId/api-keys`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) {
      return HttpResponse.json(
        { code: "BAD_REQUEST", message: "name is required" },
        { status: 400 },
      );
    }
    const id = uuidLike("key");
    const newKey = {
      id,
      tenantId: String(params.tenantId),
      name,
      prefix: "sk_live",
      status: "active" as const,
      scopes: (body.scopes as string[]) ?? [],
      createdAt: NOW(),
    };
    apiKeys.push(newKey);
    // 真实后端会返回一次性 secret；mock 也返回一份方便前端显示
    return HttpResponse.json({ ...newKey, secret: `secret-${id}` }, { status: 201 });
  }),

  http.post(`${BASE}/tenants/:tenantId/api-keys/:keyId/revoke`, ({ params }) => {
    const k = getApiKey(String(params.tenantId), String(params.keyId));
    if (!k) return HttpResponse.json({ code: "NOT_FOUND", message: "API Key not found" }, { status: 404 });
    k.status = "revoked";
    return HttpResponse.json(k);
  }),

  http.post(`${BASE}/tenants/:tenantId/api-keys/:keyId/rotate`, ({ params }) => {
    const k = getApiKey(String(params.tenantId), String(params.keyId));
    if (!k) return HttpResponse.json({ code: "NOT_FOUND", message: "API Key not found" }, { status: 404 });
    const id = uuidLike("key");
    const rotated = {
      ...k,
      id,
      status: "active" as const,
      createdAt: NOW(),
    };
    apiKeys.push(rotated);
    k.status = "revoked";
    return HttpResponse.json({ ...rotated, secret: `secret-${id}` });
  }),
];

// === M06 — Audit (read-only, list by tenant) ===
export const auditExtraHandlers = [
  http.get(`${BASE}/tenants/:tenantId/audit-events`, ({ params }) =>
    HttpResponse.json({
      items: listAuditEvents(String(params.tenantId)),
      page: 1,
      pageSize: auditEvents.length,
      total: auditEvents.length,
    }),
  ),
];

// === M04.F01 公共读侧 - App 目录（免鉴权） ===
// 供接入方（lab 各前端）按 appCode 取应用展示信息；
// 只返回展示字段（AppPublicInfo），不暴露 OAuth 集成字段。
export const publicAppsExtraHandlers = [
  http.get(`${BASE}/apps/:code`, ({ params }) => {
    const a = apps.find((x) => x.code === String(params.code));
    if (!a || a.status !== "active") {
      return HttpResponse.json(
        { code: "NOT_FOUND", message: "App not found" },
        { status: 404 },
      );
    }
    const { id, code, name, description, icon, status } = a;
    return HttpResponse.json({ id, code, name, description, icon, status });
  }),
];

export const extraHandlers = [
  ...authExtraHandlers,
  ...tenantsExtraHandlers,
  ...usersExtraHandlers,
  ...rolesExtraHandlers,
  ...apiKeysExtraHandlers,
  ...auditExtraHandlers,
  ...appsExtraHandlers,
  ...publicAppsExtraHandlers,
  ...menusExtraHandlers,
  ...roleMenuExtraHandlers,
  ...meExtraHandlers,
];