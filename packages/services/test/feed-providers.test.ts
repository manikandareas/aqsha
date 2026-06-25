import { describe, expect, test } from "bun:test";
import { summarizeTimeline } from "../src/feed/providers/gdelt";
import {
  buildGoogleNewsFeedInputs,
  dedupeGoogleNewsItems,
  type GoogleNewsItem,
  parseGoogleNewsRss,
} from "../src/feed/providers/googleNews";
import { parseBatchExecuteUrl } from "../src/feed/providers/googleNewsDecode";
import {
  deriveClaimTopics,
  isScienceHealthClaim,
  mapTextualRatingToVerdict,
} from "../src/feed/providers/factCheck";
import {
  extractArticlePreviewFromHtml,
  extractArticleTextFromHtml,
} from "../src/papers/articlePreview";

describe("gdelt summarizeTimeline", () => {
  test("downsample ke 24 + trendScore momentum", () => {
    const values = Array.from({ length: 100 }, (_, i) => (i + 1) / 100);
    const { sparkline, trendScore } = summarizeTimeline(values);
    expect(sparkline.length).toBe(24);
    expect(trendScore).toBeGreaterThan(0);
  });
  test("kosong → 0", () => {
    expect(summarizeTimeline([])).toEqual({ sparkline: [], trendScore: 0 });
  });
});

describe("googleNews parseGoogleNewsRss", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Judul Berita - Kompas</title><link>https://news.google.com/rss/articles/ABC</link>
      <guid>guid-1</guid><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <source url="https://www.kompas.com">Kompas</source></item>
  </channel></rss>`;

  test("parse item + strip publisher suffix + domain", () => {
    const items = parseGoogleNewsRss(xml);
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe("Judul Berita");
    expect(items[0]!.guid).toBe("guid-1");
    expect(items[0]!.publisherName).toBe("Kompas");
    expect(items[0]!.publisherDomain).toBe("kompas.com");
    expect(items[0]!.redirectUrl).toContain("news.google.com");
  });
});

describe("googleNews dedupe + build", () => {
  const mk = (over: Partial<GoogleNewsItem>): GoogleNewsItem => ({
    title: "T",
    redirectUrl: "https://news.google.com/rss/articles/X",
    guid: "g",
    publisherName: "Pub",
    ...over,
  });

  test("dedupe by guid + secondary (title+domain)", () => {
    const out = dedupeGoogleNewsItems(
      [
        { label: "A", items: [mk({ guid: "g1", title: "Sama", publisherDomain: "x.com" })] },
        { label: "B", items: [mk({ guid: "g1" })] }, // guid sama → drop
        { label: "C", items: [mk({ guid: "g2", title: "Sama", publisherDomain: "x.com" })] }, // secondary sama → drop
        { label: "D", items: [mk({ guid: "g3", title: "Beda" })] },
      ],
      10,
    );
    expect(out.map((o) => o.item.guid)).toEqual(["g1", "g3"]);
  });

  test("buildGoogleNewsFeedInputs → kind news, summary kosong, dedupeKey", () => {
    const inputs = buildGoogleNewsFeedInputs([{ item: mk({ guid: "g9" }), topicLabel: "Sains" }], 100);
    expect(inputs[0]!.kind).toBe("news");
    expect(inputs[0]!.summary).toBe("");
    expect(inputs[0]!.dedupeKey).toBe("news:gnews:g9");
    expect(inputs[0]!.topics).toEqual(["Sains"]);
  });
});

describe("googleNewsDecode parseBatchExecuteUrl", () => {
  test("ekstrak URL dari payload Fbv4je", () => {
    const inner = JSON.stringify(["garturlres", "https://publisher.com/article"]);
    const outer = JSON.stringify([["wrb.fr", "Fbv4je", inner]]);
    expect(parseBatchExecuteUrl(`)]}'\n${outer}`)).toBe("https://publisher.com/article");
  });
  test("tanpa Fbv4je → null", () => {
    expect(parseBatchExecuteUrl(")]}'\n[]")).toBeNull();
  });
});

describe("factCheck verdict + topics", () => {
  test("mapTextualRatingToVerdict graduasi", () => {
    expect(mapTextualRatingToVerdict("Hoaks")).toEqual({ verdict: "contradicted", severity: "high" });
    expect(mapTextualRatingToVerdict("Sebagian benar")).toEqual({
      verdict: "partially_supported",
      severity: "warning",
    });
    expect(mapTextualRatingToVerdict("Menyesatkan")).toEqual({
      verdict: "needs_context",
      severity: "warning",
    });
    expect(mapTextualRatingToVerdict("Benar")).toEqual({ verdict: "supported", severity: "info" });
    expect(mapTextualRatingToVerdict("xyz")).toEqual({ verdict: "unverified", severity: "info" });
  });
  test("isScienceHealthClaim + deriveClaimTopics", () => {
    expect(isScienceHealthClaim("vaksin covid aman")).toBe(true);
    expect(isScienceHealthClaim("pemilu 2024")).toBe(false);
    expect(deriveClaimTopics("vaksin covid")).toContain("COVID-19");
    expect(deriveClaimTopics("xyz tanpa kata kunci")).toEqual(["Sains"]);
  });
});

describe("articlePreview ekstraksi", () => {
  test("extractArticleTextFromHtml ambil paragraf prosa, buang boilerplate", () => {
    const html = `<article>
      <p>Para peneliti menemukan bahwa vaksin memberikan perlindungan signifikan terhadap penyakit menular.</p>
      <p>Baca juga: artikel lain</p>
      <p>Studi ini melibatkan ribuan partisipan selama dua tahun penuh dengan hasil yang konsisten dan terukur.</p>
    </article>`;
    const text = extractArticleTextFromHtml(html);
    expect(text).toContain("Para peneliti");
    expect(text).toContain("Studi ini melibatkan");
    expect(text).not.toContain("Baca juga");
  });

  test("extractArticlePreviewFromHtml resolve og:image absolut", () => {
    const html = `<head><meta property="og:image" content="/img/cover.jpg" /></head><body><article><p>${"a".repeat(40)}. teks.</p></article></body>`;
    const preview = extractArticlePreviewFromHtml(html, "https://news.example.org/a");
    expect(preview.imageUrl).toBe("https://news.example.org/img/cover.jpg");
  });
});
