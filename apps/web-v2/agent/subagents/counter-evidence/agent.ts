import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

/**
 * Subagent `counter-evidence` (Slice 7.1) — declared subagent (inherit NOTHING).
 * Adversarial: parent men-`message` inventaris bukti, subagent mencari bukti yang
 * MELEMAHKAN kesimpulan. Pola sama `literature-searcher`. Model OpenAI env-driven.
 */
const openai = createOpenAI(
  process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {},
);

export default defineAgent({
  description:
    "Adversarially searches for evidence AGAINST the emerging conclusions of an evidence inventory — failed/non-replications, contradicting studies, methodological critiques, retractions, dissenting reviews.",
  model: openai.chat(process.env.AQSHA_LITE_MODEL ?? "gpt-4o"),
});
