import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

/**
 * Subagent `citation-verifier` (Slice 7.2) — declared subagent (inherit NOTHING dari
 * root). Verifikasi daftar referensi via integrity engine; sengaja LEBIH SEMPIT dari
 * literature/counter — hanya tool verify (tak search web). `build.externalDependencies`
 * root berlaku GLOBAL → tool re-export yang mengimpor `@aqsha/services` tetap
 * ter-externalize. Model OpenAI sama dengan root (env-driven).
 *
 * Delegasi: parent men-`message` daftar referensi (title/identifier/[n]) + set
 * `outputSchema` (mode task) agar tabel verdict balik terstruktur.
 */
const openai = createOpenAI(
  process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {},
);

export default defineAgent({
  description:
    "Verifies a list of collected references (existence, metadata consistency, DOI/arXiv validity) without needing a finished document. Run ONE instance over the whole reference list.",
  model: openai.chat(process.env.AQSHA_LITE_MODEL ?? "gpt-4o"),
});
