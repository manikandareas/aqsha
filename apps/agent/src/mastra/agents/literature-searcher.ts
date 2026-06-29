import { Agent } from "@mastra/core/agent";
import { modelForRequestContext } from "../model";
import { lookupDoi } from "../tools/lookup-doi";
import { searchArxiv } from "../tools/search-arxiv";
import { searchPapers } from "../tools/search-papers";
import { searchThreadDocuments } from "../tools/search-thread-documents";
import { searchWeb } from "../tools/search-web";

/**
 * Subagent `literature-searcher` (Fase 2) — port dari eve `subagents/literature-searcher`.
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
- For each useful source return: title, identifier (DOI / arXiv / URL), the citation
  number \`[n]\` from the tool result, a 2-4 sentence evidence extract, and an
  evidence-strength rating (strong / medium / weak).
- Only report sources that came from tool results. Never invent identifiers or \`[n]\`
  numbers, and keep the \`[n]\` numbers exactly as the tools returned them.
- If a sub-question yields little, say so honestly rather than padding.`;

export const literatureSearcher = new Agent({
  id: "literature-searcher",
  name: "Literature searcher",
  description:
    "Searches the literature for one sub-question and extracts the strongest evidence with citations.",
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
