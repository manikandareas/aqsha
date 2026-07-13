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

// Sentry build plugin: only wrap when Sentry is actually configured (client DSN or an upload token
// present at build). Otherwise the build path is untouched — no plugin, no behaviour change — so the
// default (Sentry-less) build stays exactly as before until the owner opts in via the CI build vars.
// When active it bakes the client SDK + (with SENTRY_AUTH_TOKEN) uploads & deletes source maps so
// traces symbolicate; release = SENTRY_RELEASE (= GIT_COMMIT, baked in the Dockerfile).
const sentryConfigured = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_AUTH_TOKEN,
);

// Source-map upload needs the FULL trio (token + org + project); with only a token the plugin would
// try to upload with an undefined org/project and fail. Client instrumentation (above) only needs the DSN.
const sourcemapUploadEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT_WEB,
);

// withContentCollections menjalankan generate saat `next dev`/`next build` (lapisan Next config,
// bukan webpack plugin → aman dgn Turbopack). Return-nya Promise<Partial<NextConfig>>, jadi WAJIB
// di-await sebelum masuk withSentryConfig: withSentryConfig men-spread object config yang diterima,
// dan spread atas Promise yang belum resolve = {} → seluruh config user (termasuk
// `output: "standalone"` yang dibutuhkan image Docker) hilang diam-diam. Next sendiri men-support
// default export berupa async function, jadi resolve di sini.
export default async function buildConfig(): Promise<NextConfig> {
  const withCC = (await withContentCollections(nextConfig)) as NextConfig;
  if (!sentryConfigured) return withCC;
  return withSentryConfig(withCC, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT_WEB,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    release: { name: process.env.SENTRY_RELEASE },
    sourcemaps: { disable: !sourcemapUploadEnabled },
    // Route browser → Sentry ingest through a same-origin Next route so ad/tracker blockers don't
    // silently drop client error events. `/sentry-tunnel` is allow-listed in proxy.ts.
    tunnelRoute: "/sentry-tunnel",
    // Quiet locally, verbose in CI (CI=true is forwarded as a build arg in deploy.yml so it reaches
    // this build). Lets the source-map upload output show up in the CI build log.
    silent: !process.env.CI,
    disableLogger: true,
  });
}
