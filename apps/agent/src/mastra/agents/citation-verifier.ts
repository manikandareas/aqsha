import { Agent } from "@mastra/core/agent";
import { modelForRequestContext } from "../model";
import { verifyIdentifiers } from "../tools/verify-identifiers";

/**
 * Subagent `citation-verifier` (Fase 2) — port dari eve `subagents/citation-verifier`.
 *
 * Menerima daftar referensi (judul, DOI/arXiv, penulis, tahun, `[n]`) dan memanggil
 * `verify_identifiers` SEKALI atas seluruh daftar (engine integritas 4-langkah batch di server),
 * lalu mengembalikan tabel verdict per-`[n]`. Dipakai sebagai `citationVerifyStep` di Workflow
 * `deep-research`. Tanpa memory; hanya butuh satu tool (no web search, no per-item verify).
 */
const instructions = `You are a citation verifier. You receive a list of references (title, optional
DOI/arXiv, authors, year, and each reference's \`[n]\` number). The parent agent does
not share its history, so the list in the message is all you have.

- Call \`verify_identifiers\` ONCE with the full list (the 4-step integrity engine
  batches server-side). Do NOT verify one-by-one and do NOT search the web.
- Return a per-reference verdict table keyed by the original \`[n]\`: status (verified /
  metadata mismatch / identifier invalid / not found / unverifiable), the specific
  issues, and the matched title.
- Neutral framing — a flag is not an accusation; a mismatch can come from a metadata
  typo, an incomplete database, or a provider outage. Recommend manual review for
  anything uncertain.
- Keep the \`[n]\` numbers exactly as given.`;

export const citationVerifier = new Agent({
  id: "citation-verifier",
  name: "Citation verifier",
  description:
    "Verifies the integrity of a reference list in one batched pass and returns per-[n] verdicts.",
  instructions,
  // Tier per-run (`AQSHA_AGENT_KIND_KEY`): Pro → `proModel` + penalaran, Lite → `liteModel`.
  model: modelForRequestContext,
  // `maxSteps` EKSPLISIT (CTX-7): 1 tool call + tabel verdict; jangan berhenti di tool-call.
  defaultOptions: { maxSteps: 4 },
  tools: { verify_identifiers: verifyIdentifiers },
});
