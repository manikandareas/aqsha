import * as Sentry from "@sentry/nextjs";

// Edge runtime (proxy.ts / any edge route). Same DSN + knobs as the server config; empty DSN no-ops.
const dsn = process.env.SENTRY_DSN_WEB;

// SENTRY_TRACES_SAMPLE_RATE must be a finite number in [0,1]; anything invalid/NaN/out-of-range → 0.
const rawSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
const tracesSampleRate = Number.isFinite(rawSampleRate)
  ? Math.min(1, Math.max(0, rawSampleRate))
  : 0;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT ?? "production",
  tracesSampleRate,
});
