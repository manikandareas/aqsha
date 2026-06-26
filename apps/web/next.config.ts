import type { NextConfig } from "next";
import path from "node:path";

// Agent Astra (eve) = app TERPISAH `@aqsha/agent` (`eve dev`/`eve start`). web = pure
// consumer: proxy same-origin `/eve/v1/*` → origin agent supaya `useEveAgent` tetap
// same-origin (TANPA CORS; eve tak punya CORS bawaan) dan bearer Clerk diteruskan apa adanya.
//
// Proxy `/eve/v1/*` ADA DI Route Handler streaming (`app/eve/v1/[...path]/route.ts`), BUKAN
// `rewrites()`: rewrites menahan stream long-lived (turn in-flight) → progres beku, boundary
// `session.waiting` tak sampai (token resume hilang → HITL tak bisa dijawab), resume nav-balik macet.

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  reactCompiler: true,
  transpilePackages: ["@aqsha/ui", "@aqsha/api"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
