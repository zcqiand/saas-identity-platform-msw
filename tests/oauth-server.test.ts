// M99.F02.I02 OAuth 2.0 server 契约测试 — /oauth/authorize + /oauth/token。
//
// 覆盖：
//   1. /oauth/authorize 必填字段缺失 → 400 INVALID_REQUEST
//   2. /oauth/authorize responseType != "code" → 400 UNSUPPORTED_RESPONSE_TYPE
//   3. /oauth/authorize clientId 未注册 → 400 INVALID_CLIENT
//   4. /oauth/authorize redirectUri 不在白名单 → 400 INVALID_REDIRECT_URI
//   5. /oauth/authorize 正常 → 200 {code, state}
//   6. /oauth/token grantType 不支持 → 400
//   7. /oauth/token authorization_code 缺 code → 400
//   8. /oauth/token code 不存在 → 400 INVALID_GRANT
//   9. /oauth/token code 一次性：第二次 INVALID_GRANT
//  10. /oauth/token refresh_token 正常流转 → 新 accessToken + 新 refreshToken
//
// dev mock 不验 clientSecret（生产 saas springboot/aspnetcore 真后端验）。
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { authExtraHandlers } from "../src/handlers-extra";

const server = setupServer(...authExtraHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// 用 saas-shared seed 里的实际数据：apps.json 中第一个 active app 是 lab-mgmt，
// redirectUris 配的是 lab-management-system-nextjs 的 callback。
// 这里测 OAuth handler 协议本身，用 nextjs 后端的 redirect_uri（dev 跨仓用）。
const VALID_CLIENT_ID = "lab-mgmt";
const VALID_REDIRECT = "http://localhost:3001/callback";
const VALID_TENANT = "00000000-0000-0000-0000-000000000001"; // users seed 中 alice/bob/carol 的 tenant
const VALID_SCOPE = "openid profile email";
const VALID_STATE = "abc-123";

async function callAuthorize(body: Record<string, unknown> = {}) {
  return fetch("http://localhost/api/v1/oauth/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: VALID_CLIENT_ID,
      redirectUri: VALID_REDIRECT,
      responseType: "code",
      scope: VALID_SCOPE,
      state: VALID_STATE,
      tenantId: VALID_TENANT,
      ...body,
    }),
  });
}

describe("M99.F02.I02 OAuth 2.0 server — /oauth/authorize", () => {
  it("缺 clientId → 400", async () => {
    const res = await callAuthorize({ clientId: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_REQUEST");
  });

  it("缺 redirectUri → 400", async () => {
    const res = await callAuthorize({ redirectUri: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_REQUEST");
  });

  it("缺 state → 400", async () => {
    const res = await callAuthorize({ state: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_REQUEST");
  });

  it("responseType=token（implicit）→ 400 UNSUPPORTED_RESPONSE_TYPE", async () => {
    const res = await callAuthorize({ responseType: "token" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("UNSUPPORTED_RESPONSE_TYPE");
  });

  it("clientId 未注册 → 400 INVALID_CLIENT", async () => {
    const res = await callAuthorize({ clientId: "no-such-client" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_CLIENT");
  });

  it("redirectUri 不在白名单 → 400 INVALID_REDIRECT_URI", async () => {
    const res = await callAuthorize({ redirectUri: "http://evil.com/callback" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_REDIRECT_URI");
  });

  it("正常 → 200 {code, state}", async () => {
    const res = await callAuthorize();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string; state: string };
    expect(body.code).toMatch(/^saas-code-/);
    expect(body.state).toBe(VALID_STATE);
  });
});

describe("M99.F02.I02 OAuth 2.0 server — /oauth/token", () => {
  async function freshCodeAndRedirect(): Promise<{ code: string; redirectUri: string }> {
    const res = await callAuthorize();
    const body = (await res.json()) as { code: string };
    return { code: body.code, redirectUri: VALID_REDIRECT };
  }

  it("grantType=password → 400 UNSUPPORTED_GRANT_TYPE", async () => {
    const res = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "password",
        clientId: VALID_CLIENT_ID,
        tenantId: VALID_TENANT,
        username: "admin",
        password: "x",
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("UNSUPPORTED_GRANT_TYPE");
  });

  it("authorization_code 缺 code → 400", async () => {
    const res = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "authorization_code",
        clientId: VALID_CLIENT_ID,
        tenantId: VALID_TENANT,
        redirectUri: VALID_REDIRECT,
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_REQUEST");
  });

  it("code 不存在 → 400 INVALID_GRANT", async () => {
    const res = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "authorization_code",
        code: "no-such-code",
        clientId: VALID_CLIENT_ID,
        tenantId: VALID_TENANT,
        redirectUri: VALID_REDIRECT,
      }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_GRANT");
  });

  it("code 一次性：用完第二次再调 INVALID_GRANT", async () => {
    const { code, redirectUri } = await freshCodeAndRedirect();
    const first = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "authorization_code",
        code,
        clientId: VALID_CLIENT_ID,
        tenantId: VALID_TENANT,
        redirectUri,
      }),
    });
    expect(first.status).toBe(200);
    const second = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "authorization_code",
        code,
        clientId: VALID_CLIENT_ID,
        tenantId: VALID_TENANT,
        redirectUri,
      }),
    });
    expect(second.status).toBe(400);
    expect((await second.json()).code).toBe("INVALID_GRANT");
  });

  it("正常 authorization_code → TokenResponse {accessToken, refreshToken, tokenType, expiresIn, scope}", async () => {
    const { code, redirectUri } = await freshCodeAndRedirect();
    const res = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "authorization_code",
        code,
        clientId: VALID_CLIENT_ID,
        tenantId: VALID_TENANT,
        redirectUri,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      tokenType: string;
      expiresIn: number;
      scope: string;
    };
    // Phase 1A v0.4.0：accessToken 改 HS256 真签发（RFC 7519 三段 base64url），refreshToken 仍 opaque。
    expect(body.accessToken).toMatch(/^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(body.refreshToken).toMatch(/^saas-rt-/);
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBe(3600);
    expect(body.scope).toBe(VALID_SCOPE);
  });

  it("refresh_token 流转 → 新 accessToken + 新 refreshToken，旧 refreshToken 失效", async () => {
    // 先走一次 authorization_code 拿到 refreshToken
    const { code, redirectUri } = await freshCodeAndRedirect();
    const tokRes = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "authorization_code",
        code,
        clientId: VALID_CLIENT_ID,
        tenantId: VALID_TENANT,
        redirectUri,
      }),
    });
    const oldTokens = (await tokRes.json()) as { accessToken: string; refreshToken: string };
    // 用 refreshToken 换新
    const refRes = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "refresh_token",
        refreshToken: oldTokens.refreshToken,
        clientId: VALID_CLIENT_ID,
        tenantId: VALID_TENANT,
      }),
    });
    expect(refRes.status).toBe(200);
    const newTokens = (await refRes.json()) as { accessToken: string; refreshToken: string };
    expect(newTokens.accessToken).not.toBe(oldTokens.accessToken);
    expect(newTokens.refreshToken).not.toBe(oldTokens.refreshToken);
    // 旧 refreshToken 失效（防重放）
    const replay = await fetch("http://localhost/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "refresh_token",
        refreshToken: oldTokens.refreshToken,
        clientId: VALID_CLIENT_ID,
        tenantId: VALID_TENANT,
      }),
    });
    expect(replay.status).toBe(400);
    expect((await replay.json()).code).toBe("INVALID_GRANT");
  });
});