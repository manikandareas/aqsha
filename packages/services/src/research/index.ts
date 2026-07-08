/**
 * ResearchService — discovery web/arxiv/doi/openalex untuk tool riset read-only
 * Astra, plus persist + read `research_sources` untuk panel Sources. Web search
 * memakai Firecrawl (`/v2/search`). Verifikasi sitasi (verifyCitations/
 * verifyIdentifiers + integrity engine) hidup di `CitationService` (./citation),
 * di-re-export di bawah.
 */

import {
  type DbOrTx,
  type NewResearchSource,
  type ResearchSource,
  ResearchSourceRepo,
  type ResearchSourceStance,
  type ResearchSourceStudyDesign,
} from "@aqsha/db";
import { fetchArticlePreview } from "../papers/articlePreview";
import { normalizeDoi } from "../papers/identifiers";
import { searchArxiv } from "./arxiv";
import { lookupDoi, searchCrossref } from "./crossref";
import { searchWebFirecrawl } from "./firecrawl";
import { type OpenAlexSort, searchOpenAlex } from "./openalex";
import type { ProviderSearchResult, ResearchCandidate } from "./types";

export type { OpenAlexSort } from "./openalex";

export type { ResearchSourceStance, ResearchSourceStudyDesign } from "@aqsha/db";

export type {
  EvidenceStrength,
  ProviderSearchResult,
  ResearchCandidate,
  ResearchOrigin,
} from "./types";

// CitationService — engine integritas sitasi; berbagi subpath
// `@aqsha/services/research` (tanpa subpath baru; dibundel entry tsup yang sama).
export {
  CitationService,
  type CitationInput,
  type CitationVerdict,
  type CitationVerifyRef,
  type IntegrityStatus,
  type VerificationResult,
} from "./citation";

// Firecrawl reader — full-text URL → markdown untuk tool `read_url` agent; berbagi
// subpath `./research` (fisiknya di ../papers karena dipakai worker ingest juga).
export { scrapeUrlFirecrawl, type UrlReadResult } from "../papers/firecrawl-reader";

// Formatter daftar pustaka deterministik — tool `format_references` + export .bib/.ris.
export {
  dedupeReferenceSources,
  formatApa7Reference,
  formatBibtex,
  formatRis,
  type ReferenceSourceInput,
  sortForReferenceList,
} from "./references";

/**
 * Preview OG image untuk satu sumber web (best-effort, time-boxed di `fetchArticlePreview`).
 * Dipakai step `search-literature` `/deep` untuk enrich `research_sources.imageUrl` (kartu sumber).
 * Hanya `imageUrl` yang dipakai di sini; favicon/domain diturunkan client-side dari `url`.
 */
export async function fetchSourcePreview(url: string): Promise<{ imageUrl?: string }> {
  const preview = await fetchArticlePreview(url);
  return preview.imageUrl ? { imageUrl: preview.imageUrl } : {};
}

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
  /** Index sub-pertanyaan `/deep` yang menemukan sumber ini (null di chat biasa). */
  subQuestionIndex: number | null;
  /** Teks sub-pertanyaan `/deep` (null di chat biasa). */
  subQuestionText: string | null;
  /** OG image (best-effort) untuk kartu sumber (null bila tak ada/belum di-enrich). */
  imageUrl: string | null;
  /** Penulis (maks 3, dari metadata provider) — untuk inventory sitasi + verifikasi. */
  authors: string[];
  /** Tahun publikasi (null bila provider tak memberi). */
  year: number | null;
  /** Venue/jurnal (null bila provider tak memberi). */
  venue: string | null;
  /** Jumlah sitasi provider (OpenAlex/Crossref) — bahan evidence viz (null bila tak ada). */
  citedByCount: number | null;
  /** Topik provider (OpenAlex) — fallback baris gaps-matrix bila outcomes LLM kosong. */
  topics: string[];
  /** Stance temuan paper thd sub-pertanyaan (klasifikasi step analyze; null sebelum/di luar deep). */
  stance: ResearchSourceStance | null;
  /** Desain studi (klasifikasi step analyze; null sebelum/di luar deep). */
  studyDesign: ResearchSourceStudyDesign | null;
  /** Outcome yang diukur paper (≤3, klasifikasi step analyze; [] bila belum diklasifikasi). */
  outcomes: string[];
  createdAt: number;
};

