// Custom MSW handlers for M00 / M01 / M02 / M03 / M04 / M07 / M08 / M09 —
// backed by deterministic seed fixtures so CRUD persists in-memory.
// orval-generated handlers use faker data which would defeat cross-frontend
// test stability, so we intercept these endpoints before the orval handlers.
// 2026-09-08 shared 契约重命名：apps→clients、users→members（handler 逻辑保留
// 原 fixture 形状，path 对齐 tsp）；M05 api-keys / M06 audit 域已废弃删除，
// M02 permissions op 已废弃（由 role-menus 取代）。
import { http, HttpResponse } from "msw";
import { jwtVerify } from "jose";
import { getAudience, getIssuer, getSigningKey, signAccessToken } from "./lib/jwt-signer";
import type { App, TenantStatus } from "./generated_ts_shim";
import {
  apps,
  menus,
  roleMenuGrants,
  tenants,
  users,
  roles,
  memberships,
  TENANT_IDS,
  APP_IDS,
  ROLE_IDS,
  USER_IDS,
  resolveAppId,
  getApp,
  getMenu,
  getTenant,
  getUser,
  getRole,
  listMenus,
  listUsers,
  listRoles,
  getRoleMenuGrant,
} from "./fixtures/seed";

const BASE = "/api/v1";
const NOW = () => new Date().toISOString();

// M03.F01.I01 + M04.F03 / M09.F03 (PLAN-2026-001 T-7) — saas session 存储。
// key = 随机 sid; value = {userId, tenantId, expiresAt}。进程内 Map dev mock。
const SAAS_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
interface SaasSessionRecord {
  userId: string;
  tenantId: string;
  expiresAt: number;
}
const saasSessions = new Map<string, SaasSessionRecord>();
/** 测试专用：直接读 / 清空 saas session 存储。msw node 不暴露 Set-Cookie 给 fetch API。 */
export const saasSessionsForTest = saasSessions;

function generateSid(): string {
  // 32B base64url — 与真后端 SaasSessionStore.GenerateId 同格式
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** 从请求 Cookie 头解析 saasSession=<sid>。未找到 / 过期返 null。 */
function parseSessionFromCookie(request: Request): SaasSessionRecord | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)saasSession=([^;]+)/.exec(cookieHeader);
  if (!m) return null;
  const sid = decodeURIComponent(m[1]!);
  const rec = saasSessions.get(sid);
  if (!rec) return null;
  if (rec.expiresAt < Date.now()) {
    saasSessions.delete(sid);
    return null;
  }
  return rec;
}

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

// M03.F02.I04 — /auth/refresh 的 rotate 存储（2026-08-31 contract-test 第三期）。
// login 签发的 refreshToken 入此 Map；refresh 一次性消费（rotate 删旧签新），
// 与 nextjs oauthStore.rotateRefresh / springboot AuthService.refresh 同语义。
const saasRefreshTokens = new Map<
  string,
  { userId: string; tenantId: string; scope: string }
>();
/** 测试专用：读 / 清 /auth/refresh 的 token 存储。 */
export const saasRefreshTokensForTest = saasRefreshTokens;

function uuidLike(prefix: string): string {
  // 生成看起来像 uuid 的字符串（用 Date.now + 随机，避免碰撞）
  const ts = Date.now().toString(16).padStart(12, "0");
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
  return `00000000-0000-0000-0000-${ts.slice(-8)}${rand}`;
}

