// MSW v2 browser worker setup helper.
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers-array";

export function setupBrowserMocks() {
  const worker = setupWorker(...handlers);
  return worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
}