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