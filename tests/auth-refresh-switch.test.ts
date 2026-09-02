// M03.F02.I04 + M00.F02.I03 — auth/refresh 与 me/tenants/{id}/switch 的确定性 handler。
//
// 背景（2026-08-31 contract-test 第三期）：这两个端点此前只有 orval faker 兜底 handler
// （随机数据），不能当 oracle。本测试锁定确定性实现：
//   - POST /auth/refresh：login 发的 refreshToken 可换新 token 对（TokenResponse shape）
//   - POST /me/tenants/{t}/switch：alice 切到自己所属 tenant → SwitchTenantResponse shape；
//     切不存在的 tenant → 404；无 Bearer → 401
//
// oracle 契约对齐 3 个真后端：
//   - refresh: nextjs app/api/v1/auth/refresh/route.ts（rotate 语义，旧 token 一次性）
//   - switch: springboot MeService.switchTenant（403 not a member）+ nextjs（403 FORBIDDEN）
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  authExtraHandlers,
  meExtraHandlers,
  saasRefreshTokensForTest,
} from "../src/handlers-extra";

const server = setupServer(...authExtraHandlers, ...meExtraHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => saasRefreshTokensForTest.clear());

const TENANT_1 = "00000000-0000-0000-0000-000000000001"; // alice 所属（seed）

async function loginAlice(): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const res = await fetch("http://localhost/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "alice", password: "dev123456" }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { accessToken: string; refreshToken: string };
}

describe("M03.F02.I04 POST /auth/refresh 确定性 handler", () => {
  it("login 的 refreshToken 换新 token 对（TokenResponse shape）", async () => {
    const { refreshToken } = await loginAlice();
    const res = await fetch("http://localhost/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "refresh_token",
        refreshToken,
        clientId: "11111111-1111-1111-1111-111111111111",
        tenantId: TENANT_1,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // SSOT TokenResponse: accessToken/refreshToken?/tokenType/expiresIn/scope
    expect(typeof body.accessToken).toBe("string");
    expect(body.accessToken).not.toBe("");
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBe(3600);
    expect(typeof body.scope).toBe("string");
  });

  it("旧 refreshToken rotate 后不可重放（与 nextjs oauthStore.rotateRefresh 同语义）", async () => {
    const { refreshToken } = await loginAlice();
    const first = await fetch("http://localhost/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "refresh_token",
        refreshToken,
        clientId: "11111111-1111-1111-1111-111111111111",
        tenantId: TENANT_1,
      }),
    });
    expect(first.status).toBe(200);
    const second = await fetch("http://localhost/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "refresh_token",
        refreshToken,
        clientId: "11111111-1111-1111-1111-111111111111",
        tenantId: TENANT_1,
      }),
    });
    expect(second.status).toBe(400);
  });

  it("未知 refreshToken → 400", async () => {
    const res = await fetch("http://localhost/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "refresh_token",
        refreshToken: "saas-rt-00000000-0000-0000-0000-0000000000ff-0-xyz",
        clientId: "11111111-1111-1111-1111-111111111111",
        tenantId: TENANT_1,
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("M00.F02.I03 POST /me/tenants/{t}/switch 确定性 handler", () => {
  it("alice 切到自己所属 tenant → 200 SwitchTenantResponse shape", async () => {
    const { accessToken } = await loginAlice();
    const res = await fetch(
      `http://localhost/api/v1/me/tenants/${TENANT_1}/switch`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // SSOT SwitchTenantResponse: accessToken/refreshToken?/expiresAt/tenantId
    expect(typeof body.accessToken).toBe("string");
    expect(body.accessToken).not.toBe("");
    expect(typeof body.expiresAt).toBe("string");
    expect(body.tenantId).toBe(TENANT_1);
  });

  it("无 Bearer → 401", async () => {
    const res = await fetch(
      `http://localhost/api/v1/me/tenants/${TENANT_1}/switch`,
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("切到不存在的 tenant → 404", async () => {
    const { accessToken } = await loginAlice();
    const res = await fetch(
      "http://localhost/api/v1/me/tenants/00000000-0000-0000-0000-00000000dead/switch",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    expect(res.status).toBe(404);
  });
});
