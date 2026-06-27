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
export default withContentCollections(nextConfig) as NextConfig;
