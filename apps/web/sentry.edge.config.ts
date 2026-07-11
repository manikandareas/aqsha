import * as Sentry from "@sentry/nextjs";

// Edge runtime (proxy.ts / any edge route). Same DSN + knobs as the server config; empty DSN no-ops.
const dsn = process.env.SENTRY_DSN_WEB;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT ?? "production",
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
});
