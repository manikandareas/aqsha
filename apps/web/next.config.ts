import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@aqsha/shared"],
  turbopack: {
    root: path.join(currentDirectory, "../.."),
  },
};

export default nextConfig;
