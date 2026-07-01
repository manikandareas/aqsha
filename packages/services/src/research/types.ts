/**
 * Research provider contracts (Slice 6.4). Port of the V1
 * `apps/agents/src/providers/types.ts` `ExternalCandidate`, minus the injected
 * `ProviderDeps` bundle: V2 reads env + Redis cache directly (no DI), so each
 * provider is a plain async function.
 */

export type ResearchOrigin = "web" | "arxiv" | "doi";
export type EvidenceStrength = "strong" | "medium" | "weak";

/** One source candidate returned by a research provider. */
export type ResearchCandidate = {
  origin: ResearchOrigin;
  /** Provider label (`firecrawl_search`, `arxiv`, `crossref`, `openalex`). */
  provider?: string;
  evidenceStrength: EvidenceStrength;
  title: string;
  /** Stable identifier for dedup/citation (DOI, arXiv id, or URL). */
  locator: string;
  url?: string;
  doi?: string;
  arxivId?: string;
  snippet: string;
  /** Optional JSON blob with authors/year/venue (parsed by the caller when needed). */
  metadataJson?: string;
};

export function researchUserAgent(): string {
  return "AqshaResearch/1.0 (+https://aqsha.app)";
}

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider failure";
}
