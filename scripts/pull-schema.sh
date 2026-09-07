#!/usr/bin/env bash
# scripts/pull-schema.sh — drizzle-kit pull 从真库反推 src/db/schema.ts（DB-First, ADR-0025）
#
# 设计：
# - msw 是 mock 后端（B 强度无持久化，ADR-0012），不持久化任何数据
# - 但 schema.ts 给 handler / seed fixture 提供 PG column 类型（type-only）
# - shared 仓 schema-first 是真源；msw 拉 TS schema 给 mock 层用
# - 与 nextjs pull-schema.sh 同套：pull → move drizzle/schema.ts → src/db/schema.ts → cleanup
#
# 用法：
#   bash scripts/pull-schema.sh                       # default saas_dev @ 100.79.128.25
#   PG_DATABASE=saas_test bash scripts/pull-schema.sh
#
# 退出码：
#   0 — pulled OK + 与 git HEAD 一致
#   1 — pull 失败 或 与 git HEAD 有 diff

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

SCHEMA_FILE="src/db/schema.ts"
PULL_OUT_DIR="drizzle"

echo "[pull-schema] step 1/4 — drizzle-kit pull → ${PULL_OUT_DIR}/schema.ts"
PG_HOST="${PG_HOST:-100.79.128.25}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-}"
PG_DATABASE="${PG_DATABASE:-saas_dev}"
export PG_HOST PG_PORT PG_USER PG_PASSWORD PG_DATABASE

if [ -z "$PG_PASSWORD" ]; then
  echo "[pull-schema] FATAL: PG_PASSWORD 未设" >&2
  exit 1
fi

rm -rf "$PULL_OUT_DIR"

npx --no drizzle-kit pull --config drizzle.config.ts

if [ ! -f "${PULL_OUT_DIR}/schema.ts" ]; then
  echo "[pull-schema] FATAL: ${PULL_OUT_DIR}/schema.ts 未生成" >&2
  exit 1
fi

echo "[pull-schema] step 2/4 — move ${PULL_OUT_DIR}/schema.ts → ${SCHEMA_FILE}"
mkdir -p "$(dirname "$SCHEMA_FILE")"
mv "${PULL_OUT_DIR}/schema.ts" "${SCHEMA_FILE}"

echo "[pull-schema] step 3/4 — cleanup ${PULL_OUT_DIR}/ + relations.ts"
rm -rf "$PULL_OUT_DIR"

echo "[pull-schema] step 4/4 — drift detection: git diff ${SCHEMA_FILE}"
if ! git diff --exit-code --quiet "${SCHEMA_FILE}" 2>/dev/null; then
  echo "[pull-schema] FATAL: ${SCHEMA_FILE} 与 git HEAD 不一致" >&2
  echo "[pull-schema]        漂移来源：" >&2
  git diff --stat "${SCHEMA_FILE}" >&2
  echo "[pull-schema]        处理：确认 DB 是最新（shared 已 db:migrate），然后 git add ${SCHEMA_FILE} && git commit" >&2
  exit 1
fi

echo "[pull-schema] OK"
echo "[pull-schema]    ${SCHEMA_FILE} 与 git HEAD 一致；DB-First sync 绿"
