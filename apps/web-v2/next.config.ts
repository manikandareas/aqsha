import type { NextConfig } from "next";
import path from "node:path";

// Agent Astra (eve) = app TERPISAH `@aqsha/agent-v2` (`eve dev`/`eve start`). web-v2 = pure
// consumer: proxy same-origin `/eve/v1/*` → origin agent-v2 supaya `useEveAgent` tetap
// same-origin (TANPA CORS; eve tak punya CORS bawaan) dan bearer Clerk diteruskan apa adanya.
//
// Proxy `/eve/v1/*` ADA DI Route Handler streaming (`app/eve/v1/[...path]/route.ts`), BUKAN
// `rewrites()`: rewrites menahan stream long-lived (turn in-flight) → progres beku, boundary
// `session.waiting` tak sampai (token resume hilang → HITL tak bisa dijawab), resume nav-balik macet.

// Base disalin dari apps/web; DROP redirects V1 + @aqsha/convex.
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  reactCompiler: true,
  transpilePackages: ["@aqsha/ui", "@aqsha/api-v2"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
