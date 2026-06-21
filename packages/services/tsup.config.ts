import { defineConfig } from "tsup";

/**
 * Dist build untuk @aqsha/services (Slice 6.2, keputusan D-E).
 *
 * Sama dengan @aqsha/db: proses eve = Node v25, tak bisa import raw-TS workspace pkg.
 * Emit ESM ber-ekstensi + subpath granular supaya proses eve hanya me-resolve irisan
 * yang dipakai (mis. `@aqsha/services/billing`) bukan barrel penuh.
 *
 * `@aqsha/db` + semua npm dep (drizzle-orm, ai, bullmq, ioredis, @polar-sh/sdk,
 * @aws-sdk/*, unpdf, mammoth, fast-xml-parser) di-external otomatis dari `dependencies`
 * → tak ikut ter-bundle (mitigasi bloat; di-resolve runtime via node exports condition).
 */
export default defineConfig({
  entry: [
    "src/index.ts",
    "src/chat/index.ts",
    "src/billing.service.ts",
    "src/quota/index.ts",
    "src/rag.service.ts",
    "src/research/index.ts",
    "src/artifact.service.ts",
    "src/workspace.service.ts",
    "src/context.service.ts",
  ],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node22",
  splitting: true,
  clean: true,
  dts: false,
  sourcemap: false,
  external: ["@aqsha/db"],
});
