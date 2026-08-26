import { defineConfig } from "vitest/config";
import FnReporter from "./tests/fnReporter";

export default defineConfig({
  // esbuild 默认对 .ts 文件输出 CJS（含 `exports` / `require`），
  // 但 package.json "type": "module" 把 .js 当 ESM，导致
  // `ReferenceError: exports is not defined`。强制 ESM 后 transform 输出 ESM。
  esbuild: {
    format: "esm",
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10000,
    reporters: ["default", new FnReporter() as any],
  },
});