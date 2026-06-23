import { defineAgent } from "eve";
import { liteModel } from "./lib/model.ts";

/**
 * Astra (Aqsha V2 Fase 6). Model statis per-agent — invarian eve: tidak ada
 * tier per-turn, satu agent = satu model. Model + escape hatch context-window
 * dari `lib/model.ts` (dibagi dengan subagent).
 */
export default defineAgent({
  ...liteModel,
  // D-E (Slice 6.2): proses eve (Node v25) meng-`import` kode service ASLI in-process.
  // `externalDependencies` membuat eve (1) MEMBIARKAN impor ini external saat meng-compile
  // modul authored (tools/channels/hooks) — tak di-inline Rolldown → dep transitif tak
  // ikut bundle; (2) men-trace paket ke output build hosted (`server/node_modules`). Node
  // me-resolve `@aqsha/services`/`@aqsha/db` via exports condition `node` → `dist/*.js`.
  build: {
    externalDependencies: ["@aqsha/services", "@aqsha/db"],
  },
});