/**
 * Ekstrak authors/year/venue dari `candidate.metadataJson` (blob provider). Dipakai persist
 * (kolom terstruktur `research_sources`) + output tool riset (model harus MENERIMA
 * metadata sitasi di hasil tool, bukan hanya tersimpan di DB). Best-effort: blob korup → kosong.
 */
export function candidateCitationMeta(candidate: ResearchCandidate): {
  authors: string[];
  year: number | null;
  venue: string | null;
  citedByCount: number | null;
  topics: string[];
} {
  const empty = { authors: [], year: null, venue: null, citedByCount: null, topics: [] };
  if (!candidate.metadataJson) return empty;
  try {
    const meta = JSON.parse(candidate.metadataJson) as {
      authors?: unknown;
      year?: unknown;
      venue?: unknown;
      citedByCount?: unknown;
      topics?: unknown;
    };
    const stringArray = (value: unknown, max: number) =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, max)
        : [];
    return {
      authors: stringArray(meta.authors, 3),
      year: typeof meta.year === "number" && Number.isFinite(meta.year) ? meta.year : null,
      venue: typeof meta.venue === "string" && meta.venue.length > 0 ? meta.venue : null,
      citedByCount:
        typeof meta.citedByCount === "number" && Number.isFinite(meta.citedByCount)
          ? meta.citedByCount
          : null,
      topics: stringArray(meta.topics, 5),
    };
  } catch {
    return empty;
  }
}

