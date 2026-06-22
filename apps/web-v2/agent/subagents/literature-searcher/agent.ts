import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

/**
 * Subagent `literature-searcher` (Slice 7.1) — declared subagent (inherit NOTHING dari
 * root). Punya instructions + tools sendiri di bawah dir ini; `build.externalDependencies`
 * di root `agent/agent.ts` berlaku GLOBAL → tool re-export yang mengimpor `@aqsha/services`
 * tetap ter-externalize. Model OpenAI sama dengan root (env-driven).
 *
 * Delegasi: parent men-`message` SATU sub-pertanyaan + set `outputSchema` (mode task) agar
 * temuan balik terstruktur. Subagent TIDAK melihat history parent.
 */
const openai = createOpenAI(
  process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {},
);

export default defineAgent({
  description:
    "Searches the literature for one sub-question and extracts the strongest evidence with citations. Run one per sub-question; independent sub-questions may run in parallel.",
  model: openai.chat(process.env.AQSHA_LITE_MODEL ?? "gpt-4o"),
});
