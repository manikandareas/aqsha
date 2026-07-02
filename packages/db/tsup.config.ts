import { defineConfig } from "tsup";

/**
 * Dist build untuk @aqsha/db (Slice 6.2, keputusan D-E).
 *
 * KENAPA: konsumen dist (`apps/api` + `apps/agent`, runtime Mastra) meng-import paket ini
 * sebagai build `dist/` — resolusi Node/ESM menolak impor relatif tanpa ekstensi
 * (`./client` → ERR_MODULE_NOT_FOUND), sedangkan `@aqsha/db` src pakai impor relatif tanpa
 * ekstensi di mana-mana. tsup meng-emit ESM ber-ekstensi yang aman di-resolve.
 *
 * Test (bun) tetap baca `src` lewat exports condition `bun`/`types`.
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