export const ResearchService = {
  /** Pencarian web (Firecrawl `/v2/search`). Hasil DISKRIMINATIF (`ok:false` = provider error). */
  searchWeb(args: { query: string; limit?: number }): Promise<ProviderSearchResult> {
    return searchWebFirecrawl(args);
  },

  /** Pencarian arXiv (Atom, multi-entry). Hasil DISKRIMINATIF (`ok:false` = provider error). */
  searchArxiv(args: { query: string; limit?: number }): Promise<ProviderSearchResult> {
    return searchArxiv(args);
  },

  /** Lookup metadata satu DOI (Crossref). Hasil DISKRIMINATIF (`ok:false` = provider error). */
  lookupDoi(args: { doi: string }): Promise<ProviderSearchResult> {
    return lookupDoi(args);
  },

  /** Keyword search Crossref (`/works?query=…`, multi-hasil). Hasil DISKRIMINATIF. */
  searchCrossref(args: { query: string; limit?: number }): Promise<ProviderSearchResult> {
    return searchCrossref(args);
  },

  /**
   * Pencarian karya akademik (OpenAlex). Hasil DISKRIMINATIF (`ok:false` = provider error).
   * Filter opsional: rentang tahun terbit, bahasa (ISO 639-1, mis. `id` untuk jurnal Indonesia),
   * dan sort (`relevance`|`cited_by`|`newest`).
   */
  searchOpenAlex(args: {
    query: string;
    limit?: number;
    yearFrom?: number;
    yearTo?: number;
    language?: string;
    sort?: OpenAlexSort;
  }): Promise<ProviderSearchResult> {
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
      /** Sub-pertanyaan `/deep` yang sedang dijawab — seragam untuk semua kandidat satu panggilan. */
      subQuestionIndex?: number;
      subQuestionText?: string;
      candidates: ResearchCandidate[];
      /**
       * Nomor sitasi `[n]` global per-kandidat (sejajar `candidates`), jalur chat. Deep biarkan
       * undefined → `citation_number` null, di-assign step `assign-citations` (dedup global).
       */
      citationNumbers?: number[];
      now: number;
    },
  ): Promise<void> {
    if (input.candidates.length === 0) return;
    const rows: NewResearchSource[] = input.candidates.map((candidate, i) => {
      const meta = candidateCitationMeta(candidate);
      return {
        id: crypto.randomUUID(),
        threadId: input.threadId,
        ownerUserId: input.ownerUserId,
        turnId: input.turnId,
        citationNumber: input.citationNumbers?.[i] ?? null,
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
        subQuestionIndex: input.subQuestionIndex ?? null,
        subQuestionText: input.subQuestionText ?? null,
        imageUrl: null,
        authorsJson: meta.authors.length > 0 ? JSON.stringify(meta.authors) : null,
        year: meta.year,
        venue: meta.venue,
        citedByCount: meta.citedByCount,
        topicsJson: meta.topics.length > 0 ? JSON.stringify(meta.topics) : null,
        createdAt: input.now,
      };
    });
    await ResearchSourceRepo.insertMany(db, rows);
  },

  /**
   * Persist hasil klasifikasi evidence viz (step `analyze-sources` `/deep`) batch by id.
   * Best-effort di pemanggil — kegagalan DB tak boleh menggagalkan step (blok viz tetap
   * dibangun dari state workflow; kolom hanya fallback/observabilitas).
   */
  async setSourceClassification(
    db: DbOrTx,
    updates: Array<{
      id: string;
      stance: ResearchSourceStance;
      studyDesign: ResearchSourceStudyDesign;
      outcomes: string[];
    }>,
  ): Promise<void> {
    await ResearchSourceRepo.setClassification(
      db,
      updates.map((u) => ({
        id: u.id,
        stance: u.stance,
        studyDesign: u.studyDesign,
        outcomesJson: u.outcomes.length > 0 ? JSON.stringify(u.outcomes.slice(0, 3)) : null,
      })),
    );
  },

  /**
   * Set OG image (`image_url`) batch untuk sumber yang sudah dipersist (hasil enrichment step
   * search `/deep`). Best-effort di pemanggil — kegagalan tak boleh menggagalkan run. Update
   * by id (run-scoped), aman dipanggil setelah `persistSources`.
   */
  async setSourceImages(db: DbOrTx, updates: Array<{ id: string; imageUrl: string }>): Promise<void> {
    await ResearchSourceRepo.setImages(db, updates);
  },

  /** Daftar sumber riset yang dipersist untuk sebuah thread (panel Sources). */
  async listThreadSources(db: DbOrTx, threadId: string): Promise<ResearchSourceItem[]> {
    const rows = await ResearchSourceRepo.listByThread(db, threadId);
    return rows.map(toResearchSourceItem);
  },

  /** Sumber satu run deep (`turnId` = workflow runId) — untuk enrichment OG image step search. */
  async listTurnSources(
    db: DbOrTx,
    args: { threadId: string; turnId: string },
  ): Promise<ResearchSourceItem[]> {
    const rows = await ResearchSourceRepo.listByThreadTurn(db, args.threadId, args.turnId);
    return rows.map(toResearchSourceItem);
  },

  /**
   * Nomori sumber satu run deep (`turnId` = workflow runId) → `citation_number` 1..N.
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
    subQuestionIndex: r.subQuestionIndex,
    subQuestionText: r.subQuestionText,
    imageUrl: r.imageUrl,
    authors: parseStringArrayJson(r.authorsJson),
    year: r.year,
    venue: r.venue,
    citedByCount: r.citedByCount,
    topics: parseStringArrayJson(r.topicsJson),
    stance: (r.stance as ResearchSourceStance | null) ?? null,
    studyDesign: (r.studyDesign as ResearchSourceStudyDesign | null) ?? null,
    outcomes: parseStringArrayJson(r.outcomesJson),
    createdAt: r.createdAt,
  };
}

/** Parse kolom JSON array-of-string (`authors_json`/`topics_json`/`outcomes_json`) — blob korup/legacy null → []. */
function parseStringArrayJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((a): a is string => typeof a === "string" && a.length > 0)
      : [];
  } catch {
    return [];
  }
}
