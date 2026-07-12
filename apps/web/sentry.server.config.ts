import * as Sentry from "@sentry/nextjs";

// Server-side (Node runtime: Server Components, route handlers, the /mastra-api proxy). DSN comes
// from the container env at runtime (SENTRY_DSN_WEB); empty = SDK disabled (no-op, no network).
// Release is injected by the Sentry bundler plugin (withSentryConfig → SENTRY_RELEASE). Tracing is
// off by default — bump SENTRY_TRACES_SAMPLE_RATE only within the free-tier quota.
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
