import * as Sentry from "@sentry/bun";
import { AppError, parseSampleRate } from "@aqsha/db";

/**
 * Sentry bootstrap shared by the api server + the BullMQ worker (both run under Bun, same image,
 * same `aqsha-api` Sentry project). The two are told apart by the `process` tag (`api` | `worker`).
 *
 * Init happens ONLY at a process entry (`initSentry` from server.ts / workers/index.ts), never at
 * module import — so importing the app in tests or type-importing it from web pulls in no live SDK.
 * With `SENTRY_DSN_API` unset the SDK stays disabled and every capture is a silent no-op.
 *
 * Release = `SENTRY_RELEASE` (= `GIT_COMMIT`, baked into the image) so errors tie back to a commit.
 * `@sentry/bun` auto-captures uncaught exceptions / unhandled rejections; the explicit captures
 * (Elysia `onError`, BullMQ `failed`) cover errors those framework layers swallow before the process
 * handlers see them.
 */
let initialized = false;

export function initSentry(fallbackProcess: "api" | "worker"): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN_API;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    release: process.env.SENTRY_RELEASE ?? process.env.GIT_COMMIT,
    // Shared clamp (@aqsha/db): invalid / NaN / <0 / >1 → 0, so a bad env never silently raises
    // ingest beyond the free-tier budget. Server tracing stays low/off; LLM spans belong to Langfuse.
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    // Structured application logs (Sentry Logs) — the api/worker Pino facade bridges SELECTED records
    // (warn/error + allow-listed notable info) via `./log.ts`. No-op until a DSN is present.
    enableLogs: true,
    // Never attach request headers / cookies / IP automatically — the log/exception context we send is
    // hand-picked and redacted (see `./sentry-log-bridge.ts` + Pino redact).
    sendDefaultPii: false,
    initialScope: { tags: { process: process.env.AQSHA_PROCESS ?? fallbackProcess } },
    // Safety net: expected domain errors (AppError) and any handled 4xx are breadcrumbs, not
    // incidents. Call sites already avoid capturing these; this also drops any that slip through
    // an uncaught path.
    beforeSend(event, hint) {
      const err = hint?.originalException;
      if (err instanceof AppError && err.status < 500) return null;
      return event;
    },
    // Defense-in-depth on the logs pipeline: never let a debug/trace record reach Sentry even if a
    // future call site slips one through. The bridge already filters by severity; this is the SDK-level
    // backstop that keeps the logs budget spent only on warn/error + notable info.
    beforeSendLog(log) {
      if (log.level === "debug" || log.level === "trace") return null;
      return log;
    },
  });
  initialized = true;
}

/**
 * Report an unexpected error with correlation context (requestId to jump error ↔ log, plus any
 * queue/job fields). No-op until `initSentry` has run with a DSN. `requestId` is promoted to a tag
 * so it's searchable in Sentry.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const requestId = typeof context?.requestId === "string" ? context.requestId : undefined;
  Sentry.captureException(error, {
    ...(requestId ? { tags: { requestId } } : {}),
    ...(context ? { extra: context } : {}),
  });
}
