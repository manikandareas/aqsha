import * as Sentry from "@sentry/astro";

Sentry.init({
  dsn: import.meta.env.PUBLIC_SENTRY_DSN,
  environment: import.meta.env.PUBLIC_SENTRY_ENVIRONMENT ?? "production",
  release: import.meta.env.PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
