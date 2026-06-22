import type { NextConfig } from "next";
import path from "node:path";

// Agent Astra (eve) kini app TERPISAH `@aqsha/agent-v2` yang jalan sebagai service
// sendiri (`eve dev`/`eve start`). web-v2 = pure consumer: rewrite same-origin
// `/eve/v1/*` → origin agent-v2 supaya `useEveAgent` tetap same-origin (TANPA CORS;
// eve tak punya CORS bawaan) dan bearer Clerk diteruskan apa adanya — channel eve
// (`agent/channels/eve.ts` di agent-v2) yang verifikasi. Server-side env (bukan
// NEXT_PUBLIC): browser tak pernah melihat origin agent-v2.
const AGENT_ORIGIN = process.env.AGENT_ORIGIN ?? "http://localhost:4317";

// Base disalin dari apps/web; DROP redirects V1 + @aqsha/convex.
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  reactCompiler: true,
  transpilePackages: ["@aqsha/ui", "@aqsha/api-v2"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  async rewrites() {
    return [{ source: "/eve/v1/:path*", destination: `${AGENT_ORIGIN}/eve/v1/:path*` }];
  },
};

export default nextConfig;
