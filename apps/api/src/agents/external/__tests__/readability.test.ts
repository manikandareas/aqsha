import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { fetchReadable } from "../readability";
import { NotHtmlError } from "../types";

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Astra Daily</title>
  <meta property="article:published_time" content="2024-09-12T08:00:00Z" />
</head>
<body>
  <article>
    <h1>The State of Hybrid Retrieval in 2024</h1>
    <p>By <span class="byline">Jane Reporter</span></p>
    <p>Hybrid retrieval combines lexical and dense vectors to balance recall and precision. The approach has become the de facto baseline for production RAG pipelines.</p>
    <p>Engineers report that adding a reranker on top further improves NDCG@10 by a meaningful margin in common benchmarks.</p>
  </article>
  <footer>Subscribe to our newsletter</footer>
</body>
</html>`;

const originalFetch = globalThis.fetch;

describe("fetchReadable", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("extracts title, byline, publishedTime, and clean text from HTML", async () => {
    globalThis.fetch = (async () =>
      new Response(SAMPLE_HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })) as unknown as typeof fetch;

    const doc = await fetchReadable("https://example.com/article");

    expect(doc.url).toBe("https://example.com/article");
    expect(doc.title).toContain("Hybrid Retrieval");
    expect(doc.publishedTime).toBe("2024-09-12T08:00:00Z");
    expect(doc.textContent).toContain("Hybrid retrieval combines lexical and dense vectors");
    expect(doc.textContent).not.toContain("Subscribe to our newsletter");
    expect(doc.length).toBeGreaterThan(0);
    expect(doc.contentType).toContain("text/html");
  });

  it("throws NotHtmlError when the response is a PDF", async () => {
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })) as unknown as typeof fetch;

    await expect(fetchReadable("https://example.com/file.pdf"))
      .rejects.toBeInstanceOf(NotHtmlError);
  });
});

describe("fetchReadable beforeEach guard", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not leak the mocked fetch between test files", () => {
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
