import { describe, expect, test } from "bun:test";
import {
  buildGoogleNewsFeedInputs,
  dedupeGoogleNewsItems,
  type GoogleNewsItem,
  parseGoogleNewsRss,
} from "../src/feed/providers/googleNews";
import { parseBatchExecuteUrl } from "../src/feed/providers/googleNewsDecode";
import {
  extractArticlePreviewFromHtml,
  extractArticleTextFromHtml,
} from "../src/papers/articlePreview";

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

  test("buildGoogleNewsFeedInputs → kind news, summary kosong, dedupeKey kanonik title", () => {
    const inputs = buildGoogleNewsFeedInputs(
      [{ item: mk({ guid: "g9", title: "Vaksin Baru", publisherDomain: "kompas.com" }), topicLabel: "Sains" }],
      100,
    );
    expect(inputs[0]!.kind).toBe("news");
    expect(inputs[0]!.summary).toBe("");
    expect(inputs[0]!.dedupeKey).toBe("news:kompas.com:vaksin baru");
    expect(inputs[0]!.topics).toEqual(["Sains"]);
  });

  test("dedupeKey kanonik meng-collapse story tersindikasi (guid beda, title+domain sama)", () => {
    // Fix bug duplikat: guid berbeda (RSS/seed beda) TAPI cerita sama → satu dedupeKey.
    const [a, b] = buildGoogleNewsFeedInputs(
      [
        { item: mk({ guid: "gA", title: "Gempa Bumi M5", publisherDomain: "detik.com" }), topicLabel: "Sains" },
        { item: mk({ guid: "gB", title: "Gempa Bumi M5", publisherDomain: "detik.com" }), topicLabel: "Lingkungan" },
      ],
      100,
    );
    expect(a!.dedupeKey).toBe(b!.dedupeKey); // upsertByDedupeKey → satu baris, bukan dua
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
