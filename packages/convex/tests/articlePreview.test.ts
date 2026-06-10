import { describe, expect, it } from "vitest";
import {
  cleanPlainText,
  extractArticlePreviewFromHtml,
  extractArticleTextFromHtml,
} from "../convex/papers/articlePreview";

describe("article preview extraction", () => {
  it("extracts a resolved metadata image and article paragraphs", () => {
    const preview = extractArticlePreviewFromHtml(
      `
      <html>
        <head>
          <meta property="og:image" content="/images/review.jpg" />
        </head>
        <body>
          <nav><p>This navigation sentence should not appear.</p></nav>
          <article>
            <p>Bagikan artikel ini kepada teman-teman Anda.</p>
            <p>Klaim tersebut menyebar luas di media sosial dan membutuhkan konteks ilmiah yang lebih lengkap sebelum dibagikan kembali kepada pembaca.</p>
            <p>Penelusuran pemeriksa menemukan bahwa narasi utama tidak sesuai dengan data resmi yang tersedia dan mengabaikan penjelasan lembaga terkait.</p>
            <p>Baca juga: daftar artikel lain yang bukan isi utama.</p>
          </article>
        </body>
      </html>
      `,
      "https://cekfakta.example/report/1",
    );

    expect(preview.imageUrl).toBe("https://cekfakta.example/images/review.jpg");
    expect(preview.articleText).toBe(
      [
        "Klaim tersebut menyebar luas di media sosial dan membutuhkan konteks ilmiah yang lebih lengkap sebelum dibagikan kembali kepada pembaca.",
        "Penelusuran pemeriksa menemukan bahwa narasi utama tidak sesuai dengan data resmi yang tersedia dan mengabaikan penjelasan lembaga terkait.",
      ].join("\n\n"),
    );
  });

  it("falls back to JSON-LD image metadata", () => {
    const preview = extractArticlePreviewFromHtml(
      `
      <html>
        <head>
          <script type="application/ld+json">
            {"@type":"NewsArticle","image":{"url":"https://cdn.example/news.png"}}
          </script>
        </head>
        <body>
          <main>
            <p>Artikel ini menjelaskan temuan awal dengan kalimat yang cukup panjang untuk dianggap sebagai isi.</p>
            <p>Paragraf kedua memberi konteks tambahan sehingga ekstraktor memiliki cukup sinyal prosa.</p>
          </main>
        </body>
      </html>
      `,
      "https://news.example/item",
    );

    expect(preview.imageUrl).toBe("https://cdn.example/news.png");
  });

  it("cleans plain article text with the same paragraph filter", () => {
    expect(
      cleanPlainText(`
        # Judul

        Baca juga: tautan promosi internal.

        Riset terbaru menunjukkan pola yang konsisten pada kelompok pasien setelah intervensi dilakukan dalam periode pemantauan yang cukup panjang.

        - Temuan kedua menambahkan konteks metodologis yang penting untuk membaca hasil penelitian dan membandingkan populasi studi secara hati-hati.
      `),
    ).toBe(
      [
        "Riset terbaru menunjukkan pola yang konsisten pada kelompok pasien setelah intervensi dilakukan dalam periode pemantauan yang cukup panjang.",
        "Temuan kedua menambahkan konteks metodologis yang penting untuk membaca hasil penelitian dan membandingkan populasi studi secara hati-hati.",
      ].join("\n\n"),
    );
  });

  it("returns undefined for template-like HTML without enough prose", () => {
    expect(
      extractArticleTextFromHtml(`
        <body>
          <main>
            <p>Bagikan</p>
            <p>Baca juga: berita terkait.</p>
          </main>
        </body>
      `),
    ).toBeUndefined();
  });
});
