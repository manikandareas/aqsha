/**
 * Resolve a classified academic identifier into normalized paper metadata plus
 * an ordered list of candidate open-access PDF URLs. Ported faithfully from V1
 * `papers/ingest/resolve.ts`, with the Convex `ctx` removed (providers take
 * plain args) and the `externalLookupCache` table swapped for Redis
 * (external-cache.ts). Provider IO degrades to null/skip; `resolvePaper` never
 * throws — it returns `null` when nothing resolves.
 */

import { getCache, putCache } from "./external-cache";
import type { ClassifiedUrl } from "./identifiers";
import { arxivAbsUrl, arxivPdfUrl } from "./identifiers";
import type { PartialPaper, ResolvedPaper } from "./model";
import {
  arxivById,
  crossrefByDoi,
  dataCiteByDoi,
  openAlexByDoi,
  openAlexByPmid,
  semanticScholar,
  unpaywallByDoi,
} from "./providers";

export type { PaperAuthor, ResolvedPaper } from "./model";

const CACHE_PROVIDER = "paper_ingest";

export async function resolvePaper(input: {
  classified: ClassifiedUrl;
}): Promise<ResolvedPaper | null> {
  const { classified } = input;
  const cacheKey = cacheKeyFor(classified);
  const cached = cacheKey ? await readMeaningfulCache(cacheKey) : null;
  const resolved = cached ?? (await resolveUncachedPaper(classified));
  const withArxivFallback = ensureArxivFallback(resolved, classified.arxivId);

  if (cacheKey && !cached && withArxivFallback && isMeaningfulPaper(withArxivFallback)) {
    await writeCache(cacheKey, withArxivFallback);
  }

  return withArxivFallback;
}

async function resolveUncachedPaper(
  classified: ClassifiedUrl,
): Promise<ResolvedPaper | null> {
  const accumulator = createAccumulator(classified);
  await applyArxivMetadata(accumulator, classified.arxivId);
  await applyPmidMetadata(accumulator, classified.pmid);
  await applyDoiMetadata(accumulator);
  await applySemanticScholarBackfill(accumulator);
  return finalizeResolvedPaper(accumulator);
}

type PaperAccumulator = ResolvedPaper & {
  doi?: string;
  pdfCandidates: string[];
};

function createAccumulator(classified: ClassifiedUrl): PaperAccumulator {
  return {
    doi: classified.doi,
    arxivId: classified.arxivId,
    authors: [],
    affiliations: [],
    metadataSource: "openalex",
    pdfCandidates: [],
  };
}

async function applyArxivMetadata(
  paper: PaperAccumulator,
  arxivId: string | undefined,
): Promise<void> {
  if (!arxivId) return;

  const arxiv = await arxivById(arxivId);
  if (arxiv) {
    applyPartial(paper, arxiv);
    pushPdfCandidates(paper, arxiv.pdfCandidates);
    paper.doi = paper.doi ?? arxiv.publishedDoi;
  }

  if (needsBibliographicBackfill(paper)) {
    const datacite = await dataCiteByDoi(`10.48550/arxiv.${arxivId}`);
    if (datacite) applyPartial(paper, datacite);
  }
}

async function applyPmidMetadata(
  paper: PaperAccumulator,
  pmid: string | undefined,
): Promise<void> {
  if (paper.doi || !pmid) return;

  const byPmid = await openAlexByPmid(pmid);
  if (!byPmid) return;

  applyPartial(paper, byPmid);
  pushPdfCandidates(paper, byPmid.pdfCandidates);
  paper.doi = byPmid.doi ?? paper.doi;
}

async function applyDoiMetadata(paper: PaperAccumulator): Promise<void> {
  if (!paper.doi) return;

  const [openalex, crossref, datacite, unpaywall] = await Promise.all([
    openAlexByDoi(paper.doi),
    crossrefByDoi(paper.doi),
    dataCiteByDoi(paper.doi),
    unpaywallByDoi(paper.doi),
  ]);

  if (openalex) {
    applyPartial(paper, openalex, { preferMeta: true });
    pushPdfCandidates(paper, openalex.pdfCandidates);
  }

  if (crossref) applyPartial(paper, crossref);

  if (datacite && needsBibliographicBackfill(paper)) applyPartial(paper, datacite);

  if (unpaywall?.pdfUrl) paper.pdfCandidates.unshift(unpaywall.pdfUrl);
  if (unpaywall?.oaStatus && !paper.oaStatus) {
    paper.oaStatus = unpaywall.oaStatus;
  }
}

