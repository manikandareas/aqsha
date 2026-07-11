import { withSentryConfig } from "@sentry/nextjs";
import { withContentCollections } from "@content-collections/next";
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  reactCompiler: true,
  transpilePackages: ["@aqsha/ui", "@aqsha/api"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

// withContentCollections menjalankan generate saat `next dev`/`next build`
// (lapisan Next config, bukan webpack plugin → aman dgn Turbopack). Cast krn
// return type-nya belum persis NextConfig di Next 16.
const withCC = withContentCollections(nextConfig) as NextConfig;

// Sentry build plugin: only wrap when Sentry is actually configured (client DSN or an upload token
// present at build). Otherwise the build path is untouched — no plugin, no behaviour change — so the
// default (Sentry-less) build stays exactly as before until the owner opts in via the CI build vars.
// When active it bakes the client SDK + (with SENTRY_AUTH_TOKEN) uploads & deletes source maps so
// traces symbolicate; release = SENTRY_RELEASE (= GIT_COMMIT, baked in the Dockerfile).
const sentryConfigured = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_AUTH_TOKEN,
);

export default sentryConfigured
  ? withSentryConfig(withCC, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT_WEB,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.SENTRY_RELEASE },
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      silent: !process.env.CI,
      disableLogger: true,
    })
  : withCC;
