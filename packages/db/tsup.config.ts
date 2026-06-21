import { defineConfig } from "tsup";

/**
 * Dist build untuk @aqsha/db (Slice 6.2, keputusan D-E).
 *
 * KENAPA: proses eve jalan di Node v25 (`eve dev/start` spawn via `process.execPath`),
 * BUKAN bun. Node v25 menolak impor relatif tanpa ekstensi (`./client` → ERR_MODULE_NOT_FOUND).
 * `@aqsha/db` src pakai impor relatif tanpa ekstensi di mana-mana → tak bisa di-`import`
 * langsung dari proses eve meski di-externalize. tsup meng-emit ESM ber-ekstensi yang
 * di-resolve Node, di-`externalDependencies` di `agent/agent.ts`.
 *
 * api-v2 (bun) + test (bun) tetap baca `src` lewat exports condition `bun`/`types`.
 */
export default defineConfig({
  entry: ["src/index.ts", "src/schema/index.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node22",
  splitting: true,
  clean: true,
  dts: false,
  sourcemap: false,
  // npm deps (drizzle-orm, postgres) di-external otomatis dari `dependencies`.
});
