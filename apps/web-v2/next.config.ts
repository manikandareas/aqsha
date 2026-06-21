import type { NextConfig } from "next";
import path from "node:path";
import { withEve } from "eve/next";

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

// withEve (P6): omit `eveRoot` (agent/ ada di root web-v2 = cwd saat `next dev`).
// Inject Next rewrites yang mem-proxy /eve/v1/* ke PROSES eve terpisah
// (`eve dev --no-ui --port 0` di dev). Stream chat TIDAK lewat api-v2.
export default withEve(nextConfig);
