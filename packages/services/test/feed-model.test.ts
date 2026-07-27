import { describe, expect, test } from "bun:test";
import {
  buildFeedItemRow,
  deriveOrderAt,
  parsePublishedAt,
  shapeFeedItem,
} from "../src/feed/model";
import { matchesTopicCategory } from "../src/feed/topicCategories";
import type { LiteraturePaper } from "../src/papers/work";

const PAPER: LiteraturePaper = {
  key: "doi:10.1/qubit",
  title: "Quantum Computing",
  snippet: "A study of qubits",
  doi: "10.1/qubit",
  url: "https://example.org",
  pdfUrl: null,
  hasPdf: false,
  authors: ["A"],
  year: 2023,
  publicationDate: "2023-06-01",
  venue: "Nature",
  citedByCount: 3,
  isOpenAccess: false,
  oaStatus: null,
  workType: "article",
  language: "en",
  isRetracted: false,
  topics: ["physics", "Quantum"],
};

describe("deriveOrderAt", () => {
  test("publishedAt menang atas lastSeenAt/createdAt", () => {
    expect(deriveOrderAt({ publishedAt: 50, lastSeenAt: 99, createdAt: 99 })).toBe(50);
  });

  test("tanpa publishedAt jatuh ke lastSeenAt", () => {
    expect(deriveOrderAt({ lastSeenAt: 70, createdAt: 99 })).toBe(70);
  });
});

describe("parsePublishedAt", () => {
  test("tanggal ISO jadi epoch ms", () => {
    expect(parsePublishedAt("2023-06-01")).toBe(Date.parse("2023-06-01"));
  });

  test("null dan tanggal ngawur jadi undefined", () => {
    expect(parsePublishedAt(null)).toBeUndefined();
    expect(parsePublishedAt("bukan-tanggal")).toBeUndefined();
  });
});

describe("buildFeedItemRow", () => {
  test("menurunkan header mesin dari paper", () => {
    const row = buildFeedItemRow(PAPER, 1_000);
    expect(row.kind).toBe("paper");
    expect(row.key).toBe("doi:10.1/qubit");
    expect(row.dedupeKey).toBe("paper:doi:10.1/qubit");
    expect(row.trendScore).toBe(3);
    expect(row.publishedAt).toBe(Date.parse("2023-06-01"));
    expect(row.orderAt).toBe(Date.parse("2023-06-01"));
    expect(row.createdAt).toBe(1_000);
    expect(row.lastSeenAt).toBe(1_000);
    expect(row.id).toMatch(/[0-9a-f-]{36}/);
  });

  test("paper tanpa sitasi dan tanpa tanggal tetap punya urutan", () => {
    const row = buildFeedItemRow({ ...PAPER, citedByCount: null, publicationDate: null }, 2_000);
    expect(row.trendScore).toBe(0);
    expect(row.publishedAt).toBeUndefined();
    expect(row.orderAt).toBe(2_000);
  });
});

describe("shapeFeedItem", () => {
  test("baris jadi paper + feedItemId, tanpa field mesin", () => {
    // `FeedItemRow` = id + persis 18 field LiteraturePaper, jadi spread ini typecheck apa adanya.
    expect(shapeFeedItem({ id: "feed_1", ...PAPER })).toEqual({ ...PAPER, feedItemId: "feed_1" });
  });
});

describe("matchesTopicCategory", () => {
  test("mencocokkan topik ke kategori", () => {
    expect(matchesTopicCategory("sains_teknologi", ["physics"], "Quantum")).toBe(true);
  });
});
