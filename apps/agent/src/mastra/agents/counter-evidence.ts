import { Agent } from "@mastra/core/agent";
import { modelForRequestContext } from "../model";
import { lookupDoi } from "../tools/lookup-doi";
import { searchArxiv } from "../tools/search-arxiv";
import { searchPapers } from "../tools/search-papers";
import { searchThreadDocuments } from "../tools/search-thread-documents";
import { searchWeb } from "../tools/search-web";

/**
 * Subagent `counter-evidence` (Fase 2) — port dari eve `subagents/counter-evidence`.
 *
 * Menerima inventaris bukti yang kesimpulannya sedang terbentuk dan mencari SPESIFIK bukti yang
 * melemahkan/menentangnya (replikasi gagal, studi bertentangan, kritik metodologis, retraksi).
 * Dipakai sebagai `counterEvidenceStep` di Workflow `deep-research`. REUSE tool riset root; tanpa
 * memory/billing-processor (deep-run di-bill sekali di plan-gate).
 */
const instructions = `You are a counter-evidence researcher. You receive an evidence inventory whose
conclusions are emerging (the parent agent does not share its history, so the inventory
in the message is all you have).

- Search SPECIFICALLY for evidence that WEAKENS or contradicts those conclusions: failed
  replications, contradicting studies, methodological critiques, retractions, dissenting
  reviews. Prefer primary sources and systematic reviews; weight preprints lower and flag
  them.
- Limit yourself to ~3 search rounds; stop when disconfirming evidence saturates.
- For each finding return: title, identifier (DOI / arXiv / URL), the \`[n]\` citation
  number from the tool result, a 2-4 sentence extract of HOW it cuts against the
  conclusion, and a strength rating (strong / medium / weak).
- Report honestly when you find none — the absence of rebuttal is itself a result. Never
  fabricate opposition.
- Only report sources that came from tool results; keep the \`[n]\` numbers exactly; never
  invent identifiers.`;

export const counterEvidence = new Agent({
  id: "counter-evidence",
  name: "Counter-evidence researcher",
  description:
    "Searches for evidence that weakens or contradicts the emerging conclusions of a research inventory.",
  instructions,
  // Tier per-run (`AQSHA_AGENT_KIND_KEY`): Pro → `proModel` + penalaran, Lite → `liteModel`.
  model: modelForRequestContext,
  tools: {
    search_web: searchWeb,
    search_arxiv: searchArxiv,
    search_papers: searchPapers,
    lookup_doi: lookupDoi,
    search_thread_documents: searchThreadDocuments,
  },
});
