import * as Sentry from "@sentry/nextjs";

// Next.js loads this once per server runtime. Pull in the matching Sentry init for the runtime, and
// export onRequestError so Server Component / route-handler / proxy errors reach Sentry.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
