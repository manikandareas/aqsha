import * as Sentry from "@sentry/bun";
import { AppError } from "@aqsha/db";

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
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    initialScope: { tags: { process: process.env.AQSHA_PROCESS ?? fallbackProcess } },
    // Safety net: expected domain errors (AppError) and any handled 4xx are breadcrumbs, not
    // incidents. Call sites already avoid capturing these; this also drops any that slip through
    // an uncaught path.
    beforeSend(event, hint) {
      const err = hint?.originalException;
      if (err instanceof AppError && err.status < 500) return null;
      return event;
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
