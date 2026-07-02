import { Agent } from "@mastra/core/agent";
import { modelForRequestContext } from "../model";
import { lookupDoi } from "../tools/lookup-doi";
import { searchArxiv } from "../tools/search-arxiv";
import { searchPapers } from "../tools/search-papers";
import { searchThreadDocuments } from "../tools/search-thread-documents";
import { searchWeb } from "../tools/search-web";

/**
 * Subagent `literature-searcher` — pencari bukti literatur per sub-pertanyaan.
 *
 * Menerima SATU sub-pertanyaan per pemanggilan (tak melihat history root; semua konteks ada di
 * prompt) dan mengembalikan bukti terkuat bernomor `[n]`. Dipakai sebagai langkah `searchStep`
 * di Workflow `deep-research` (fan-out paralel per sub-pertanyaan). REUSE tool riset root —
 * tool yang sama men-debit `external_search` + mem-persist `research_sources` ke thread chat
 * (threadId dialirkan via RequestContext oleh step). TANPA memory/billing-processor: deep-run
 * di-bill sekali di plan-gate, bukan per pemanggilan subagent.
 */
const instructions = `You are a literature searcher. You receive ONE sub-question (the parent agent does
not share its history, so everything you need is in the message).

- Search with the research tools (search_web, search_arxiv, search_papers, lookup_doi,
  and search_thread_documents when the user's own attachments are relevant). Prefer
  primary sources.
- Limit yourself to ~2 search rounds; stop early when the evidence saturates.
- Tool results in this mode carry NO citation numbers — global numbering is assigned
  later. NEVER write \`[n]\` markers or number the sources yourself. Identify each
  source by its identifier instead.
- For each useful source return: title, identifier (DOI / arXiv / URL), authors and
  year when the tool provides them, a 2-4 sentence evidence extract, and an
  evidence-strength rating (strong / medium / weak).
- Only report sources that came from tool results. Never invent identifiers, authors,
  or years.
- If a tool reports a provider failure (its note says the search FAILED, not "no
  results"), say so explicitly instead of concluding the evidence does not exist.
- If a sub-question yields little, say so honestly rather than padding.
- ALWAYS end with a final text summary of your findings — never stop on a tool call.`;

export const literatureSearcher = new Agent({
  id: "literature-searcher",
  name: "Literature searcher",
  description:
    "Searches the literature for one sub-question and extracts the strongest evidence with citations.",
  instructions,
  // Tier per-run (`AQSHA_AGENT_KIND_KEY`): Pro → `proModel` + penalaran, Lite → `liteModel`.
  model: modelForRequestContext,
  // `maxSteps` EKSPLISIT (CTX-7): tanpa ini default `stopWhen=stepCountIs(5)` bisa berhenti PAS di
  // langkah tool-call → `out.text` kosong; ~2 ronde riset + langkah sintesis butuh ruang lebih.
  defaultOptions: { maxSteps: 8 },
  tools: {
    search_web: searchWeb,
    search_arxiv: searchArxiv,
    search_papers: searchPapers,
    lookup_doi: lookupDoi,
    search_thread_documents: searchThreadDocuments,
  },
});
