// Cross-frontend fixture consistency tests.
import { describe, it, expect } from "vitest";
import {
  tenants,
  users,
  roles,
  apiKeys,
  oauthApps,
  auditEvents,
  memberships,
  TENANT_IDS,
  getTenant,
  listUsers,
} from "../src/fixtures/seed";

describe("M99.F01 fixture data consistency", () => {
  it("defines exactly 3 canonical tenants", () => {
    expect(tenants).toHaveLength(3);
    expect(Object.keys(TENANT_IDS)).toHaveLength(3);
  });

  it("tenant IDs are stable UUIDs", () => {
    expect(TENANT_IDS.acme).toBe("00000000-0000-0000-0000-000000000001");
    expect(TENANT_IDS.globex).toBe("00000000-0000-0000-0000-000000000002");
    expect(TENANT_IDS.initech).toBe("00000000-0000-0000-0000-000000000003");
  });

  it("getTenant finds tenant by id", () => {
    const t = getTenant(TENANT_IDS.acme);
    expect(t?.code).toBe("acme");
    expect(getTenant("does-not-exist")).toBeUndefined();
  });

  it("users are scoped under tenants", () => {
    for (const u of users) {
      expect(tenants.some((t) => t.id === u.tenantId)).toBe(true);
    }
  });

  it("listUsers returns only tenant-scoped users", () => {
    const acmeUsers = listUsers(TENANT_IDS.acme);
    expect(acmeUsers.length).toBeGreaterThan(0);
    for (const u of acmeUsers) expect(u.tenantId).toBe(TENANT_IDS.acme);
  });

  it("roles are scoped under tenants", () => {
    for (const r of roles) {
      expect(tenants.some((t) => t.id === r.tenantId)).toBe(true);
    }
  });

  it("user roleIds reference existing roles", () => {
    const roleIds = new Set(roles.map((r) => r.id));
    for (const u of users) {
      for (const rid of u.roleIds) expect(roleIds.has(rid)).toBe(true);
    }
  });

  it("apiKeys are scoped under tenants", () => {
    for (const k of apiKeys) {
      expect(tenants.some((t) => t.id === k.tenantId)).toBe(true);
    }
  });

  it("auditEvents reference existing users", () => {
    const userIds = new Set(users.map((u) => u.id));
    for (const e of auditEvents) {
      if (e.actorUserId) expect(userIds.has(e.actorUserId)).toBe(true);
    }
  });

  it("oauthApps are platform-level (no tenantId)", () => {
    expect(oauthApps.length).toBeGreaterThan(0);
    for (const a of oauthApps) {
      expect((a as any).tenantId).toBeUndefined();
    }
  });

  it("memberships cover all users", () => {
    const userIds = new Set(users.map((u) => u.id));
    for (const m of memberships) {
      expect(userIds.has(m.userId)).toBe(true);
    }
  });
});