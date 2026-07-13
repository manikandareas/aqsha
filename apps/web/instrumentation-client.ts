import * as Sentry from "@sentry/nextjs";

// Client-side (browser). DSN is baked at build from NEXT_PUBLIC_SENTRY_DSN; empty = SDK no-op.
// `environment` uses NODE_ENV (inlined at build: "production" in prod images). Release is injected by
// the Sentry bundler plugin. Session Replay is OFF and tracing is 0 to conserve the free-tier quota;
// raise deliberately if you later want web performance/replay.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
});

// Instruments client-side navigations (only emits when tracing is enabled; harmless otherwise).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
