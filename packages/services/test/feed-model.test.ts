import { describe, expect, test } from "bun:test";
import {
  buildFeedItemRow,
  deriveOrderAt,
  deriveSearchText,
  type FeedItemInput,
  shapeFeedItem,
} from "../src/feed/model";
import { matchesTopicCategory } from "../src/feed/topicCategories";

const baseInput: FeedItemInput = {
  kind: "paper",
  title: "Quantum Computing",
  summary: "A study of qubits",
  url: "https://example.org",
  provider: "openalex",
  sourceLabel: "OpenAlex",
  topics: ["physics", "Quantum"],
  trendScore: 3,
  dedupeKey: "paper:k1",
};

describe("deriveOrderAt", () => {
  test("publishedAt menang atas lastSeenAt/createdAt", () => {
    expect(deriveOrderAt({ publishedAt: 50, lastSeenAt: 99, createdAt: 99 })).toBe(50);
  });
  test("fallback ke lastSeenAt saat tak ada publishedAt", () => {
    expect(deriveOrderAt({ lastSeenAt: 77, createdAt: 10 })).toBe(77);
  });
});

describe("deriveSearchText", () => {
  test("lowercase + gabung title+summary+topics + collapse whitespace", () => {
    const out = deriveSearchText({
      title: "Quantum   Computing",
      summary: "A Study",
      topics: ["Physics", "ML"],
    });
    expect(out).toBe("quantum computing a study physics ml");
  });
  test("cap 2000 char", () => {
    const out = deriveSearchText({ title: "x".repeat(5000), summary: "", topics: [] });
    expect(out.length).toBe(2000);
  });
});

describe("buildFeedItemRow", () => {
  test("mint id, set created/lastSeen=now, derive orderAt + searchText", () => {
    const row = buildFeedItemRow(baseInput, 12345);
    expect(row.id).toBeString();
    expect(row.createdAt).toBe(12345);
    expect(row.lastSeenAt).toBe(12345);
    expect(row.orderAt).toBe(12345); // tak ada publishedAt → fallback now
    expect(row.searchText).toBe("quantum computing a study of qubits physics quantum");
    expect(row.primaryClaim).toBeNull();
  });
  test("publishedAt jadi orderAt", () => {
    const row = buildFeedItemRow({ ...baseInput, publishedAt: 999 }, 12345);
    expect(row.orderAt).toBe(999);
  });
});

describe("shapeFeedItem", () => {
  test("strip field internal, surface primaryClaim sebagai claim, graft enrichments", () => {
    const claim = {
      claim: "X benar",
      verdict: "supported" as const,
      verdictSource: "src",
      verdictBy: "human" as const,
      verdictLabelRaw: "Benar",
    };
    const shaped = shapeFeedItem(
      {
        id: "f1",
        kind: "claim",
        title: "T",
        summary: "S",
        tldr: null,
        tldrId: null,
        titleId: null,
        url: "u",
        resolvedUrl: null,
        imageUrl: null,
        articleText: null,
        enrichAttempts: null,
        provider: "google_factcheck",
        sourceLabel: "FactCheck",
        paperKey: null,
        doi: null,
        authors: null,
        year: null,
        venue: null,
        pdfUrl: null,
        citedByCount: null,
        isOpenAccess: null,
        topics: ["sains"],
        trendScore: 1,
        retractionStatus: null,
        primaryClaim: claim,
        stanceSupporting: null,
        stanceContrasting: null,
        sparkline: null,
        publishedAt: null,
      },
      { relevanceScore: 80, reason: "karena minatmu", saved: true },
    );
    expect(shaped._id).toBe("f1");
    expect(shaped.claim).toEqual(claim);
    expect(shaped.primaryClaim).toEqual(claim);
    expect(shaped.tldr).toBeUndefined(); // null → undefined
    expect(shaped.relevanceScore).toBe(80);
    expect(shaped.saved).toBe(true);
    expect((shaped as Record<string, unknown>).dedupeKey).toBeUndefined();
  });
});

describe("matchesTopicCategory", () => {
  test("paper fisika → sains_teknologi", () => {
    expect(matchesTopicCategory("sains_teknologi", ["physics"], "Quantum study")).toBe(true);
  });
  test("vaksin → kesehatan, bukan lingkungan", () => {
    expect(matchesTopicCategory("kesehatan", ["vaksin"], "Berita vaksin")).toBe(true);
    expect(matchesTopicCategory("lingkungan", ["vaksin"], "Berita vaksin")).toBe(false);
  });
});
