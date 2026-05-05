// Phase 2 end-to-end smoke. Hits the real upstreams for each new tool:
//   - arxiv.org / api.crossref.org / eutils.ncbi.nlm.nih.gov (search providers)
//   - api.cohere.com (reranking)
//   - example.com / arxiv.org PDF (fetch_url + pdf_extract)
//
// Gated on RUN_INTEGRATION_TESTS=true. Not run in CI by default.

import { describe, expect, it } from "bun:test";
import { env } from "../../config";
import { searchArxiv } from "../external/arxiv";
import { cohereRerank, isCohereConfigured } from "../external/cohere-rerank";
import { searchCrossref } from "../external/crossref";
import { extractPdf } from "../external/pdf";
import { searchPubmed } from "../external/pubmed";
import { fetchReadable } from "../external/readability";

const skip = !env.RUN_INTEGRATION_TESTS;
const describeOrSkip = skip ? describe.skip : describe;

describeOrSkip("Phase 2 — external research tools (real network)", () => {
  it(
    "arxiv: returns at least one candidate for a known retrieval query",
    async () => {
      const candidates = await searchArxiv("hybrid retrieval reranking", { maxResults: 5 });
      expect(candidates.length).toBeGreaterThan(0);
      const first = candidates[0];
      expect(first.url).toMatch(/^https?:\/\/arxiv\.org\//);
      expect(first.title.length).toBeGreaterThan(5);
      expect(first.provider).toBe("arxiv");
    },
    60_000,
  );

  it(
    "crossref: maps DOI → URL and surfaces authors",
    async () => {
      const candidates = await searchCrossref("retrieval augmented generation", { rows: 5 });
      expect(candidates.length).toBeGreaterThan(0);
      const withDoi = candidates.find((c) => c.doi !== null) ?? candidates[0];
      expect(withDoi.url.startsWith("https://")).toBe(true);
      expect(withDoi.provider).toBe("crossref");
    },
    60_000,
  );

  it(
    "pubmed: returns biomedical hits with pubmed.ncbi.nlm.nih.gov URLs",
    async () => {
      const candidates = await searchPubmed("semaglutide obesity", { retmax: 5 });
      expect(candidates.length).toBeGreaterThan(0);
      const first = candidates[0];
      expect(first.url).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\//);
      expect(first.provider).toBe("pubmed");
    },
    60_000,
  );

  it(
    "cohere rerank: scores 5 documents and returns ranking sorted desc",
    async () => {
      if (!isCohereConfigured()) {
        // Skip path if env is not configured (the test still runs to confirm)
        console.warn("[phase2.e2e] ASTRA_COHERE_API_KEY missing — skipping rerank assertion");
        return;
      }

      const documents = [
        "A primer on retrieval-augmented generation for production systems",
        "How to bake sourdough at home in three days",
        "Hybrid retrieval combines lexical BM25 and dense vector search",
        "The best espresso machines under $500",
        "Cross-encoder rerankers improve NDCG on retrieval benchmarks",
      ];

      const result = await cohereRerank({
        query: "hybrid retrieval reranker for RAG",
        documents,
        topN: 3,
      });

      expect(result.ranking.length).toBe(3);
      // Top result should be one of the retrieval-related docs (indices 0, 2, 4).
      expect([0, 2, 4]).toContain(result.ranking[0].index);
      // Scores must be sorted desc.
      for (let i = 1; i < result.ranking.length; i += 1) {
        expect(result.ranking[i - 1].relevanceScore).toBeGreaterThanOrEqual(
          result.ranking[i].relevanceScore,
        );
      }
    },
    60_000,
  );

  it(
    "fetch_url: extracts readable text from a stable HTML page",
    async () => {
      const doc = await fetchReadable("https://example.com/");
      expect(doc.title?.toLowerCase()).toContain("example domain");
      expect(doc.textContent.toLowerCase()).toContain("documentation examples");
      expect(doc.contentType ?? "").toContain("text/html");
    },
    60_000,
  );

  it(
    "pdf_extract: parses an arXiv PDF and returns page count + text",
    async () => {
      // Use a small, stable arXiv preprint PDF.
      const result = await extractPdf("https://arxiv.org/pdf/1706.03762v7", {
        forcePdf: true,
      });
      expect(result.pages).toBeGreaterThan(0);
      expect(result.textContent.length).toBeGreaterThan(200);
      // "Attention Is All You Need" should mention attention or transformer.
      expect(result.textContent.toLowerCase()).toMatch(/attention|transformer/);
    },
    120_000,
  );
});
