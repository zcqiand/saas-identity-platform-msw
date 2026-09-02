// 2026-09-02 contract-test M96 audit 覆盖对齐（用户拍板）：invite 路径不写审计事件。
// msw 此前在 Invitations POST 写 user_created（AuditAction 枚举无 user_invited 的语义近似），
// 但 3 真后端 Invitations 端点都不写 —— oracle 对齐真后端，删掉。
// 反向断言：invite 成功后 auditEvents 数组长度不变。
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usersExtraHandlers } from "../src/handlers-extra";
import { auditEvents } from "../src/fixtures/seed";

const server = setupServer(...usersExtraHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

describe("M96 audit 覆盖对齐 — invite 路径不写审计", () => {
  it("POST /users/invitations 成功后 auditEvents 长度不变（不写 user_created）", async () => {
    const before = auditEvents.length;
    const res = await fetch(
      "http://localhost/api/v1/tenants/00000000-0000-0000-0000-000000000001/users/invitations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `invite-noaudit-${Date.now()}@x.io`, roleIds: [] }),
      },
    );
    expect(res.status).toBe(201);
    expect(auditEvents.length, "invite 不得写审计事件（对齐 3 真后端）").toBe(before);
  });
});
