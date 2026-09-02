// Cross-frontend fixture consistency tests.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  tenants,
  users,
  roles,
  apiKeys,
  auditEvents,
  memberships,
  apps,
  menus,
  roleMenuGrants,
  TENANT_IDS,
  APP_IDS,
  MENU_IDS,
  getTenant,
  getApp,
  getAppByClientId,
  getMenu,
  listMenus,
  listUsers,
  getRoleMenuGrant,
  ROLE_IDS,
} from "../src/fixtures/seed";

const SEEDS_DIR = resolve(import.meta.dirname, "../src/seeds");

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

  it("memberships cover all users", () => {
    const userIds = new Set(users.map((u) => u.id));
    for (const m of memberships) {
      expect(userIds.has(m.userId)).toBe(true);
    }
  });
});

// === M99.F02 — Apps / Menus / RoleMenuGrants fixtures ===
describe("M99.F02 apps+menus+grants fixture consistency", () => {
  it("apps are platform-level (no tenantId)", () => {
    expect(apps.length).toBe(3);
    expect(apps.map((a) => a.id).sort()).toEqual([APP_IDS.crm, APP_IDS.erp, APP_IDS.lab].sort());
    for (const a of apps) {
      expect((a as { tenantId?: unknown }).tenantId).toBeUndefined();
      // 2026-08-29: app id 收敛为 canonical UUID（shared V016），与 PG 逐字相同
      // 语义仍可读：11111111-…-1111/1112/1113 分别是 lab / erp / crm
      expect(a.id).toMatch(/^11111111-1111-1111-1111-11111111111[123]$/);
    }
  });

  it("getApp finds by id and APP_IDS keys are stable", () => {
    expect(APP_IDS.lab).toBe(getApp(APP_IDS.lab)?.id);
    expect(APP_IDS.erp).toBe(getApp(APP_IDS.erp)?.id);
    expect(APP_IDS.crm).toBe(getApp(APP_IDS.crm)?.id);
    expect(getApp("nope")).toBeUndefined();
  });

  it("apps carry OAuth client fields (clientId, redirectUris, isFirstParty)", () => {
    for (const a of apps) {
      // V017（2026-08-31）：client_id 收敛为 UUID（= app.id，V014 Phase 6 决策）
      expect(a.clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(Array.isArray(a.redirectUris)).toBe(true);
      expect(typeof a.isFirstParty).toBe("boolean");
    }
  });

  it("getAppByClientId finds the same app", () => {
    // V017：clientId = app.id（UUID），不再是 'lab-mgmt' 字符串
    expect(getAppByClientId(APP_IDS.lab)?.id).toBe(APP_IDS.lab);
    expect(getAppByClientId(APP_IDS.erp)?.id).toBe(APP_IDS.erp);
    expect(getAppByClientId(APP_IDS.crm)?.id).toBe(APP_IDS.crm);
    expect(getAppByClientId("nope")).toBeUndefined();
  });

  it("menus are scoped under an appId (41 total: lab 27 + erp 7 + crm 7)", () => {
    expect(menus.length).toBe(41);
    const appIds = new Set(apps.map((a) => a.id));
    for (const m of menus) expect(appIds.has(m.appId)).toBe(true);
    const byApp = { lab: 0, erp: 0, crm: 0 } as Record<string, number>;
    for (const m of menus) {
      if (m.appId === APP_IDS.lab) byApp.lab++;
      else if (m.appId === APP_IDS.erp) byApp.erp++;
      else if (m.appId === APP_IDS.crm) byApp.crm++;
    }
    expect(byApp).toEqual({ lab: 27, erp: 7, crm: 7 });
  });

  it("menu parentIds reference other menus in the same app", () => {
    for (const m of menus) {
      if (m.parentId) {
        const parent = menus.find((x) => x.id === m.parentId);
        expect(parent, `menu ${m.code} has orphan parentId`).toBeDefined();
        expect(parent?.appId).toBe(m.appId);
      }
    }
  });

  it("listMenus returns only menus for the requested app", () => {
    const labMenus = listMenus(APP_IDS.lab);
    for (const m of labMenus) expect(m.appId).toBe(APP_IDS.lab);
    expect(labMenus.length).toBe(27);
  });

  it("getMenu finds by id and MENU_IDS keys are stable", () => {
    expect(MENU_IDS.iamTenants).toBe(getMenu(MENU_IDS.iamTenants)?.id);
    expect(getMenu("nope")).toBeUndefined();
  });

  it("roleMenuGrants reference existing roles and menus", () => {
    const roleIds = new Set(roles.map((r) => r.id));
    const menuIds = new Set(menus.map((m) => m.id));
    expect(roleMenuGrants.length).toBeGreaterThanOrEqual(2);
    for (const g of roleMenuGrants) {
      expect(roleIds.has(g.roleId)).toBe(true);
      for (const mid of g.menuIds) expect(menuIds.has(mid)).toBe(true);
    }
  });

  it("getRoleMenuGrant returns the role's grant or undefined", () => {
    const acmeAdmin = getRoleMenuGrant(ROLE_IDS.acmeAdmin);
    expect(acmeAdmin).toBeDefined();
    expect(acmeAdmin?.menuIds.length).toBeGreaterThan(0);
    expect(getRoleMenuGrant("does-not-exist")).toBeUndefined();
  });
});

// === M99.F03 — src/seeds/ JSON-per-table structure ===
describe("M99.F03 seeds/ JSON-per-table structure (v0.4.0)", () => {
  const expectedFiles = [
    "manifest.json",
    "tenants.json",
    "roles.json",
    "users.json",
    "api-keys.json",
    "apps.json",
    "menus.json",
    "role-menu-grants.json",
    "audit-events.json",
    "memberships.json",
    "index.ts",
  ];
  for (const f of expectedFiles) {
    it(`src/seeds/${f} exists`, () => {
      expect(existsSync(resolve(SEEDS_DIR, f))).toBe(true);
    });
  }

  it("manifest.json declares 12 tables + version", () => {
    const m = JSON.parse(readFileSync(resolve(SEEDS_DIR, "manifest.json"), "utf-8"));
    expect(m.version).toBe("0.4.0");
    expect(m.tables).toHaveLength(12);
  });

  it("every JSON table is a top-level array", () => {
    const tables = ["tenants", "roles", "users", "api-keys", "apps", "menus", "role-menu-grants", "audit-events", "memberships"];
    for (const t of tables) {
      const data = JSON.parse(readFileSync(resolve(SEEDS_DIR, `${t}.json`), "utf-8"));
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    }
  });
});