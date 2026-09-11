// M99.F01 种子 parity —— msw ↔ nextjs 两份 seeds 严格镜像（2026-09-11 用户裁定升级）。
//
// 旧版对照 shared/sql/migrations/V016 SQL —— pivot（ADR-0025）后该文件不存在，
// describe.skipIf 守门静默跳过，msw 侧 5 个死文件（api-keys / audit-events /
// audit-retention-policies / permissions / role-permissions）存活到今天。
// 教训：守门不能建立在会消失的对照物上，也不能静默 skip。
//
// 新不变量：两仓 seeds 目录的 JSON 文件集合严格相等，且等于 DB 真实种子表集合
// （saas_dev 2026-09-11 查证：tenant/oauth_client/sys_user/sys_role/sys_menu/
//  sys_role_menu/tenant_member —— 见 nextjs scripts/seed-db.mjs 的读取清单）；
// 每个 JSON 内容深度相等。单边增删文件或改内容立刻红。
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MSW_SEEDS = resolve(import.meta.dirname, "../src/seeds");
const NEXTJS_SEEDS = resolve(
  import.meta.dirname,
  "../../saas-identity-platform-nextjs/src/seeds",
);

/** DB 真实种子表对应的 JSON 文件集合（不含 manifest.json 元数据）。 */
const EXPECTED_TABLES = [
  "apps.json",
  "memberships.json",
  "menus.json",
  "role-menu-grants.json",
  "roles.json",
  "tenants.json",
  "users.json",
];

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) throw new Error(`seeds 目录不存在: ${dir}`);
  return readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "manifest.json").sort();
}

describe("M99.F01 种子 parity — msw ↔ nextjs 严格镜像（= DB 种子表集合）", () => {
  it("msw 文件集合 = nextjs 文件集合 = DB 种子表集合（单边增删立刻红）", () => {
    const msw = jsonFiles(MSW_SEEDS);
    const nextjs = jsonFiles(NEXTJS_SEEDS);
    expect(msw).toEqual(EXPECTED_TABLES);
    expect(nextjs).toEqual(EXPECTED_TABLES);
  });

  for (const file of EXPECTED_TABLES) {
    it(`${file}：两仓内容深度相等（同一份 alice 必须是同一个 UUID）`, () => {
      const a = JSON.parse(readFileSync(resolve(MSW_SEEDS, file), "utf-8"));
      const b = JSON.parse(readFileSync(resolve(NEXTJS_SEEDS, file), "utf-8"));
      expect(a).toEqual(b);
    });
  }
});
