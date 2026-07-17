import { describe, expect, test } from "bun:test";
import {
  extractArticlePreviewFromHtml,
  extractArticleTextFromHtml,
} from "../src/papers/articlePreview";

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
