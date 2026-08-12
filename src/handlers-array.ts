// Wraps the orval-generated handlers array with a stable `handlers` export.
// orval emits `getTitleMock()` as a default factory — we wrap it for the
// conventional `handlers` symbol used by setupWorker(...handlers) and
// setupServer(...handlers).
//
// orval will write src/handlers.ts (axios client) AND src/handlers.msw.ts
// (mock handlers). After each codegen run, this file is regenerated and
// this wrapper re-imports getTitleMock. If orval renames the factory, update
// this wrapper.
import { getTitleMock } from "./handlers.msw";

export const handlers = getTitleMock();
export default handlers;