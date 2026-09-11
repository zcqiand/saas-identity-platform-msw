// Wraps the MSW handler array with a stable `handlers` export for
// setupWorker(...handlers) / setupServer(...handlers).
//
// 2026-09-11 C 扫尾（用户裁定）：**orval faker 兜底全部废除**。
//
// 历史：未接 extra handler 的端点会落到 orval faker 兜底 —— 返回 200 + 随机数据
// （随机 UUID / status 巨数 / 与路径无关的 tenantId）。比 404 更有欺骗性：
// 页面「有数据」但全是假的，shape/值域断言全部失效（租户应用页状态列乱码即此根因）。
//
// 新规则：
//  1. 暴露给前端的每个端点必须在 handlers-extra.ts 里有确定性 handler（seed fixtures）；
//  2. 未覆盖的请求 → 501 NOT_MOCKED，第一次请求就炸，而不是静默放假数据；
//  3. 确需临时恢复 faker 的端点：登记进 FAKER_ALLOWED 并写理由 + 移除条件
//     （当前为空；发现 501 的正确动作是去 handlers-extra.ts 写确定性 handler）。
import { HttpResponse, http } from "msw";
import { extraHandlers } from "./handlers-extra";

// 显式 faker 白名单（当前为空）。条目格式：`${method} */api/v1/path`。
const FAKER_ALLOWED = new Set<string>([]);
void FAKER_ALLOWED;

// 兜底：所有未被 extra 覆盖的 /api/v1 请求 → 501，loudly 失败。
const notMockedHandler = http.all("*/api/v1/*", async ({ request }) => {
  return HttpResponse.json(
    {
      code: "NOT_MOCKED",
      message:
        "[saas-msw] 该端点没有确定性 handler（handlers-extra.ts）。" +
        "正确动作：接 seed fixtures，而不是让 orval faker 返回假数据。 " +
        `未匹配请求：${request.method} ${request.url}`,
    },
    { status: 501 },
  );
});

export const handlers = [...extraHandlers, notMockedHandler];
export default handlers;
