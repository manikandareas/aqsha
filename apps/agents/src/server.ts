import { Hono } from "hono";
import {
  interactionResponseSchema,
  runRequestSchema,
} from "@aqsha/agent-contracts";
import { buildCommandRegistry } from "./commands/registry";
import type { AgentsConfig } from "./config";
import type { RunManager } from "./runs/runManager";
import type { AgentStore } from "./store/types";

// HTTP surface (plan §4.2 server.ts): POST /runs, resume, cancel, the unified
// interactions.respond endpoint, the command registry, and /healthz. Inbound
// auth is the shared service token (plan §4.4).

export type ServerDeps = {
  config: AgentsConfig;
  store: AgentStore;
  runManager: RunManager;
};

export function createApp(deps: ServerDeps): Hono {
  const app = new Hono();
  const { config, store, runManager } = deps;

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.use("*", async (c, next) => {
    if (c.req.path === "/healthz") {
      return next();
    }
    if (config.allowUnauthenticated) {
      return next();
    }
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!config.serviceToken || token !== config.serviceToken) {
      return c.json({ ok: false, reason: "unauthorized" }, 401);
    }
    return next();
  });

  app.post("/runs", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = runRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { ok: false, reason: "invalid_request", issues: parsed.error.issues },
        400,
      );
    }
    const existing = await store.getRun(parsed.data.runId);
    if (existing) {
      // Idempotent retry from Convex: the run is already accepted.
      return c.json({ ok: true, runId: existing.runId, deduplicated: true }, 202);
    }
    const result = await runManager.startRun(parsed.data);
    return c.json(result, 202);
  });

  app.post("/runs/:runId/cancel", async (c) => {
    const result = await runManager.cancelRun(c.req.param("runId"));
    return c.json(result, result.ok ? 200 : 404);
  });

  app.post("/runs/:runId/resume", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      interactionId?: unknown;
    };
    if (typeof body.interactionId !== "string" || !body.interactionId) {
      return c.json({ ok: false, reason: "interaction_id_required" }, 400);
    }
    const result = await runManager.resumeRun(
      c.req.param("runId"),
      body.interactionId,
    );
    return c.json(result, result.ok ? 202 : 409);
  });

  // Unified HITL response endpoint (plan §5.3): record the response; if the
  // run already interrupted (waiting_hitl), resume it with the response.
  app.post("/interactions/:interactionId/respond", async (c) => {
    const interactionId = c.req.param("interactionId");
    const body = await c.req.json().catch(() => null);
    const parsed = interactionResponseSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { ok: false, reason: "invalid_response", issues: parsed.error.issues },
        400,
      );
    }
    const responded = await store.respondInteraction(interactionId, parsed.data);
    if (!responded) {
      return c.json({ ok: false, reason: "interaction_not_pending" }, 409);
    }
    const run = await store.getRun(responded.runId);
    let resumed = false;
    if (run && (run.status === "waiting_hitl" || run.status === "waiting")) {
      const result = await runManager.resumeRun(run.runId, interactionId);
      resumed = result.ok;
    }
    return c.json({ ok: true, interactionId, resumed });
  });

  app.get("/commands", (c) => c.json(buildCommandRegistry(config.appRoot)));

  return app;
}
