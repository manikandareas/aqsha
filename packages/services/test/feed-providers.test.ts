import { describe, expect, test } from "bun:test";
import {
  buildGdeltFeedInputs,
  dedupeGdeltItems,
  type GdeltItem,
  parseGdeltArtList,
} from "../src/feed/providers/gdelt";
import {
  extractArticlePreviewFromHtml,
  extractArticleTextFromHtml,
} from "../src/papers/articlePreview";

describe("gdelt parseGdeltArtList", () => {
  const body = JSON.stringify({
    articles: [
      {
        url: "https://www.kompas.com/sains/a",
        url_mobile: "",
        title: "Vaksin Baru &amp; Uji Klinis",
        seendate: "20260701T131500Z",
        socialimage: "https://asset.kompas.com/cover.jpg",
        domain: "kompas.com",
        language: "Indonesian",
        sourcecountry: "Indonesia",
      },
    ],
  });

  test("parse artikel + decode entity + strip www + socialimage + seendate", () => {
    const items = parseGdeltArtList(body);
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe("Vaksin Baru & Uji Klinis");
    expect(items[0]!.url).toBe("https://www.kompas.com/sains/a");
    expect(items[0]!.domain).toBe("kompas.com");
    expect(items[0]!.imageUrl).toBe("https://asset.kompas.com/cover.jpg");
    expect(new Date(items[0]!.seenDate!).toISOString()).toBe("2026-07-01T13:15:00.000Z");
  });

  test("body non-JSON (pesan throttle) → []", () => {
    expect(parseGdeltArtList("Please limit requests to one every 5 seconds")).toEqual([]);
    expect(parseGdeltArtList('{"error":"x"}')).toEqual([]); // tanpa articles[]
  });
});

describe("gdelt dedupe + build", () => {
  const mk = (over: Partial<GdeltItem>): GdeltItem => ({
    title: "T",
    url: "https://x.com/a",
    domain: "x.com",
    sourceLabel: "x.com",
    ...over,
  });

  test("dedupe by url + secondary (title+domain)", () => {
    const out = dedupeGdeltItems(
      [
        { label: "A", topics: ["ai"], items: [mk({ url: "https://a.com/1", title: "Sama", domain: "a.com" })] },
        { label: "B", topics: ["ai"], items: [mk({ url: "https://a.com/1" })] }, // url sama → drop
        { label: "C", topics: ["econ"], items: [mk({ url: "https://a.com/2", title: "Sama", domain: "a.com" })] }, // secondary sama → drop
        { label: "D", topics: ["econ"], items: [mk({ url: "https://a.com/3", title: "Beda", domain: "a.com" })] },
      ],
      10,
    );
    expect(out.map((o) => o.item.url)).toEqual(["https://a.com/1", "https://a.com/3"]);
  });

  test("buildGdeltFeedInputs → kind news, summary kosong, imageUrl saat ingest, topics seed", () => {
    const inputs = buildGdeltFeedInputs(
      [
        {
          item: mk({ url: "https://kompas.com/v", title: "Vaksin Baru", domain: "kompas.com", imageUrl: "https://i/x.jpg", seenDate: 42 }),
          topics: ["medicine", "health"],
        },
      ],
      100,
    );
    expect(inputs[0]!.kind).toBe("news");
    expect(inputs[0]!.provider).toBe("gdelt");
    expect(inputs[0]!.summary).toBe("");
    expect(inputs[0]!.imageUrl).toBe("https://i/x.jpg");
    expect(inputs[0]!.publishedAt).toBe(42);
    expect(inputs[0]!.dedupeKey).toBe("news:kompas.com:vaksin baru");
    expect(inputs[0]!.topics).toEqual(["medicine", "health"]);
  });

  test("dedupeKey kanonik meng-collapse story tersindikasi (url beda, title+domain sama)", () => {
    const [a, b] = buildGdeltFeedInputs(
      [
        { item: mk({ url: "https://detik.com/1", title: "Gempa Bumi M5", domain: "detik.com" }), topics: ["environmental science"] },
        { item: mk({ url: "https://detik.com/2", title: "Gempa Bumi M5", domain: "detik.com" }), topics: ["climate"] },
      ],
      100,
    );
    expect(a!.dedupeKey).toBe(b!.dedupeKey); // upsertByDedupeKey → satu baris, bukan dua
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
