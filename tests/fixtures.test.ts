// Cross-frontend fixture consistency tests.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  tenants,
  users,
  roles,
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
    expect(t?.tenantKey).toBe("acme");
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

  // 2026-09-11 与 DB 对齐：api-keys / audit-events 域整体删除（b749c18 契约下线 + DB 无表）

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
    // 2026-09-11 B 方案（ADR-0030 REQ-2026-001）：+saas-console（first-party client，登录页 clientId 兜底）
    expect(apps.length).toBe(4);
    expect(apps.map((a) => a.id).sort()).toEqual(
      [APP_IDS.crm, APP_IDS.erp, APP_IDS.lab, APP_IDS.saas].sort(),
    );
    for (const a of apps) {
      expect((a as { tenantId?: unknown }).tenantId).toBeUndefined();
      // 2026-08-29: app id 收敛为 canonical UUID（shared V016），与 PG 逐字相同
      // 语义仍可读：11111111-…-1111/1112/1113/1114 分别是 lab / erp / crm / saas-console
      expect(a.id).toMatch(/^11111111-1111-1111-1111-11111111111[1234]$/);
    }
  });

  it("getApp finds by id and APP_IDS keys are stable", () => {
    expect(APP_IDS.lab).toBe(getApp(APP_IDS.lab)?.id);
    expect(APP_IDS.erp).toBe(getApp(APP_IDS.erp)?.id);
    expect(APP_IDS.crm).toBe(getApp(APP_IDS.crm)?.id);
    expect(getApp("nope")).toBeUndefined();
  });

  // 2026-09-12 OAuthClient 收敛：旧 code/name 键已删除，clientId 即业务 code
  it("apps 行是纯 OAuthClient + 展示扩展形状（无 code/name 旧键）", () => {
    for (const a of apps) {
      expect((a as unknown as Record<string, unknown>).code).toBeUndefined();
      expect((a as unknown as Record<string, unknown>).name).toBeUndefined();
      expect(typeof a.clientId).toBe("string");
      expect((a.clientId as string).length).toBeGreaterThan(0);
      expect(typeof a.clientName).toBe("string");
      expect((a.clientName as string).length).toBeGreaterThan(0);
      expect(typeof a.status).toBe("number");
      // 仍有效的旧断言（原「apps carry OAuth client fields」段补回）
      expect(Array.isArray(a.redirectUris)).toBe(true);
      expect(typeof a.isFirstParty).toBe("boolean");
    }
    // clientId = code 形字面值（lab-management / erp / crm / saas-console）
    const codes = apps.map((a) => a.clientId).sort();
    expect(codes).toEqual(["crm", "erp", "lab-management", "saas-console"]);
  });

  it("getAppByClientId finds the same app", () => {
    // ADR-0032 D4：clientId = code 形（lab-management / erp / crm）
    expect(getAppByClientId("lab-management")?.id).toBe(APP_IDS.lab);
    expect(getAppByClientId("erp")?.id).toBe(APP_IDS.erp);
    expect(getAppByClientId("crm")?.id).toBe(APP_IDS.crm);
    expect(getAppByClientId("nope")).toBeUndefined();
  });

  it("menus are scoped under an appId (41 total: lab 27 + erp 7 + crm 7)", () => {
    expect(menus.length).toBe(41);
    const appIds = new Set(apps.map((a) => a.id));
    for (const m of menus) expect(appIds.has(m.clientId)).toBe(true);
    const byApp = { lab: 0, erp: 0, crm: 0 } as Record<string, number>;
    for (const m of menus) {
      if (m.clientId === APP_IDS.lab) byApp.lab++;
      else if (m.clientId === APP_IDS.erp) byApp.erp++;
      else if (m.clientId === APP_IDS.crm) byApp.crm++;
    }
    expect(byApp).toEqual({ lab: 27, erp: 7, crm: 7 });
  });

  it("menu parentIds reference other menus in the same app", () => {
    for (const m of menus) {
      if (m.parentId) {
        const parent = menus.find((x) => x.id === m.parentId);
        expect(parent, `menu ${m.title} has orphan parentId`).toBeDefined();
        expect(parent?.clientId).toBe(m.clientId);
      }
    }
  });

  it("listMenus returns only menus for the requested app", () => {
    const labMenus = listMenus(APP_IDS.lab);
    for (const m of labMenus) expect(m.clientId).toBe(APP_IDS.lab);
    expect(labMenus.length).toBe(27);
  });

  it("getMenu finds by id and MENU_IDS keys are stable", () => {
    // 2026-09-11 契约对齐：code 删除，键按 path 派生；旧 iamTenants 是退化断言（双侧恒 undefined）
    const firstKey = Object.keys(MENU_IDS)[0];
    expect(firstKey).toBeTruthy();
    expect(MENU_IDS[firstKey]).toBe(getMenu(MENU_IDS[firstKey])?.id);
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
  // 2026-09-11 与 DB 对齐：7 张种子表（tenant/oauth_client/sys_user/sys_role/sys_menu/sys_role_menu/tenant_member）
  const expectedFiles = [
    "manifest.json",
    "tenant.json",
    "sys_role.json",
    "sys_user.json",
    "oauth_client.json",
    "sys_menu.json",
    "sys_role_menu.json",
    "tenant_member.json",
    "index.ts",
  ];
  for (const f of expectedFiles) {
    it(`src/seeds/${f} exists`, () => {
      expect(existsSync(resolve(SEEDS_DIR, f))).toBe(true);
    });
  }

  it("manifest.json declares 7 tables + version", () => {
    const m = JSON.parse(readFileSync(resolve(SEEDS_DIR, "manifest.json"), "utf-8"));
    expect(m.version).toBe("0.4.0");
    expect(m.tables).toHaveLength(7);
  });

  it("every JSON table is a top-level array", () => {
    const tables = ["tenant", "sys_role", "sys_user", "oauth_client", "sys_menu", "sys_role_menu", "tenant_member"];
    for (const t of tables) {
      const data = JSON.parse(readFileSync(resolve(SEEDS_DIR, `${t}.json`), "utf-8"));
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    }
  });
});