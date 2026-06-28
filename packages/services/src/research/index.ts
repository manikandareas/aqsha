/**
 * ResearchService (Slice 6.4) — web/arxiv/doi/openalex discovery for Astra's
 * read-only research tools, plus persistence + read of `research_sources` for
 * the Sources panel. Web search uses Firecrawl (`/v2/search`); Exa/Jina dropped
 * for the web lane. Citation verification (verifyCitations/verifyIdentifiers + integrity
 * engine) is deferred to P7 (D-H) — this slice is READ tools only.
 */

import { type DbOrTx, type NewResearchSource, type ResearchSource, ResearchSourceRepo } from "@aqsha/db";
import { normalizeDoi } from "../papers/identifiers";
import { searchArxiv } from "./arxiv";
import { lookupDoi } from "./crossref";
import { searchWebFirecrawl } from "./firecrawl";
import { searchOpenAlex } from "./openalex";
import type { ResearchCandidate } from "./types";

export type {
  EvidenceStrength,
  ResearchCandidate,
  ResearchOrigin,
} from "./types";

// CitationService (Slice 7.2) — citation-integrity engine, shares the same
// `@aqsha/services/research` subpath (no new subpath; bundled by tsup entry).
export {
  CitationService,
  type CitationInput,
  type CitationVerdict,
  type CitationVerifyRef,
  type IntegrityStatus,
  type VerificationResult,
} from "./citation";

/** Read model untuk panel Sources (api route + web hook). */
export type ResearchSourceItem = {
  id: string;
  threadId: string;
  turnId: string;
  citationNumber: number | null;
  origin: "web" | "arxiv" | "doi";
  provider: string | null;
  title: string;
  locator: string;
  url: string | null;
  doi: string | null;
  arxivId: string | null;
  snippet: string;
  evidenceStrength: "strong" | "medium" | "weak";
  discoveryQuery: string | null;
  createdAt: number;
};

export const ResearchService = {
  /** Pencarian web (Firecrawl `/v2/search`). */
  searchWeb(args: { query: string; limit?: number }): Promise<ResearchCandidate[]> {
    return searchWebFirecrawl(args);
  },

  /** Pencarian arXiv (Atom, multi-entry). */
  searchArxiv(args: { query: string; limit?: number }): Promise<ResearchCandidate[]> {
    return searchArxiv(args);
  },

  /** Lookup metadata satu DOI (Crossref). */
  lookupDoi(args: { doi: string }): Promise<ResearchCandidate[]> {
    return lookupDoi(args);
  },

  /** Pencarian karya akademik (OpenAlex). */
  searchOpenAlex(args: { query: string; limit?: number }): Promise<ResearchCandidate[]> {
    return searchOpenAlex(args);
  },

  /**
   * Persist kandidat sumber untuk sebuah turn (idempoten via unique
   * thread+turn+locator). Best-effort di pemanggil (tool) — kegagalan persist
   * tak boleh meracuni hasil tool yang ditunggu model.
   */
  async persistSources(
    db: DbOrTx,
    input: {
      threadId: string;
      ownerUserId: string;
      turnId: string;
      discoveryQuery?: string;
      candidates: ResearchCandidate[];
      now: number;
    },
  ): Promise<void> {
    if (input.candidates.length === 0) return;
    const rows: NewResearchSource[] = input.candidates.map((candidate) => ({
      id: crypto.randomUUID(),
      threadId: input.threadId,
      ownerUserId: input.ownerUserId,
      turnId: input.turnId,
      citationNumber: null,
      origin: candidate.origin,
      provider: candidate.provider ?? null,
      title: candidate.title,
      locator: candidate.locator,
      url: candidate.url ?? null,
      doi: candidate.doi ?? null,
      arxivId: candidate.arxivId ?? null,
      snippet: candidate.snippet,
      evidenceStrength: candidate.evidenceStrength,
      discoveryQuery: input.discoveryQuery ?? null,
      createdAt: input.now,
    }));
    await ResearchSourceRepo.insertMany(db, rows);
  },

  /** Daftar sumber riset yang dipersist untuk sebuah thread (panel Sources). */
  async listThreadSources(db: DbOrTx, threadId: string): Promise<ResearchSourceItem[]> {
    const rows = await ResearchSourceRepo.listByThread(db, threadId);
    return rows.map(toResearchSourceItem);
  },

  /**
   * Nomori sumber satu run deep (`turnId` = workflow runId) → `citation_number` 1..N (G4).
   * Dedupe paper yang sama lintas sub-pertanyaan/penyedia via kunci `normalizeDoi ?? arxivId ??
   * locator` (baris berbeda dgn DOI/URL beda dapat NOMOR SAMA). Dipanggil step `assign-citations`
   * SEBELUM verify/synthesize → writer mengutip `[n]` global yang stabil. Mengembalikan item
   * bernomor (urut createdAt) untuk menyusun inventory.
   */
  async assignCitationNumbers(
    db: DbOrTx,
    args: { threadId: string; turnId: string },
  ): Promise<ResearchSourceItem[]> {
    const rows = await ResearchSourceRepo.listByThreadTurn(db, args.threadId, args.turnId);
    if (rows.length === 0) return [];
    const numberByKey = new Map<string, number>();
    let next = 1;
    const updates = rows.map((r) => {
      const key = (r.doi && normalizeDoi(r.doi)) || r.arxivId || r.locator;
      let n = numberByKey.get(key);
      if (n === undefined) {
        n = next++;
        numberByKey.set(key, n);
      }
      return { id: r.id, citationNumber: n };
    });
    await ResearchSourceRepo.setCitationNumbers(db, updates);
    return rows.map((r, i) => toResearchSourceItem({ ...r, citationNumber: updates[i]!.citationNumber }));
  },
};

/** Row `research_sources` → read model `ResearchSourceItem`. */
function toResearchSourceItem(r: ResearchSource): ResearchSourceItem {
  return {
    id: r.id,
    threadId: r.threadId,
    turnId: r.turnId,
    citationNumber: r.citationNumber,
    origin: r.origin as ResearchSourceItem["origin"],
    provider: r.provider,
    title: r.title,
    locator: r.locator,
    url: r.url,
    doi: r.doi,
    arxivId: r.arxivId,
    snippet: r.snippet,
    evidenceStrength: r.evidenceStrength as ResearchSourceItem["evidenceStrength"],
    discoveryQuery: r.discoveryQuery,
    createdAt: r.createdAt,
  };
}
