// M99.F01 种子 parity —— msw JSON 必须与 shared 的 V016 SQL 逐 ID 一致。
//
// 这是防止「四套 ID 体系」重演的那道门（见 shared/sql/migrations/V016 文件头）。
// SQL 是真源（2026-08-29 用户裁定），msw 跟随；任一侧单独改 ID 立刻红。
//
// 只比 **ID 集合**，不比字段内容：内容差异由各自的业务测试管，
// 这里管的是「同一个 alice 在 msw 和 PG 里是不是同一个 UUID」。
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  apiKeys,
  apps,
  auditEvents,
  memberships,
  menus,
  roleMenuGrants,
  roles,
  tenants,
  users,
} from "../src/fixtures/seed";

const V016 = resolve(
  import.meta.dirname,
  "../../saas-identity-platform-shared/sql/migrations/V016__seed_family_fixtures.sql",
);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** 取 V016 里某个 INSERT 段落内出现的全部 UUID。 */
function idsInSection(sql: string, table: string): Set<string> {
  const start = sql.indexOf(`INSERT INTO ${table} (`);
  if (start < 0) throw new Error(`V016 里找不到 INSERT INTO ${table}`);
  const end = sql.indexOf("INSERT INTO ", start + 1);
  const body = sql.slice(start, end < 0 ? undefined : end);
  return new Set((body.match(UUID) ?? []).map((s) => s.toLowerCase()));
}

const sql = existsSync(V016) ? readFileSync(V016, "utf-8") : null;

describe.skipIf(!sql)("M99.F01 种子 parity — msw JSON ↔ shared V016 SQL", () => {
  const s = sql as string;

  // 每张表：msw 侧的主键集合必须是 SQL 侧该段落 UUID 的子集。
  // 用子集而非相等，是因为 SQL 段落里还含外键（如 users 段里有 tenant_id / role_ids）。
  const cases: Array<[string, string, string[]]> = [
    ["tenants", "tenants", tenants.map((t) => t.id)],
    ["roles", "roles", roles.map((r) => r.id)],
    ["users", "users", users.map((u) => u.id)],
    ["memberships", "tenant_memberships", memberships.map((m) => m.id)],
    ["api_keys", "api_keys", apiKeys.map((k) => k.id)],
    ["audit_events", "audit_events", auditEvents.map((e) => e.id)],
    ["apps", "apps", apps.map((a) => a.id)],
    ["menus", "menus", menus.map((m) => m.id)],
  ];

  for (const [label, table, mswIds] of cases) {
    it(`${label}: msw 的每个 id 都出现在 V016 的 ${table} 段`, () => {
      const sqlIds = idsInSection(s, table);
      const missing = mswIds.filter((id) => !sqlIds.has(id.toLowerCase()));
      expect(
        missing,
        `msw ${label} 有 ${missing.length} 个 id 不在 V016 里：${missing.slice(0, 5).join(", ")}\n` +
          `SQL 是真源 —— 要么改 V016，要么把 msw 的 id 改回去。`,
      ).toEqual([]);
    });
  }

  it("role_menu_grants: 授权引用的 menu id 全部存在于 menus", () => {
    const known = new Set(menus.map((m) => m.id));
    for (const g of roleMenuGrants) {
      const dangling = g.menuIds.filter((id) => !known.has(id));
      expect(dangling, `role ${g.roleId} 引用了不存在的菜单`).toEqual([]);
    }
  });

  it("所有种子主键都是合法 UUID —— 可读串会被 seed-db.mjs fail-fast 拒绝", () => {
    const all = [
      ...tenants.map((t) => t.id),
      ...roles.map((r) => r.id),
      ...users.map((u) => u.id),
      ...memberships.map((m) => m.id),
      ...apps.map((a) => a.id),
      ...menus.map((m) => m.id),
      ...apiKeys.map((k) => k.id),
      ...auditEvents.map((e) => e.id),
    ];
    const strict = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bad = all.filter((id) => !strict.test(id));
    expect(bad, `非法 UUID：${bad.slice(0, 5).join(", ")}`).toEqual([]);
  });
});
