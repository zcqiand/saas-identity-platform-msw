// MSW v2 Node interceptor setup — for vitest in frontends.
import { setupServer } from "msw/node";
import { handlers } from "./handlers-array";

export function setupNodeMocks() {
  return setupServer(...handlers);
}