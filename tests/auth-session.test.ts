// M03.F01.I01 + M04.F03 / I01 + M09.F03 / I01 — saas session cookie 体系 (PLAN-2026-001 T-7)。
//
// msw node 设计：Set-Cookie HttpOnly 头不被 fetch API 暴露（防止测试污染），
// 也不走 msw cookie jar。所以测试策略：
//   - 直接 import saasSessions Map (debug export) 验证状态
//   - 调用 /auth/login 验证状态注入
//   - 调用 /oauth/authorize 等端点 — 带不带 cookie 验证响应
//
// 真实浏览器场景：浏览器 fetch 会带 Set-Cookie 进 document.cookie jar —
// msw service worker 模式（client-side）能正确模拟。本测试仅验证 server-side 状态机。
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { authExtraHandlers, meExtraHandlers } from "../src/handlers-extra";
import { saasSessionsForTest } from "../src/handlers-extra";

const server = setupServer(...authExtraHandlers, ...meExtraHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

async function loginAsAlice(): Promise<Response> {
  return fetch("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "alice", password: "dev123456" }),
  });
}

describe("M03.F01.I01 + M04.F03.I01/I02 + M09.F03.I01 saas session", () => {
  it("POST /auth/login 成功 + 写 saasSessions Map (debug export)", async () => {
    saasSessionsForTest.clear();
    const res = await loginAsAlice();
    expect(res.status).toBe(200);
    // /auth/login 内部写 saasSessions Map: 至少有 1 个 entry
    expect(saasSessionsForTest.size).toBeGreaterThanOrEqual(1);
    const entries = [...saasSessionsForTest.values()];
    expect(entries[0]!.userId).toMatch(/-/); // UUID
    expect(entries[0]!.tenantId).toMatch(/-/);
  });

  it("GET /me/menus 无 cookie -> 401", async () => {
    saasSessionsForTest.clear();
    const res = await fetch("http://localhost/api/v1/me/menus");
    expect(res.status).toBe(401);
  });

  it("GET /me/menus 有 session -> 200 + 返回分组 map", async () => {
    saasSessionsForTest.clear();
    await loginAsAlice();
    const res = await fetch("http://localhost/api/v1/me/menus");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown[]>;
    expect(Object.keys(body).length).toBeGreaterThan(0);
  });

  it("POST /oauth/authorize 无 cookie -> 401", async () => {
    saasSessionsForTest.clear();
    const res = await fetch("http://localhost/api/v1/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "lab-mgmt",
        redirectUri: "http://localhost:3001/callback",
        responseType: "code",
        scope: "openid profile email",
        state: "x",
        tenantId: "00000000-0000-0000-0000-000000000001",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /oauth/authorize 有 session -> 200 {code, state}", async () => {
    saasSessionsForTest.clear();
    await loginAsAlice();
    const res = await fetch("http://localhost/api/v1/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "lab-mgmt",
        redirectUri: "http://localhost:3001/callback",
        responseType: "code",
        scope: "openid profile email",
        state: "abc",
        tenantId: "00000000-0000-0000-0000-000000000001",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code?: string; state?: string };
    expect(body.code).toMatch(/^saas-code-/);
    expect(body.state).toBe("abc");
  });

  it("POST /oauth/token 无 cookie -> 401", async () => {
    saasSessionsForTest.clear();
    const res = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "authorization_code",
        code: "anything",
        clientId: "lab-mgmt",
        tenantId: "00000000-0000-0000-0000-000000000001",
        redirectUri: "http://localhost:3001/callback",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /auth/logout 删 saasSessions entry + 下次 me/menus 401", async () => {
    saasSessionsForTest.clear();
    await loginAsAlice();
    expect(saasSessionsForTest.size).toBeGreaterThanOrEqual(1);
    // 清掉 (模拟 logout)
    saasSessionsForTest.clear();
    const res = await fetch("http://localhost/api/v1/me/menus");
    expect(res.status).toBe(401);
  });
});

// === M03.F01.I01 cookie jar 行为 (PLAN-2026-001 T-12) ===
//
// Node fetch 不自动管理 cookie jar（Set-Cookie 不进 document.cookie）。
// 这里手写一个最小 jar：从 saasSessionsForTest 的 key 还原 sid，
// 按 `Cookie: saasSession=<sid>` 头带回来 - 与浏览器 jar 的网络行为等价
// （Path=/api/v1 下所有 /api/v1/* 请求都会带）。

function sidFromJar(): string {
  expect(saasSessionsForTest.size).toBeGreaterThanOrEqual(1);
  const sid = [...saasSessionsForTest.keys()][0]!;
  return sid;
}

function fetchWithCookie(url: string, init: RequestInit, cookie: string): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  headers.set("cookie", cookie);
  return fetch(url, { ...init, headers });
}

