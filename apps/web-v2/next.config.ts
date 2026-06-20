import type { NextConfig } from "next";
import path from "node:path";

// Base disalin dari apps/web; DROP redirects V1 + @aqsha/convex; TANPA withEve (eve landing P6).
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
