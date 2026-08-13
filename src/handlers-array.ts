// Wraps the orval-generated handlers array with a stable `handlers` export.
// orval emits `getTitleMock()` as a default factory — we wrap it for the
// conventional `handlers` symbol used by setupWorker(...handlers) and
// setupServer(...handlers).
//
// orval will write src/handlers.ts (axios client) AND src/handlers.msw.ts
// (mock handlers). After each codegen run, this file is regenerated and
// this wrapper re-imports getTitleMock. If orval renames the factory, update
// this wrapper.
import { getTitleMock } from "./handlers.msw.msw";
import { extraHandlers } from "./handlers-extra";

// Custom M07/M08/M09 handlers (deterministic fixtures) take precedence over
// orval-generated faker handlers for those routes.
export const handlers = [...extraHandlers, ...getTitleMock()];
export default handlers;