async function applySemanticScholarBackfill(
  paper: PaperAccumulator,
): Promise<void> {
  if (paper.abstract && paper.pdfCandidates.length > 0) return;

  const s2 = await semanticScholar({
    doi: paper.doi,
    arxivId: paper.arxivId,
  });
  if (!s2) return;

  if (!paper.abstract && s2.abstract) paper.abstract = s2.abstract;
  if (s2.pdfUrl) paper.pdfCandidates.push(s2.pdfUrl);
}

function finalizeResolvedPaper(paper: PaperAccumulator): ResolvedPaper | null {
  const resolved = {
    ...paper,
    pdfCandidates: dedupeUrls(paper.pdfCandidates),
  };
  return hasResolutionSignal(resolved) ? resolved : null;
}

function ensureArxivFallback(
  paper: ResolvedPaper | null,
  arxivId: string | undefined,
): ResolvedPaper | null {
  if (!arxivId) return paper;

  const arxivPdf = arxivPdfUrl(arxivId);
  if (paper) {
    return {
      ...paper,
      arxivId: paper.arxivId ?? arxivId,
      landingPageUrl: paper.landingPageUrl ?? arxivAbsUrl(arxivId),
      pdfCandidates: dedupeUrls([arxivPdf, ...paper.pdfCandidates]),
    };
  }

  return {
    arxivId,
    authors: [],
    affiliations: [],
    metadataSource: "arxiv",
    pdfCandidates: [arxivPdf],
    landingPageUrl: arxivAbsUrl(arxivId),
  };
}

function cacheKeyFor(classified: ClassifiedUrl): string | undefined {
  if (classified.doi) return classified.doi;
  if (classified.arxivId) return `arxiv:${classified.arxivId}`;
  if (classified.pmid) return `pmid:${classified.pmid}`;
  return undefined;
}

async function readMeaningfulCache(
  cacheKey: string,
): Promise<ResolvedPaper | null> {
  const cached = await getCache(CACHE_PROVIDER, cacheKey);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached.valueJson) as ResolvedPaper;
    return isMeaningfulPaper(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(cacheKey: string, value: ResolvedPaper): Promise<void> {
  await putCache(CACHE_PROVIDER, cacheKey, "ready", JSON.stringify(value));
}

function applyPartial(
  target: PaperAccumulator,
  partial: PartialPaper,
  options: { preferMeta?: boolean } = {},
): void {
  const takesTitle = Boolean(partial.title) && (!target.title || options.preferMeta);
  if (takesTitle) {
    target.title = partial.title;
    if (partial.metadataSource) target.metadataSource = partial.metadataSource;
  }
  if (partial.abstract && (!target.abstract || options.preferMeta)) {
    target.abstract = partial.abstract;
  }
  if (
    partial.authors &&
    partial.authors.length > 0 &&
    (target.authors.length === 0 || options.preferMeta)
  ) {
    target.authors = partial.authors;
  }
  if (
    partial.affiliations &&
    partial.affiliations.length > 0 &&
    target.affiliations.length === 0
  ) {
    target.affiliations = partial.affiliations;
  }
  if (partial.journal && !target.journal) target.journal = partial.journal;
  if (partial.publisher && !target.publisher) target.publisher = partial.publisher;
  if (partial.publishedYear && !target.publishedYear) {
    target.publishedYear = partial.publishedYear;
  }
  if (partial.oaStatus && !target.oaStatus) target.oaStatus = partial.oaStatus;
  if (partial.landingPageUrl && !target.landingPageUrl) {
    target.landingPageUrl = partial.landingPageUrl;
  }
  target.doi = target.doi ?? partial.doi;
  target.arxivId = target.arxivId ?? partial.arxivId;
}

function pushPdfCandidates(
  paper: PaperAccumulator,
  candidates: string[] | undefined,
): void {
  if (candidates?.length) paper.pdfCandidates.push(...candidates);
}

function needsBibliographicBackfill(paper: ResolvedPaper): boolean {
  return !paper.title || paper.authors.length === 0 || !paper.abstract;
}

function isMeaningfulPaper(paper: ResolvedPaper): boolean {
  return Boolean(paper.title || paper.abstract || paper.authors.length > 0);
}

function hasResolutionSignal(paper: ResolvedPaper): boolean {
  return Boolean(
    paper.title ||
      paper.abstract ||
      paper.doi ||
      paper.arxivId ||
      paper.pdfCandidates.length > 0,
  );
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url) continue;
    const https = url.replace(/^http:\/\//i, "https://");
    if (seen.has(https)) continue;
    seen.add(https);
    out.push(https);
  }
  return out;
}
