import type { ExplorePaper } from "@aqsha/convex/explore";

/**
 * Pick the most identifier-rich URL for an Explore paper so the workspace
 * ingestion pipeline (artifacts.createUrl → ingestUrl) can detect it as an
 * academic paper and resolve metadata + an open-access PDF. Prefers a canonical
 * DOI URL, then an arXiv abstract URL, then the paper's landing/PDF URL.
 */
export function bestPaperIngestUrl(
  paper: Pick<ExplorePaper, "doi" | "arxivId" | "url" | "pdfUrl">,
): string {
  if (paper.doi) return `https://doi.org/${paper.doi}`;
  if (paper.arxivId) return `https://arxiv.org/abs/${paper.arxivId}`;
  return paper.url || paper.pdfUrl || "";
}
