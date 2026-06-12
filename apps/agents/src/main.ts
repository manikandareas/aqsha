import { serve } from "@hono/node-server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { loadConfig } from "./config";
import { RunManager } from "./runs/runManager";
import { sdkQueryRunner } from "./runs/sdkRunner";
import { createApp } from "./server";
import { ConvexStore, SERVICE_FUNCTIONS, type ConvexCaller } from "./store/convexStore";
import { MemoryStore } from "./store/memoryStore";
import type { AgentStore } from "./store/types";

// Service entrypoint. Storage backend is env-selected: memory for dev/spikes,
// convex once the first-party agent/service endpoints exist (plan Phase 1).

function functionReference(path: string): unknown {
  // "agent/service:getThread" → anyApi.agent.service.getThread
  const [modulePath, functionName] = path.split(":");
  let ref: Record<string, never> = anyApi as never;
  for (const segment of (modulePath ?? "").split("/")) {
    ref = ref[segment] as never;
  }
  return ref[functionName ?? ""];
}

function buildConvexCaller(convexUrl: string): ConvexCaller {
  const client = new ConvexHttpClient(convexUrl);
  return {
    query: (path, args) => client.query(functionReference(path) as never, args as never),
    mutation: (path, args) =>
      client.mutation(functionReference(path) as never, args as never),
    action: (path, args) =>
      client.action(functionReference(path) as never, args as never),
  };
}

function buildStore(): AgentStore {
  const config = loadConfig();
  if (config.storeBackend === "convex") {
    if (!config.convexUrl || !config.serviceToken) {
      throw new Error(
        "AGENTS_STORE=convex requires CONVEX_URL and AGENTS_SERVICE_TOKEN",
      );
    }
    return new ConvexStore(buildConvexCaller(config.convexUrl), config.serviceToken);
  }
  return new MemoryStore();
}

const config = loadConfig();
const store = buildStore();
const runManager = new RunManager({ store, config, runner: sdkQueryRunner });
const app = createApp({ config, store, runManager });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `aqsha agents service listening on :${info.port} (store=${config.storeBackend}, functions contract: ${Object.keys(SERVICE_FUNCTIONS).length} endpoints)`,
  );
});
