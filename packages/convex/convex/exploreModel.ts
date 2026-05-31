import type { ExternalCandidate } from "./agent/externalProviders";
import { canonicalSourceKey } from "./agent/sourceQuality";
import { trimForSnippet } from "./agent/sourceCandidates";

export type ExploreMode = "recommendations" | "search";

export type ExploreProvider =
  | "OpenAlex"
  | "arXiv"
  | "Exa"
  | "Jina"
  | "Crossref";

export type ExplorePaper = {
  key: string;
  title: string;
  snippet: string;
  abstract?: string;
  url: string;
  pdfUrl?: string;
  doi?: string;
  arxivId?: string;
  openalexId?: string;
  provider: ExploreProvider;
  sourceLabel: string;
  authors: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  topics: string[];
  score?: number;
};

export type ExploreProviderStatus = {
  provider: ExploreProvider;
  status: "ready" | "fallback" | "skipped" | "error";
  message?: string;
};

export type ExploreSearchResponse = {
  items: ExplorePaper[];
  mode: ExploreMode;
  query: string;
  providerStatus: ExploreProviderStatus[];
  generatedAt: number;
  cached: boolean;
};

export type ExploreCandidateMetadata = {
  authors?: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  pdfUrl?: string;
  openalexId?: string;
  topics?: string[];
  score?: number;
  sourceLabel?: string;
};

const providerLabels: Record<string, ExploreProvider> = {
  openalex: "OpenAlex",
  arxiv: "arXiv",
  exa: "Exa",
  jina_search: "Jina",
  crossref: "Crossref",
};

export function normalizeExploreQuery(query?: string) {
  return (query ?? "").replace(/\s+/g, " ").trim();
}

export function exploreCacheKey(args: {
  mode: ExploreMode;
  query: string;
  limit: number;
  now?: number;
}) {
  const dateBucket = new Date(args.now ?? Date.now()).toISOString().slice(0, 10);
  return `explore:v1:${args.mode}:${normalizeExploreQuery(args.query).toLowerCase()}:${args.limit}:${dateBucket}`;
}

export function candidatesToExplorePapers(
  candidates: ExternalCandidate[],
  limit: number,
): ExplorePaper[] {
  const papers = new Map<string, ExplorePaper>();
  for (const candidate of candidates) {
    const paper = candidateToExplorePaper(candidate);
    if (!paper) {
      continue;
    }
    const existing = papers.get(paper.key);
    if (!existing || providerRank(paper.provider) < providerRank(existing.provider)) {
      papers.set(paper.key, paper);
    }
    if (papers.size >= limit) {
      break;
    }
  }
  return [...papers.values()].slice(0, limit);
}

export function candidateToExplorePaper(candidate: ExternalCandidate): ExplorePaper | null {
  const url = candidate.url ?? candidate.locator;
  const title = collapse(candidate.title);
  if (!title || !url || !isLikelyUrl(url)) {
    return null;
  }

  const metadata = parseMetadata(candidate.metadataJson);
  const provider = providerLabels[candidate.provider ?? ""] ?? "Jina";
  const doi = normalizeDoi(candidate.doi ?? "");
  const arxivId = normalizeArxivId(candidate.arxivId ?? url);
  const openalexId = metadata.openalexId;
  const key = canonicalSourceKey({
    ...candidate,
    doi: doi || candidate.doi,
    arxivId: arxivId || candidate.arxivId,
  });

  return {
    key,
    title,
    snippet: trimForSnippet(candidate.snippet, 1_200) || "Metadata result.",
    abstract: collapse(candidate.snippet) || undefined,
    url,
    pdfUrl: metadata.pdfUrl,
    doi: doi || undefined,
    arxivId: arxivId || undefined,
    openalexId,
    provider,
    sourceLabel: metadata.sourceLabel ?? provider,
    authors: metadata.authors ?? [],
    year: metadata.year,
    publicationDate: metadata.publicationDate,
    venue: metadata.venue,
    citedByCount: metadata.citedByCount,
    isOpenAccess: metadata.isOpenAccess,
    topics: metadata.topics ?? fallbackTopics(candidate),
    score: metadata.score ?? candidate.rerankScore,
  };
}

function parseMetadata(value: string | undefined): ExploreCandidateMetadata {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as ExploreCandidateMetadata;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function fallbackTopics(candidate: ExternalCandidate) {
  return uniqueCompact([candidate.bucketName, candidate.origin === "arxiv" ? "Preprint" : null]).slice(0, 3);
}

function providerRank(provider: ExploreProvider) {
  return ["OpenAlex", "arXiv", "Exa", "Jina", "Crossref"].indexOf(provider);
}

function normalizeArxivId(value: string) {
  const match = value.match(/(?:arxiv\.org\/(?:abs|pdf|html)\/|^)(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return match?.[1] ?? "";
}

function normalizeDoi(value: string) {
  return value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase();
}

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function uniqueCompact(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => collapse(value ?? "")).filter(Boolean))];
}

function collapse(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
