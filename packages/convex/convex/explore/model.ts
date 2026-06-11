import type { Infer } from "convex/values";
import type { ExternalCandidate } from "../agent/providers/externalProviders";
import { canonicalSourceKey } from "../agent/research/sourceQuality";
import { trimForSnippet } from "../agent/research/sourceCandidates";
import {
  explorePaperValidator,
  exploreProviderValidator,
  type ExploreCandidateMetadata,
} from "./validators";
import { normalizeDoi } from "../lib/identifiers";
import { collapse, uniqueCompact } from "../lib/text";

export type ExploreMode = "recommendations" | "search";

export type ExploreProvider = Infer<typeof exploreProviderValidator>;

export type ExplorePaper = Infer<typeof explorePaperValidator>;

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
  fromYear?: number;
  now?: number;
}) {
  const dateBucket = new Date(args.now ?? Date.now()).toISOString().slice(0, 10);
  const yearBucket = args.fromYear ?? "all";
  return `explore:v2:${args.mode}:${normalizeExploreQuery(args.query).toLowerCase()}:${args.limit}:${yearBucket}:${dateBucket}`;
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

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value);
}