// === M07 — Clients (2026-09-08 shared 重命名 apps→clients) ===
export const appsExtraHandlers = [
  // 2026-09-01 contract-test I44：分页对齐家族约定（page 0-indexed / pageSize 默认 20，
  // 之前返 page:1 + pageSize:items.length 与 3 真后端分叉）
  http.get(`*${BASE}/admin/clients`, ({ request }) => {
    const url = new URL(request.url);
    const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
    const items = apps.slice(page * pageSize, page * pageSize + pageSize);
    return HttpResponse.json({
      items,
      page,
      pageSize,
      total: apps.length,
    });
  }),

  http.get(`*${BASE}/admin/clients/:clientId`, ({ params }) => {
    const a = getApp(String(params.clientId));
    return a
      ? HttpResponse.json(a)
      : HttpResponse.json({ code: "NOT_FOUND", message: "App not found" }, { status: 404 });
  }),

  http.post(`*${BASE}/admin/clients`, async ({ request }) => {
    // 2026-09-10 contract-test I45：缺必填字段 → 4xx，对齐 OAuthClient SSOT 契约面
    // （CreateOAuthClientRequest 必填: clientId / clientName / clientSecret / grantTypes / redirectUris）。
    // 9/7 pivot 后 admin/clients 返回 OAuthClient（不是老 App shape）。
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (
      !body ||
      !body.clientId ||
      !body.clientName ||
      !body.clientSecret ||
      !body.grantTypes ||
      !body.redirectUris
    ) {
      return HttpResponse.json(
        {
          code: "INVALID_REQUEST",
          message: "POST /admin/clients: 缺必填字段（clientId/clientName/clientSecret/grantTypes/redirectUris）",
        },
        { status: 400 },
      );
    }
    const newApp = {
      id: `app-${Date.now().toString(36)}`,
      clientId: String(body.clientId),
      clientName: String(body.clientName),
      grantTypes: String(body.grantTypes),
      redirectUris: String(body.redirectUris),
      scopes: body.scopes == null ? null : String(body.scopes),
      accessTokenValidity: Number(body.accessTokenValidity ?? 3600),
      refreshTokenValidity: Number(body.refreshTokenValidity ?? 86400),
      autoApprove: Boolean(body.autoApprove ?? false),
      status: 1,
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    apps.push(newApp as unknown as App);
    return HttpResponse.json(newApp, { status: 201 });
  }),

  http.patch(`*${BASE}/admin/clients/:clientId`, async ({ params, request }) => {
    const a = getApp(String(params.clientId));
    if (!a) return HttpResponse.json({ code: "NOT_FOUND", message: "App not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(a, body, { updatedAt: NOW() });
    return HttpResponse.json(a);
  }),

  http.delete(`*${BASE}/admin/clients/:clientId`, ({ params }) => {
    const i = apps.findIndex((a) => a.id === resolveAppId(String(params.clientId)));
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "App not found" }, { status: 404 });
    apps.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch(`*${BASE}/admin/clients/:clientId/status`, async ({ params, request }) => {
    const a = getApp(String(params.clientId));
    if (!a) return HttpResponse.json({ code: "NOT_FOUND", message: "App not found" }, { status: 404 });
    const body = (await request.json()) as { status: "active" | "disabled" };
    a.status = body.status;
    a.updatedAt = NOW();
    return HttpResponse.json(a);
  }),
];

// === M08 — Client menus (2026-09-08 shared 重命名：/admin/apps/{appId}/menus → /clients/{clientId}/menus) ===
export const menusExtraHandlers = [
  http.get(`*${BASE}/clients/:clientId/menus`, ({ params }) =>
    HttpResponse.json(listMenus(String(params.clientId))),
  ),

  http.get(`*${BASE}/clients/:clientId/menus/:menuId`, ({ params }) => {
    const m = getMenu(String(params.menuId));
    const resolvedAppId = resolveAppId(String(params.clientId));
    if (!m || m.clientId !== resolvedAppId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    return HttpResponse.json(m);
  }),

  http.post(`*${BASE}/clients/:clientId/menus`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newMenu = {
      id: `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`,
      clientId: resolveAppId(String(params.clientId)),
      parentId: (body.parentId as string | undefined) ?? "00000000-0000-0000-0000-000000000000",
      title: String(body.title ?? ""),
      path: body.path as string | undefined,
      icon: body.icon as string | undefined,
      // 2026-09-11 契约对齐：SysMenuType directory|menu|button；status smallint
      type: (body.type as "directory" | "menu" | "button") ?? "menu",
      sortOrder: Number(body.sortOrder ?? 0),
      status: (body.status as 0 | 1) ?? 1,
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    menus.push(newMenu);
    return HttpResponse.json(newMenu, { status: 201 });
  }),

  http.patch(`*${BASE}/clients/:clientId/menus/:menuId`, async ({ params, request }) => {
    const m = getMenu(String(params.menuId));
    const resolvedAppId = resolveAppId(String(params.clientId));
    if (!m || m.clientId !== resolvedAppId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(m, body, { updatedAt: NOW() });
    return HttpResponse.json(m);
  }),

  http.delete(`*${BASE}/clients/:clientId/menus/:menuId`, ({ params }) => {
    const resolvedAppId = resolveAppId(String(params.clientId));
    const i = menus.findIndex((m) => m.id === params.menuId && m.clientId === resolvedAppId);
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    menus.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`*${BASE}/clients/:clientId/menus/:menuId/reorder`, async ({ params, request }) => {
    const m = getMenu(String(params.menuId));
    const resolvedAppId = resolveAppId(String(params.clientId));
    if (!m || m.clientId !== resolvedAppId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    const body = (await request.json()) as { orderedMenuIds: string[] };
    body.orderedMenuIds.forEach((mid, idx) => {
      const target = menus.find((x) => x.id === mid);
      if (target) target.sortOrder = idx;
    });
    return HttpResponse.json(listMenus(resolvedAppId));
  }),

  http.patch(`*${BASE}/clients/:clientId/menus/:menuId/parent`, async ({ params, request }) => {
    const m = getMenu(String(params.menuId));
    const resolvedAppId = resolveAppId(String(params.clientId));
    if (!m || m.clientId !== resolvedAppId)
      return HttpResponse.json({ code: "NOT_FOUND", message: "Menu not found" }, { status: 404 });
    const body = (await request.json()) as { parentId?: string };
    m.parentId = body.parentId ?? m.parentId;
    m.updatedAt = NOW();
    return HttpResponse.json(m);
  }),
];

// === M09 — Role ↔ Menu grants ===
export const roleMenuExtraHandlers = [
  http.get(`*${BASE}/tenants/:tenantId/roles/:roleId/menus`, ({ params }) => {
    const grant = getRoleMenuGrant(String(params.roleId));
    return HttpResponse.json(
      grant ?? {
        roleId: String(params.roleId),
        tenantId: String(params.tenantId),
        menuIds: [],
        updatedAt: NOW(),
      },
    );
  }),

  http.put(`*${BASE}/tenants/:tenantId/roles/:roleId/menus`, async ({ params, request }) => {
    const body = (await request.json()) as { menuIds: string[] };
    const existing = roleMenuGrants.findIndex((g) => g.roleId === params.roleId);
    const grant = { tenantId: String(params.tenantId), roleId: String(params.roleId), menuIds: body.menuIds, updatedAt: NOW() };
    if (existing >= 0) roleMenuGrants[existing] = grant;
    else roleMenuGrants.push(grant);
    return HttpResponse.json(grant);
  }),

  http.delete(`*${BASE}/tenants/:tenantId/roles/:roleId/menus`, ({ params }) => {
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
  http.get(`*${BASE}/me/menus`, async ({ request }) => {
    // M09.F03.I01 (PLAN-2026-001 T-7) — 验 saas session 或 Bearer token
    // 2026-08-30 contract-test：其他 3 后端（nextjs/aspnetcore/springboot）走 Bearer，
    // msw 必须同步。saas session 是 ADR-0013 的 dev 改造通道，Bearer 是生产契约面；
    // 两条都接受，不破坏现有 session 流程。
    const session = parseSessionFromCookie(request);
    let userId: string | null = session?.userId ?? null;
    if (!userId) {
      const auth = request.headers.get("Authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/, "");
      if (token) {
        try {
          const { payload } = await jwtVerify(
            token,
            getSigningKey(),
            {
              issuer: getIssuer(),
              audience: getAudience(),
            },
          );
          userId = String(payload.sub ?? "");
        } catch {
          // fall through to 401
        }
      }
    }
    if (!userId) {
      return HttpResponse.json(
        { code: "UNAUTHORIZED", message: "saas session or Bearer token required" },
        { status: 401 },
      );
    }
    const acmeAdminGrant = roleMenuGrants.find((g) => g.roleId === ROLE_IDS.acmeAdmin);
    const allowed = new Set(acmeAdminGrant?.menuIds ?? []);
    const tree = (parentId: string | null | undefined, appId: string): Array<Record<string, unknown>> =>
      menus
        .filter((m) => m.clientId === appId && m.parentId == parentId && m.status === 1)
        .filter((m) => allowed.has(m.id) || parentId == null) // group 节点若不在 grant 中也保留作容器
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((m) => {
          // 2026-09-11 契约对齐：SysMenu 字段（clientId/title）；不带 status/createdAt/updatedAt.
          const { id, clientId: aId, parentId, title, path, icon, type, sortOrder } = m;
          return {
            id,
            clientId: aId,
            parentId,
            title,
            path,
            icon,
            type,
            sortOrder,
            children: tree(m.id, m.clientId),
          };
        });

    // 2026-09-01 contract-test I05：响应只含「该 app 下至少有一条 alice grant 内菜单的 app」，
    // 不再返所有 active app（否则空菜单 app 也占位，与真后端不一致）。对齐 aspnetcore/springboot/nextjs。
    // 单纯靠 tree() 判空不准 —— tree 里 `|| parentId == null` 让所有根菜单恒通过 filter，
    // 所以「无 grant 命中」app 也会返回一条根菜单占位。改在 app 级别先做集合交集判断。
    const allowedInApp = (appId: string): number =>
      menus.filter((m) => m.clientId === appId && m.status === 1 && allowed.has(m.id)).length;

    const result: Record<string, Array<Record<string, unknown>>> = {};
    for (const a of apps) {
      if (a.status !== "active") continue;
      if (allowedInApp(a.id) === 0) continue;
      result[a.code] = tree(undefined, a.id);
    }
    return HttpResponse.json(result);
  }),
];

// === M03 — Auth (deterministic against users fixture + fixed password) ===
export const authExtraHandlers = [
  http.post(`*${BASE}/auth/login`, async ({ request }) => {
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
    // 2026-09-11 与 DB 对齐：audit-events 域已随 b749c18 契约下线整体移除（DB 无表）。
    // M03.F01.I01 — 写 saas session cookie (HttpOnly + SameSite=Lax)
    const sid = generateSid();
    saasSessions.set(sid, {
      userId: user.id,
      tenantId: user.tenantId,
      expiresAt: Date.now() + SAAS_SESSION_TTL_MS,
    });
    // M03.F02.I04 — refreshToken 入 rotate 存储，供 /auth/refresh 一次性消费
    const loginRefreshToken = `saas-rt-${user.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    saasRefreshTokens.set(loginRefreshToken, {
      userId: user.id,
      tenantId: user.tenantId,
      scope: "openid profile email",
    });
    // 2026-09-11 REQ-2026-004：补齐 LoginResponse 契约 required 字段（user/availableTenants/clientId）。
    // 此前缺失导致三端 currentTenantId 落空 —— react 切换器条件渲染直接消失（E2E 抓出）。
    // user 按 SysUser 契约字段挑拣（fixture 扁平 user 的 tenantId/roleIds 不进契约响应）。
    const mine = memberships.filter(
      (m) => m.userId === user.id && m.status === "active",
    );
    return HttpResponse.json(
      {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        availableTenants: mine,
        clientId: String((body as { clientId?: string }).clientId ?? ""),
        accessToken: await signAccessToken({ sub: user.id, tenant_id: user.tenantId }),
        refreshToken: loginRefreshToken,
        tokenType: "Bearer",
        expiresIn: 3600,
        userId: user.id,
        currentTenantId: mine[0]?.tenantId ?? user.tenantId,
      },
      {
        headers: {
          // MSW 的 HttpResponse 不直接支持 Set-Cookie 数组; 单 cookie 写法
          "Set-Cookie": `saasSession=${sid}; Path=/api/v1; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SAAS_SESSION_TTL_MS / 1000)}`,
        },
      },
    );
  }),

  http.post(`*${BASE}/auth/logout`, () => {
    // best-effort：不写 audit（AuditAction 枚举里没有 logout）
    return new HttpResponse(null, { status: 204 });
  }),

  // M03.F02.I04 — /auth/refresh：rotate 语义（旧 token 一次性），oracle 对齐
  // nextjs oauthStore.rotateRefresh + springboot AuthService.refresh（2026-08-31 第三期）。
  http.post(`*${BASE}/auth/refresh`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      grantType?: string;
      refreshToken?: string;
    } | null;
    if (body?.grantType !== "refresh_token" || !body.refreshToken) {
      return HttpResponse.json(
        { code: "BAD_REQUEST", message: "grantType must be refresh_token with refreshToken" },
        { status: 400 },
      );
    }
    const entry = saasRefreshTokens.get(body.refreshToken);
    if (!entry) {
      return HttpResponse.json(
        { code: "INVALID_GRANT", message: "refreshToken 不存在或已被使用" },
        { status: 400 },
      );
    }
    saasRefreshTokens.delete(body.refreshToken); // rotate：旧 token 一次性
    const newRefresh = `saas-rt-${entry.userId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    saasRefreshTokens.set(newRefresh, entry);
    return HttpResponse.json({
      accessToken: await signAccessToken({ sub: entry.userId, tenant_id: entry.tenantId }),
      refreshToken: newRefresh,
      tokenType: "Bearer",
      expiresIn: 3600,
      scope: entry.scope,
    });
  }),

  // M03.F02.I03 — /auth/oidc/callback（2026-08-31 contract-test I25）。
  // dev pseudo-OIDC：成功分支需真 IdP code，本 handler 只锁错误分支契约面
  // （缺 code/state/clientId → 400 INVALID_REQUEST，对齐 nextjs zod 校验）。
  // 成功分支走 oauthCodes（与 /oauth/token 同源）。
  http.post(`*${BASE}/auth/oidc/callback`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      code?: string;
      state?: string;
      clientId?: string;
    } | null;
    if (!body?.code || !body.state || !body.clientId) {
      return HttpResponse.json(
        { code: "INVALID_REQUEST", message: "OIDC callback: 缺必填字段（code/state/clientId）" },
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
    const entry = oauthCodes.get(body.code);
    if (!entry || entry.appId !== app.id) {
      return HttpResponse.json(
        { code: "INVALID_GRANT", message: "code 不存在或已被使用" },
        { status: 400 },
      );
    }
    oauthCodes.delete(body.code); // 一次性
    const accessToken = await signAccessToken({
      sub: entry.userId,
      tenant_id: entry.tenantId,
      scope: entry.scope,
    });
    const refreshToken = `saas-rt-${entry.userId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
  }),

  // GET /me：给前端一个还原 user 信息的接口（刷新页面后 bootstrap）
  http.get(`*${BASE}/me`, async ({ request }) => {
    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/, "");
    if (!token) {
      return HttpResponse.json(
        { code: "UNAUTHENTICATED", message: "Missing or invalid token" },
        { status: 401 },
      );
    }
    try {
      const { payload } = await jwtVerify(
        token,
        getSigningKey(),
        {
          issuer: getIssuer(),
          audience: getAudience(),
        },
      );
      const userId = String(payload.sub ?? "");
      const user = users.find((u) => u.id === userId);
      if (!user) {
        return HttpResponse.json(
          { code: "UNAUTHENTICATED", message: "Token subject not found" },
          { status: 401 },
        );
      }
      // 2026-08-30 contract-test：OpenAPI /me 返回 CurrentUser（id/email/memberships/
      // currentTenantId），不是 User。oracle 修齐 3 个真后端（nextjs/aspnetcore/springboot）。
      const userMemberships = memberships.filter((m) => m.userId === userId);
      const currentTenantId =
        typeof payload.tenant_id === "string" ? payload.tenant_id : userMemberships[0]?.tenantId;
      return HttpResponse.json({
        id: user.id,
        email: user.email,
        memberships: userMemberships.map((m) => ({
          id: m.id,
          userId: m.userId,
          tenantId: m.tenantId,
          roleIds: m.roleIds,
          status: m.status,
          joinedAt: m.joinedAt,
        })),
        currentTenantId,
      });
    } catch {
      return HttpResponse.json(
        { code: "UNAUTHENTICATED", message: "Invalid token" },
        { status: 401 },
      );
    }
  }),

  // GET /me/tenants：从 canonical seed（tenant_member.json）返回当前用户的所有成员关系。
  // 2026-08-30：覆盖 orval 自动生成（faker.date.past() 写随机 joinedAt，违反
  // 契约测试 deterministic 要求 + 与 shared V016 不一致）。
  http.get(`*${BASE}/me/tenants`, async ({ request }) => {
    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/, "");
    if (!token) {
      return HttpResponse.json(
        { code: "UNAUTHENTICATED", message: "Missing or invalid token" },
        { status: 401 },
      );
    }
    try {
      const { payload } = await jwtVerify(
        token,
        getSigningKey(),
        {
          issuer: getIssuer(),
          audience: getAudience(),
        },
      );
      const userId = String(payload.sub ?? "");
      const mine = memberships.filter((m) => m.userId === userId);
      return HttpResponse.json(mine);
    } catch {
      return HttpResponse.json(
        { code: "UNAUTHENTICATED", message: "Invalid token" },
        { status: 401 },
      );
    }
  }),

  // M00.F02.I03 — POST /me/tenants/{t}/switch：切当前租户，返回新 tenant-scoped
  // token 对。oracle 对齐 springboot MeService.switchTenant + nextjs switch route
  // （2026-08-31 contract-test 第三期；覆盖 orval faker 兜底）。
  // 非 member → 404（tenant 不存在或无成员关系同面）；无 Bearer → 401。
  http.post(`*${BASE}/me/tenants/:tenantId/switch`, async ({ request, params }) => {
    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/, "");
    if (!token) {
      return HttpResponse.json(
        { code: "UNAUTHENTICATED", message: "Missing or invalid token" },
        { status: 401 },
      );
    }
    try {
      const { payload } = await jwtVerify(
        token,
        getSigningKey(),
        {
          issuer: getIssuer(),
          audience: getAudience(),
        },
      );
      const userId = String(payload.sub ?? "");
      const tenantId = String(params.tenantId ?? "");
      const m = memberships.find(
        (x) => x.userId === userId && x.tenantId === tenantId && x.status !== "removed",
      );
      if (!m) {
        return HttpResponse.json(
          { code: "NOT_FOUND", message: "tenant 不存在或不是该租户成员" },
          { status: 404 },
        );
      }
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      const newRefresh = `saas-rt-${userId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      saasRefreshTokens.set(newRefresh, {
        userId,
        tenantId,
        scope: "openid profile email",
      });
      return HttpResponse.json({
        accessToken: await signAccessToken({ sub: userId, tenant_id: tenantId }),
        refreshToken: newRefresh,
        expiresAt,
        tenantId,
      });
    } catch {
      return HttpResponse.json(
        { code: "UNAUTHENTICATED", message: "Invalid token" },
        { status: 401 },
      );
    }
  }),

  // === OAuth 2.0 server 端点（POST 与 saas-shared OpenAPI 一致）===
  // authorize/token 都按 clientId 找 App 记录，校验 redirect_uri / scope / tenantId；
  // code 一次性、refresh_token 用于换新对。
  // dev 阶段不严验 client_secret（生产 saas springboot/aspnetcore 真后端验）。

  http.post(`*${BASE}/oauth/authorize`, async ({ request }) => {
    // M04.F03.I01 (PLAN-2026-001 T-7) — 先验 saas session；
    // 2026-08-31 contract-test I26：3 真后端走 Bearer，补双通道（对齐 /me/menus 先例）。
    const session = parseSessionFromCookie(request);
    let bearerUserId: string | null = null;
    let bearerTenantId: string | null = null;
    if (!session) {
      const auth = request.headers.get("Authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/, "");
      if (token) {
        try {
          const { payload } = await jwtVerify(
            token,
            getSigningKey(),
            {
              issuer: getIssuer(),
              audience: getAudience(),
            },
          );
          bearerUserId = String(payload.sub ?? "") || null;
          bearerTenantId = typeof payload.tenant_id === "string" ? payload.tenant_id : null;
        } catch {
          // fall through to 401
        }
      }
    }
    if (!session && !bearerUserId) {
      return HttpResponse.json(
        { code: "UNAUTHORIZED", message: "saas session or Bearer token required" },
        { status: 401 },
      );
    }
    const body = (await request.json()) as {
      clientId?: string;
      redirectUri?: string;
      responseType?: string;
      scope?: string;
      state?: string;
      tenantId?: string;
    };
    // 2026-09-11 契约对齐（E2E ④ 抓出 msw 校验过严）：AuthorizeCodeRequest
    // required = clientId/redirectUri/responseType/state（scope 可选，tenantId 非契约字段）。
    if (!body.clientId || !body.redirectUri || !body.responseType || !body.state) {
      return HttpResponse.json(
        {
          code: "INVALID_REQUEST",
          message: "OAuth 2.0 authorize: 缺必填字段（clientId/redirectUri/responseType/state）",
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
    // M04.F03.I02 (PLAN-2026-001 T-7) — user 从 session.userId 取 (不再 tenantId 直发)；
    // 2026-08-31：Bearer 通道时 sub 即 userId
    const effectiveUserId = session?.userId ?? bearerUserId!;
    const effectiveTenantId = session?.tenantId ?? bearerTenantId;
    const devUser = users.find((u) => u.id === effectiveUserId);
    if (!devUser) {
      return HttpResponse.json(
        { code: "INVALID_GRANT", message: "session user not found" },
        { status: 401 },
      );
    }
    // 2026-09-11 契约对齐：tenantId 不在 AuthorizeCodeRequest——code 绑定当前
    // 认证身份（session/Bearer 的 tenant），不信 body。
    // 生成一次性 code 存映射
    const code = `saas-code-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    oauthCodes.set(code, {
      appId: app.id,
      userId: devUser.id,
      // effectiveTenantId 带 null（bearer 无 tenant claim 的兜底）——code 绑定用 ?? 兜底
      tenantId: effectiveTenantId ?? devUser.tenantId,
      scope: body.scope ?? "",
      redirectUri: body.redirectUri ?? "",
    });
    return HttpResponse.json({ code, state: body.state });
  }),

  http.post(`*${BASE}/oauth/token`, async ({ request }) => {
    // M04.F03.I02 (PLAN-2026-001 T-7) — 先验 saas session；
    // 2026-08-31 contract-test I27：补 Bearer 通道（3 真后端走 Bearer）。
    const session = parseSessionFromCookie(request);
    if (!session) {
      const auth = request.headers.get("Authorization") ?? "";
      const token = auth.replace(/^Bearer\s+/, "");
      if (!token) {
        return HttpResponse.json(
          { code: "UNAUTHORIZED", message: "saas session or Bearer token required" },
          { status: 401 },
        );
      }
      try {
        await jwtVerify(
          token,
          getSigningKey(),
          {
            issuer: getIssuer(),
            audience: getAudience(),
          },
        );
      } catch {
        return HttpResponse.json(
          { code: "UNAUTHORIZED", message: "Invalid Bearer token" },
          { status: 401 },
        );
      }
    }
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
      // HS256 真签 access token (Phase 1A v0.4.0)；refreshToken 仍随机字符串
      const accessToken = await signAccessToken({
        sub: entry.userId,
        tenant_id: entry.tenantId,
        scope: entry.scope,
      });
      const refreshToken = `saas-rt-${entry.userId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
      const accessToken = await signAccessToken({
        sub: entry.userId,
        tenant_id: entry.tenantId,
        scope: entry.scope,
      });
      const newRefresh = `saas-rt-${entry.userId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
  // 2026-08-31 contract-test I29：分页对齐家族约定 page=0 / pageSize=20
  // （3 真后端 list 端点默认值，见 memory contract-test-pagination-defaults-must-align）。
  http.get(`*${BASE}/admin/tenants`, ({ request }) => {
    const url = new URL(request.url);
    const page = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("pageSize") ?? 20) || 20),
    );
    const start = page * pageSize;
    return HttpResponse.json({
      items: tenants.slice(start, start + pageSize),
      page,
      pageSize,
      total: tenants.length,
    });
  }),

  http.get(`*${BASE}/admin/tenants/:id`, ({ params }) => {
    const t = getTenant(String(params.id));
    return t
      ? HttpResponse.json(t)
      : HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
  }),

  http.post(`*${BASE}/admin/tenants`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const newTenant = {
      id: uuidLike("tenant"),
      tenantKey: String(body.tenantKey ?? "").trim(),
      name: String(body.name ?? "").trim(),
      status: (body.status as TenantStatus) ?? "active",
      // 2026-08-31 contract-test I30：settings 是 Tenant DTO 契约字段（真后端 jsonb 默认 {}）
      settings: {},
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    if (!newTenant.tenantKey || !newTenant.name) {
      return HttpResponse.json(
        { code: "BAD_REQUEST", message: "tenantKey and name are required" },
        { status: 400 },
      );
    }
    tenants.push(newTenant);
    return HttpResponse.json(newTenant, { status: 201 });
  }),

  http.patch(`*${BASE}/admin/tenants/:id`, async ({ params, request }) => {
    const t = getTenant(String(params.id));
    if (!t) return HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(t, body, { updatedAt: NOW() });
    return HttpResponse.json(t);
  }),

  http.delete(`*${BASE}/admin/tenants/:id`, ({ params }) => {
    const i = tenants.findIndex((t) => t.id === params.id);
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "Tenant not found" }, { status: 404 });
    tenants.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];

// === M01 — Members (tenant-scoped CRUD; 2026-09-08 shared 重命名 users→members) ===
export const usersExtraHandlers = [
  http.get(`*${BASE}/tenants/:tenantId/members`, ({ params }) => {
    const items = listUsers(String(params.tenantId));
    return HttpResponse.json({
      items,
      // 2026-08-30 contract-test：msw 默认 page=1 1-indexed；其他 3 后端 0-indexed。
      // 0-indexed 是 Spring Data 家族约定（PageRequest.of(0, ps)），msw 跟齐。
      page: 0,
      pageSize: 20,
      total: items.length, // 2026-08-30：以前用 users.length（全局），应按 tenant 范围
    });
  }),

  http.get(`*${BASE}/tenants/:tenantId/members/:userId`, ({ params }) => {
    const u = getUser(String(params.tenantId), String(params.userId));
    return u
      ? HttpResponse.json(u)
      : HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
  }),

  http.post(`*${BASE}/tenants/:tenantId/members`, async ({ params, request }) => {
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
      status: (body.status as "active" | "invited" | "suspended" | "disabled") ?? "active",
      roleIds: (body.roleIds as string[]) ?? [],
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    users.push(newUser);
    return HttpResponse.json(newUser, { status: 201 });
  }),

  http.patch(`*${BASE}/tenants/:tenantId/members/:userId`, async ({ params, request }) => {
    const u = getUser(String(params.tenantId), String(params.userId));
    if (!u) return HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(u, body, { updatedAt: NOW() });
    return HttpResponse.json(u);
  }),

  http.delete(`*${BASE}/tenants/:tenantId/members/:userId`, ({ params }) => {
    const i = users.findIndex((u) => u.tenantId === params.tenantId && u.id === params.userId);
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
    users.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.put(`*${BASE}/tenants/:tenantId/members/:userId/roles`, async ({ params, request }) => {
    const u = getUser(String(params.tenantId), String(params.userId));
    if (!u) return HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
    const body = (await request.json()) as { roleIds: string[] };
    u.roleIds = body.roleIds;
    u.updatedAt = NOW();
    return HttpResponse.json(u);
  }),

  http.patch(`*${BASE}/tenants/:tenantId/members/:userId/status`, async ({ params, request }) => {
    const u = getUser(String(params.tenantId), String(params.userId));
    if (!u) return HttpResponse.json({ code: "NOT_FOUND", message: "User not found" }, { status: 404 });
    const body = (await request.json()) as { status: "active" | "invited" | "suspended" | "disabled" };
    u.status = body.status;
    u.updatedAt = NOW();
    return HttpResponse.json(u);
  }),

  // M01.F02.I02 — /users/invitations（2026-09-01 contract-test I42；2026-09-10 方案 C 改嵌套 view）。
  // 邀请语义：按 email 建占位 user（status=invited），member 行写 memberships。
  // faker 兜底会返随机 email 破坏 oracle，此处确定性实现（对齐 nextjs invitations route）。
  http.post(`*${BASE}/tenants/:tenantId/members/invitations`, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      mobile?: string;
    } | null;
    const email = String(body?.email ?? "").trim();
    if (!email) {
      return HttpResponse.json(
        { code: "BAD_REQUEST", message: "email is required" },
        { status: 400 },
      );
    }
    const now = NOW();
    const userId = uuidLike("user");
    // 存储行：本地 shim User 仍是旧扁平 shape（tenantId/roleIds 必填，同 seeds/sys_user.json），
    // 重 gen（Task 7）后可去掉这两个字段。
    const user = {
      id: userId,
      tenantId: String(params.tenantId),
      username: email.split("@")[0] ?? email,
      email,
      status: "invited" as const, // SSOT SysUserStatus 2026-09-10 补 invited（I42）
      roleIds: [] as string[],
      createdAt: now,
      updatedAt: now,
    };
    users.push(user);
    const member = {
      id: uuidLike("member"),
      tenantId: String(params.tenantId),
      userId,
      memberName: user.username,
      isOwner: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    // memberships 是 seed 的 TenantMembership 表（id/userId/tenantId/roleIds/status/joinedAt）。
    memberships.push({
      id: member.id,
      tenantId: member.tenantId,
      userId,
      roleIds: [],
      status: "active",
      joinedAt: now,
    });
    // 嵌套 TenantMemberView（SSOT tenant-members.tsp:54）；邀请态挂 user.status。
    // user 视图剔除存储行的 tenantId/roleIds（SSOT SysUserView 无此二字段）。
    // 2026-09-02 contract-test M96 audit 覆盖对齐（用户拍板）：invite 不写审计事件。
    // AuditAction 枚举无 user_invited；此前用 user_created 近似，但 3 真后端
    // Invitations 端点都不写 —— oracle 对齐真后端，删。
    const { tenantId: _t, roleIds: _r, ...userView } = user;
    return HttpResponse.json(
      { member, user: userView, roles: [] as string[] },
      { status: 201 },
    );
  }),
];

// === M02 — Roles (tenant-scoped CRUD) ===
export const rolesExtraHandlers = [
  http.get(`*${BASE}/tenants/:tenantId/roles`, ({ request, params }) => {
    // 与 OpenAPI 一致: page=0-indexed, pageSize 默认 20
    const url = new URL(request.url);
    const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
    const all = listRoles(String(params.tenantId));
    const items = all.slice(page * pageSize, page * pageSize + pageSize);
    return HttpResponse.json({
      items,
      page,
      pageSize,
      total: all.length,
    });
  }),

  http.get(`*${BASE}/tenants/:tenantId/roles/:roleId`, ({ params }) => {
    const r = getRole(String(params.tenantId), String(params.roleId));
    return r
      ? HttpResponse.json(r)
      : HttpResponse.json({ code: "NOT_FOUND", message: "Role not found" }, { status: 404 });
  }),

  http.post(`*${BASE}/tenants/:tenantId/roles`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // 9/7 SSOT：CreateSysRoleRequest {clientId, roleCode, roleName}（permissions 域已废弃）
    const clientId = String(body.clientId ?? "").trim();
    const roleCode = String(body.roleCode ?? body.code ?? "").trim();
    const roleName = String(body.roleName ?? body.name ?? "").trim();
    if (!clientId || !roleCode || !roleName) {
      return HttpResponse.json(
        { code: "BAD_REQUEST", message: "clientId, roleCode and roleName are required" },
        { status: 400 },
      );
    }
    const newRole = {
      id: uuidLike("role"),
      tenantId: String(params.tenantId),
      clientId,
      roleCode,
      roleName,
      isPreset: false,
      createdAt: NOW(),
      updatedAt: NOW(),
    };
    roles.push(newRole as unknown as typeof roles[number]);
    return HttpResponse.json(newRole, { status: 201 });
  }),

  http.patch(`*${BASE}/tenants/:tenantId/roles/:roleId`, async ({ params, request }) => {
    const r = getRole(String(params.tenantId), String(params.roleId));
    if (!r) return HttpResponse.json({ code: "NOT_FOUND", message: "Role not found" }, { status: 404 });
    const body = (await request.json()) as Record<string, unknown>;
    Object.assign(r, body, { updatedAt: NOW() });
    return HttpResponse.json(r);
  }),

  http.delete(`*${BASE}/tenants/:tenantId/roles/:roleId`, ({ params }) => {
    const i = roles.findIndex(
      (r) => r.tenantId === params.tenantId && r.id === params.roleId,
    );
    if (i < 0) return HttpResponse.json({ code: "NOT_FOUND", message: "Role not found" }, { status: 404 });
    roles.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // M02.F02.I01 — PUT permissions：已废弃删除（2026-09-08 shared tenant-roles.tsp
  // 无此 op，权限面由 role-menus grants 取代）。
];
// === M05 api-keys / M06 audit 域：已废弃删除（2026-09-08 shared 契约整域移除）===
// 2026-09-11 与 DB 对齐（用户裁定）：auditEvents 数组与 login/member 处的残写一并清除，
// seeds 五个死文件（api-keys/audit-events/audit-retention-policies/permissions/role-permissions）删除。

// === M04.F01 公共读侧 - Client 目录（免鉴权；2026-09-08 shared 重命名 /apps/{code} → /clients/{clientId}） ===
// 供接入方（lab 各前端）按 client 标识取应用展示信息；
// 只返回展示字段，不暴露 OAuth 集成字段。
// seed 内 client 标识以 code 表示（如 lab-management），handler 兼容 id/code/clientId 查找。
export const publicAppsExtraHandlers = [
  http.get(`*${BASE}/clients/:clientId`, ({ params }) => {
    const c = String(params.clientId);
    const a = apps.find((x) => x.id === c || x.code === c || x.clientId === c);
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
  ...appsExtraHandlers,
  ...publicAppsExtraHandlers,
  ...menusExtraHandlers,
  ...roleMenuExtraHandlers,
  ...meExtraHandlers,
];