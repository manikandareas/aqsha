import { describe, expect, it } from "vitest";
import {
  assessEvidenceReadiness,
  bestReadableAttempt,
  failedReadQuality,
  mergeCandidatePool,
  normalizeSemanticVerifierOutput,
  shouldReviseUnsupportedClaims,
  shouldRunCounterEvidencePass,
  type DiscoveryCandidate,
  type ReadAttempt,
  type ResearchExtract,
} from "../convex/agent/research/deepResearch";
import { assessSourceQuality, canonicalSourceKey } from "../convex/agent/research/sourceQuality";

const expectedStepLabels = [
  "Merencanakan ronde",
  "Mencari sumber",
  "Mengurutkan kandidat",
  "Membaca sumber",
  "Menilai kecukupan evidence",
  "Menguji counter-evidence",
  "Menyusun laporan",
  "Memverifikasi klaim",
  "Merevisi klaim lemah",
  "Menyimpan hasil",
  "Menutup riset",
];

describe("deep research contract", () => {
  it("keeps the public progress labels stable", () => {
    expect(expectedStepLabels).toEqual([
      "Merencanakan ronde",
      "Mencari sumber",
      "Mengurutkan kandidat",
      "Membaca sumber",
      "Menilai kecukupan evidence",
      "Menguji counter-evidence",
      "Menyusun laporan",
      "Memverifikasi klaim",
      "Merevisi klaim lemah",
      "Menyimpan hasil",
      "Menutup riset",
    ]);
  });

  it("skips counter-evidence when accepted sources are too few", async () => {
    const result = await shouldRunCounterEvidencePass({
      sufficiencyStatus: "sufficient",
      acceptedSourceCount: 2,
      highRelevanceExtractCount: 4,
      extracts: [],
      prompt: "test prompt",
    });
    expect(result).toBe(false);
  });

  it("rejects blocked or cookie-wall source content before citation", () => {
    expect(assessSourceQuality({
      origin: "web",
      evidenceStrength: "weak",
      title: "Access Denied",
      locator: "https://www.mckinsey.com/example",
      url: "https://www.mckinsey.com/example",
      snippet: "Access Denied. You don't have permission to access this page.",
    })).toEqual({ ok: false, reason: "blocked" });

    expect(assessSourceQuality({
      origin: "web",
      evidenceStrength: "weak",
      title: "ACM Digital Library",
      locator: "https://dl.acm.org/doi/10.1145/example",
      url: "https://dl.acm.org/doi/10.1145/example",
      snippet: "Cookie preferences Security check Enable JavaScript to continue.",
    })).toEqual({ ok: false, reason: "blocked" });
  });

  it("dedupes arXiv abs, pdf, and html URLs to one paper key", () => {
    const abs = canonicalSourceKey({
      title: "Attention Is All You Need",
      locator: "https://arxiv.org/abs/1706.03762v7",
      url: "https://arxiv.org/abs/1706.03762v7",
    });
    const pdf = canonicalSourceKey({
      title: "Attention Is All You Need",
      locator: "https://arxiv.org/pdf/1706.03762v7.pdf",
      url: "https://arxiv.org/pdf/1706.03762v7.pdf",
    });
    const html = canonicalSourceKey({
      title: "Attention Is All You Need",
      locator: "https://arxiv.org/html/1706.03762v7",
      url: "https://arxiv.org/html/1706.03762v7",
    });

    expect(abs).toBe("arxiv:1706.03762");
    expect(pdf).toBe(abs);
    expect(html).toBe(abs);
  });

  it("accepts readable content from either read provider", () => {
    const quality = assessSourceQuality(
      {
        origin: "web",
        evidenceStrength: "medium",
        title: "Readable implementation report",
        locator: "https://example.com/report",
        url: "https://example.com/report",
        snippet: "Short discovery snippet.",
      },
      "This report contains ".repeat(60),
    );

    expect(quality).toEqual({ ok: true, reason: "readable" });
  });

  it("keeps adding new candidates after the discovery pool reaches its cap", () => {
    const pool = new Map<string, DiscoveryCandidate>();
    const initial = Array.from({ length: 60 }, (_, index) =>
      webCandidate(`https://example-${index}.com/report`, "academic"),
    );
    mergeCandidatePool(pool, initial, { acceptedKeys: new Set(), rejectedKeys: new Set() });

    const incoming = webCandidate("https://new-source.example/report", "government/regulation");
    mergeCandidatePool(pool, [incoming], { acceptedKeys: new Set(), rejectedKeys: new Set() });

    expect(pool.size).toBe(60);
    expect([...pool.values()].some((source) => source.url === incoming.url)).toBe(true);
  });

  it("uses Jina readable content when Exa content fails", () => {
    const source = webCandidate("https://example.com/readable", "industry reports");
    const attempts: ReadAttempt[] = [
      failedAttempt("exa", source.url!, "Exa returned empty content"),
      readableAttempt("jina", source.url!, "Jina readable report ".repeat(60)),
    ];

    const best = bestReadableAttempt(source, attempts);

    expect(best?.provider).toBe("jina");
    expect(assessSourceQuality(source, best?.text)).toEqual({ ok: true, reason: "readable" });
  });

  it("rejects URL sources when both readers fail even if discovery snippet is long", () => {
    const source = {
      ...webCandidate("https://example.com/teaser", "industry reports"),
      snippet: "Long discovery teaser only. ".repeat(40),
    };
    const attempts: ReadAttempt[] = [
      failedAttempt("exa", source.url!, "Exa returned empty content"),
      failedAttempt("jina", source.url!, "Jina Reader returned 403"),
    ];

    expect(failedReadQuality(source, attempts)).toEqual({ ok: false, reason: "provider_failure" });
  });

  it("requires readable count, diversity, bucket coverage, and extract quality for readiness", () => {
    const sources = Array.from({ length: 10 }, (_, index) => ({
      ...webCandidate(`https://domain-${index}.example/report`, index < 4 ? "academic" : index < 7 ? "industry reports" : "government/regulation"),
      citationNumber: index + 1,
      readStatus: "ready" as const,
    }));
    const extracts: ResearchExtract[] = sources.slice(0, 8).map((source) => ({
      sourceKey: canonicalSourceKey(source),
      citationNumber: source.citationNumber,
      title: source.title,
      locator: source.locator,
      quote: "Detailed readable evidence extract. ".repeat(24),
      relevance: source.citationNumber <= 4 ? "high" : "medium",
    }));

    expect(assessEvidenceReadiness(sources, extracts)).toMatchObject({
      ready: true,
      status: "sufficient",
      readableSourceCount: 10,
      domainCount: 10,
      bucketCount: 3,
    });
  });

  it("normalizes semantic verifier output safely", () => {
    expect(normalizeSemanticVerifierOutput({
      claim: "Claim [1].",
      support: "partial",
      citationNumbers: [1],
      evidence: "Evidence",
    }, {
      support: "partially_supported",
      confidence: 2,
    })).toMatchObject({
      support: "partially_supported",
      confidence: 1,
    });
  });

  it("runs the revise pass for contradicted, high-confidence, or no-evidence unsupported claims", () => {
    // Slice 3.2 agentic-RAG enforcement: an unsupported claim still backed by a
    // textual extract (low confidence) is NOT force-revised...
    expect(shouldReviseUnsupportedClaims([
      { support: "unsupported", claim: "Minor descriptive claim.", confidence: 0.4, extractKeys: ["k1"] },
    ])).toBe(false);
    // ...but an unsupported claim with NO extract and NO computation IS enforced.
    expect(shouldReviseUnsupportedClaims([
      { support: "unsupported", claim: "An unsupported claim with no backing.", confidence: 0.2 },
    ])).toBe(true);
    expect(shouldReviseUnsupportedClaims([
      { support: "unsupported", claim: "This policy must be adopted by clinics immediately.", confidence: 0.7 },
    ])).toBe(true);
    expect(shouldReviseUnsupportedClaims([
      { support: "contradicted", claim: "Contradicted claim.", confidence: 0.2 },
    ])).toBe(true);
  });
});

function webCandidate(url: string, bucketName: string): DiscoveryCandidate {
  return {
    origin: "web",
    provider: "exa",
    evidenceStrength: "medium",
    title: `Report ${url}`,
    locator: url,
    url,
    snippet: "Discovery snippet.",
    bucketName,
    discoveryQuery: `${bucketName} query`,
    metadataJson: JSON.stringify({ bucketName }),
  };
}

function failedAttempt(provider: "exa" | "jina", url: string, failureReason: string): ReadAttempt {
  return {
    provider,
    ok: false,
    title: url,
    url,
    text: "",
    snippet: `${provider} failed: ${failureReason}`,
    failureReason,
  };
}

function readableAttempt(provider: "exa" | "jina", url: string, text: string): ReadAttempt {
  return {
    provider,
    ok: true,
    title: "Readable report",
    url,
    text,
    snippet: text.slice(0, 300),
  };
}
