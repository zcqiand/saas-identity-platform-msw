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
  resolveAppId,
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

// Demo 密码：所有 seed user 共享同一密码，方便前端 demo 登录。
// 与 lab-management-system-msw 的 DEMO_PASSWORD 对齐（统一 "dev123456"），
// 让跨仓（lab-react + saas-react 切换 backend）登录体验一致。
const DEMO_PASSWORD = "dev123456";

// OAuth 2.0 server 内存映射（authExtraHandlers 数组内 handler 用）。
// 放在数组外：数组字面量不能含 const 声明。
const oauthCodes = new Map<
  string,
  { appId: string; userId: string; tenantId: string; scope: string; redirectUri: string }
>();
const oauthRefreshTokens = new Map<
  string,
  { appId: string; userId: string; tenantId: string; scope: string }
>();

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
    const i = apps.findIndex((a) => a.id === resolveAppId(String(params.appId)));
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
    const resolvedAppId = resolveAppId(String(params.appId));
    if (!m || m.appId !== resolvedAppId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    return HttpResponse.json(m);
  }),

  http.post(`${BASE}/admin/apps/:appId/menus`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newMenu = {
      id: `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`,
      appId: resolveAppId(String(params.appId)),
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
    const resolvedAppId = resolveAppId(String(params.appId));
    if (!m || m.appId !== resolvedAppId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(m, body, { updatedAt: NOW() });
    return HttpResponse.json(m);
  }),

  http.delete(`${BASE}/admin/apps/:appId/menus/:menuId`, ({ params }) => {
    const resolvedAppId = resolveAppId(String(params.appId));
    const i = menus.findIndex((m) => m.id === params.menuId && m.appId === resolvedAppId);
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    menus.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`${BASE}/admin/apps/:appId/menus/:menuId/reorder`, async ({ params, request }) => {
    const m = getMenu(String(params.menuId));
    const resolvedAppId = resolveAppId(String(params.appId));
    if (!m || m.appId !== resolvedAppId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    const body = (await request.json()) as { orderedMenuIds: string[] };
    body.orderedMenuIds.forEach((mid, idx) => {
      const target = menus.find((x) => x.id === mid);
      if (target) target.sortOrder = idx;
    });
    return HttpResponse.json(listMenus(resolvedAppId));
  }),

  http.patch(`${BASE}/admin/apps/:appId/menus/:menuId/parent`, async ({ params, request }) => {
    const m = getMenu(String(params.menuId));
    const resolvedAppId = resolveAppId(String(params.appId));
    if (!m || m.appId !== resolvedAppId)
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

  // === OAuth 2.0 server 端点（POST 与 saas-shared OpenAPI 一致）===
  // authorize/token 都按 clientId 找 App 记录，校验 redirect_uri / scope / tenantId；
  // code 一次性、refresh_token 用于换新对。
  // dev 阶段不严验 client_secret（生产 saas springboot/aspnetcore 真后端验）。

  http.post(`*${BASE}/oauth/authorize`, async ({ request }) => {
    const body = (await request.json()) as {
      clientId?: string;
      redirectUri?: string;
      responseType?: string;
      scope?: string;
      state?: string;
      tenantId?: string;
    };
    if (
      !body.clientId ||
      !body.redirectUri ||
      !body.responseType ||
      !body.scope ||
      !body.state ||
      !body.tenantId
    ) {
      return HttpResponse.json(
        {
          code: "INVALID_REQUEST",
          message: "OAuth 2.0 authorize: 缺必填字段（clientId/redirectUri/responseType/scope/state/tenantId）",
        },
        { status: 400 },
      );
    }
    if (body.responseType !== "code") {
      return HttpResponse.json(
        { code: "UNSUPPORTED_RESPONSE_TYPE", message: "仅支持 responseType=code" },
        { status: 400 },
      );
    }
    const app = apps.find((a) => a.clientId === body.clientId);
    if (!app) {
      return HttpResponse.json(
        { code: "INVALID_CLIENT", message: "clientId 未注册或不可用" },
        { status: 400 },
      );
    }
    if (!app.redirectUris.includes(body.redirectUri)) {
      return HttpResponse.json(
        { code: "INVALID_REDIRECT_URI", message: "redirectUri 不在该 client 的白名单" },
        { status: 400 },
      );
    }
    // dev mock：tenant 范围不在 App 上建模（saas-shared App 模型只到 redirectUris/scopes/grantTypes），
    // 用「该 tenant 下是否有用户」隐式校验 tenant 有效性。生产 saas 会在 App 上加 tenants 字段显式建模。
    // dev mock：用 clientId 直接绑定到第一个匹配用户（生产 saas 走真实用户登录流程）
    const devUser = users.find((u) => u.tenantId === body.tenantId);
    if (!devUser) {
      return HttpResponse.json(
        { code: "NO_USER", message: "dev mock: 该 tenant 下找不到用户" },
        { status: 400 },
      );
    }
    // 生成一次性 code 存映射
    const code = `saas-code-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    oauthCodes.set(code, {
      appId: app.id,
      userId: devUser.id,
      tenantId: body.tenantId,
      scope: body.scope,
      redirectUri: body.redirectUri,
    });
    return HttpResponse.json({ code, state: body.state });
  }),

  http.post(`*${BASE}/oauth/token`, async ({ request }) => {
    const body = (await request.json()) as {
      grantType?: string;
      code?: string;
      refreshToken?: string;
      clientId?: string;
      clientSecret?: string;
      tenantId?: string;
      redirectUri?: string;
    };
    if (!body.grantType || !body.clientId || !body.tenantId) {
      return HttpResponse.json(
        {
          code: "INVALID_REQUEST",
          message: "OAuth 2.0 token: 缺必填字段（grantType/clientId/tenantId）",
        },
        { status: 400 },
      );
    }
    const app = apps.find((a) => a.clientId === body.clientId);
    if (!app) {
      return HttpResponse.json(
        { code: "INVALID_CLIENT", message: "clientId 未注册或不可用" },
        { status: 400 },
      );
    }

    if (body.grantType === "authorization_code") {
      if (!body.code || !body.redirectUri) {
        return HttpResponse.json(
          { code: "INVALID_REQUEST", message: "authorization_code: 缺 code 或 redirectUri" },
          { status: 400 },
        );
      }
      const entry = oauthCodes.get(body.code);
      if (!entry) {
        return HttpResponse.json(
          { code: "INVALID_GRANT", message: "code 不存在或已被使用" },
          { status: 400 },
        );
      }
      if (entry.redirectUri !== body.redirectUri) {
        return HttpResponse.json(
          { code: "INVALID_GRANT", message: "redirectUri 与 authorize 时不一致" },
          { status: 400 },
        );
      }
      if (entry.tenantId !== body.tenantId) {
        return HttpResponse.json(
          { code: "INVALID_GRANT", message: "tenantId 与 authorize 时不一致" },
          { status: 400 },
        );
      }
      // dev mock：暂不严验 clientSecret（生产真后端验）
      // code 一次性：取出后立即删除（防重放）
      oauthCodes.delete(body.code);
      // 签 accessToken + refreshToken（用 crypto 随机避免毫秒级重复）
      const nonce = Math.random().toString(36).slice(2);
      const accessToken = `saas-jwt-${entry.userId}-${nonce}`;
      const refreshToken = `saas-rt-${entry.userId}-${nonce}-${Math.random().toString(36).slice(2)}`;
      oauthRefreshTokens.set(refreshToken, {
        appId: entry.appId,
        userId: entry.userId,
        tenantId: entry.tenantId,
        scope: entry.scope,
      });
      return HttpResponse.json({
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: 3600,
        scope: entry.scope,
      });
    }

    if (body.grantType === "refresh_token") {
      if (!body.refreshToken) {
        return HttpResponse.json(
          { code: "INVALID_REQUEST", message: "refresh_token: 缺 refreshToken" },
          { status: 400 },
        );
      }
      const entry = oauthRefreshTokens.get(body.refreshToken);
      if (!entry) {
        return HttpResponse.json(
          { code: "INVALID_GRANT", message: "refreshToken 不存在或已被使用" },
          { status: 400 },
        );
      }
      // 旧 refreshToken 立即失效（防重放）
      oauthRefreshTokens.delete(body.refreshToken);
      const nonce = Math.random().toString(36).slice(2);
      const accessToken = `saas-jwt-${entry.userId}-${nonce}`;
      const newRefresh = `saas-rt-${entry.userId}-${nonce}-${Math.random().toString(36).slice(2)}`;
      oauthRefreshTokens.set(newRefresh, entry);
      return HttpResponse.json({
        accessToken,
        refreshToken: newRefresh,
        tokenType: "Bearer",
        expiresIn: 3600,
        scope: entry.scope,
      });
    }

    return HttpResponse.json(
      {
        code: "UNSUPPORTED_GRANT_TYPE",
        message: "仅支持 grantType=authorization_code | refresh_token",
      },
      { status: 400 },
    );
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