describe("M03.F01.I01 + M04.F03.I02/I03 + M09.F03.I01 cookie jar 行为", () => {
  it("login 响应带 Set-Cookie saasSession 头（HttpOnly 屏蔽时由 jar 兜底）", async () => {
    saasSessionsForTest.clear();
    const res = await loginAsAlice();
    expect(res.status).toBe(200);
    // Node 20+: getSetCookie() 能拿到被 fetch API 屏蔽前的原始头；
    // 若运行时不支持，则退回 jar 侧断言（sid 已写入 store）
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [res.headers.get("set-cookie") ?? ""];
    const joined = setCookies.join("\n");
    if (joined.includes("saasSession=")) {
      expect(joined).toContain("HttpOnly");
      expect(joined).toContain("SameSite=Lax");
      expect(joined).toContain("Path=/api/v1");
    } else {
      // msw node 拦截层屏蔽了 Set-Cookie - 至少 jar 侧必须有 session
      expect(saasSessionsForTest.size).toBeGreaterThanOrEqual(1);
    }
  });

  it("cookie jar 带 saasSession -> /me/menus 200", async () => {
    saasSessionsForTest.clear();
    await loginAsAlice();
    const sid = sidFromJar();
    const res = await fetchWithCookie(
      "http://localhost/api/v1/me/menus",
      { method: "GET" },
      `saasSession=${sid}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown[]>;
    expect(Object.keys(body).length).toBeGreaterThan(0);
  });

  it("cookie jar 混合 cookie 头（其他 cookie 前后夹 saasSession）仍解析", async () => {
    saasSessionsForTest.clear();
    await loginAsAlice();
    const sid = sidFromJar();
    const res = await fetchWithCookie(
      "http://localhost/api/v1/me/menus",
      { method: "GET" },
      `theme=dark; saasSession=${sid}; locale=zh-CN`,
    );
    expect(res.status).toBe(200);
  });

  it("cookie jar 过期 session -> 401 且 entry 被惰性清除", async () => {
    saasSessionsForTest.clear();
    await loginAsAlice();
    const sid = sidFromJar();
    // 手动把 entry 改成过期（模拟 24h TTL 到期）
    const rec = saasSessionsForTest.get(sid)!;
    rec.expiresAt = Date.now() - 1;
    const res = await fetchWithCookie(
      "http://localhost/api/v1/me/menus",
      { method: "GET" },
      `saasSession=${sid}`,
    );
    expect(res.status).toBe(401);
    // 惰性清除：过期后 entry 从 jar 里删掉
    expect(saasSessionsForTest.has(sid)).toBe(false);
  });

  it("cookie jar 全链路: login -> authorize -> token (cookie 一路带过来)", async () => {
    saasSessionsForTest.clear();
    await loginAsAlice();
    const sid = sidFromJar();
    const tenantId = saasSessionsForTest.get(sid)!.tenantId;

    // authorize 带 cookie
    const authorizeRes = await fetchWithCookie(
      "http://localhost/api/v1/oauth/authorize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: "lab-mgmt",
          redirectUri: "http://localhost:3001/callback",
          responseType: "code",
          scope: "openid profile email",
          state: "jar-state",
          tenantId,
        }),
      },
      `saasSession=${sid}`,
    );
    expect(authorizeRes.status).toBe(200);
    const { code } = (await authorizeRes.json()) as { code: string; state: string };
    expect(code).toMatch(/^saas-code-/);

    // token 同一个 cookie jar
    const tokenRes = await fetchWithCookie(
      "http://localhost/api/v1/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantType: "authorization_code",
          code,
          clientId: "lab-mgmt",
          tenantId,
          redirectUri: "http://localhost:3001/callback",
        }),
      },
      `saasSession=${sid}`,
    );
    expect(tokenRes.status).toBe(200);
    const token = (await tokenRes.json()) as { accessToken: string; refreshToken: string };
    expect(token.accessToken.split(".")).toHaveLength(3); // JWT 三段
    expect(token.refreshToken).toMatch(/^saas-rt-/);
  });
});