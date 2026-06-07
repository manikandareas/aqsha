import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  reactCompiler: true,
  transpilePackages: ["@aqsha/ui", "@aqsha/convex"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  async redirects() {
    return [
      {
        // Feed merged into the unified discovery surface (feed-first default).
        source: "/app/feed",
        destination: "/app/explore?view=brief",
        permanent: false,
      },
      {
        source: "/feed",
        destination: "/app/explore?view=brief",
        permanent: false,
      },
      {
        source: "/explore",
        destination: "/app/explore",
        permanent: false,
      },
      {
        source: "/settings",
        destination: "/app/settings",
        permanent: false,
      },
      {
        source: "/settings/:path*",
        destination: "/app/settings/:path*",
        permanent: false,
      },
      {
        source: "/threads/:threadId",
        destination: "/app/threads/:threadId",
        permanent: false,
      },
      {
        source: "/workspaces",
        destination: "/app/workspaces",
        permanent: false,
      },
      {
        source: "/workspaces/:workspaceId",
        destination: "/app/workspaces/:workspaceId",
        permanent: false,
      },
      {
        source: "/workspaces/:workspaceId/artifacts/:artifactId",
        destination: "/app/workspaces/:workspaceId/artifacts/:artifactId",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
