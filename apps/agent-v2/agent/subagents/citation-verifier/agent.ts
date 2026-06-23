import { defineAgent } from "eve";
import { liteModel } from "../../lib/model.ts";

/**
 * Subagent `citation-verifier` (Slice 7.2) — declared subagent (inherit NOTHING dari
 * root). Verifikasi daftar referensi via integrity engine; sengaja LEBIH SEMPIT dari
 * literature/counter — hanya tool verify (tak search web). `build.externalDependencies`
 * root berlaku GLOBAL → tool re-export yang mengimpor `@aqsha/services` tetap
 * ter-externalize. Model + escape hatch context-window dari `lib/model.ts` (sama root).
 *
 * Delegasi: parent men-`message` daftar referensi (title/identifier/[n]) + set
 * `outputSchema` (mode task) agar tabel verdict balik terstruktur.
 */
export default defineAgent({
  description:
    "Verifies a list of collected references (existence, metadata consistency, DOI/arXiv validity) without needing a finished document. Run ONE instance over the whole reference list.",
  ...liteModel,
});
