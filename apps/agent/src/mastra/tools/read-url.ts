import { scrapeUrlFirecrawl } from "@aqsha/services/research";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { chargeToolUsage, numberPersistAndOutput, precheckExternalSearch } from "../lib/research";
import { callerId } from "../lib/tool-context";

/**
 * read_url — baca isi PENUH sebuah halaman/artikel via Firecrawl scrape (FEAT-1). READ, tanpa
 * approval. Menaikkan plafon bukti dari snippet 1.200 char ke full-text sehingga kekuatan bukti
 * dinilai dari isi, bukan abstrak. Alur CTX-2 manual (bentuk hasil ≠ kandidat pencarian, jadi tak
 * lewat `runResearchTool`): gate kuota non-consuming → scrape → debit `external_search` hanya
 * saat scrape sukses. Sumber yang terbaca ikut dipersist ke `research_sources` lewat
 * `numberPersistAndOutput` → dapat nomor [n] di chat (deep: nomor global belakangan) dan tampil
 * di panel Sumber.
 */

/** Plafon markdown yang dikirim ke model (~10k token). History di-elide `ElideHistoryToolResults`. */
const MAX_FULLTEXT_CHARS = 40_000;

export const readUrl = createTool({
  id: "read_url",
  description:
    "Baca isi PENUH satu URL (artikel, halaman publikasi, PDF ber-landing-page) sebagai markdown. Pakai saat cuplikan hasil pencarian tidak cukup untuk menilai/mengutip bukti — bukan untuk menemukan sumber (pakai search_*). Hemat: baca hanya sumber yang paling menentukan, jangan membaca semua hasil pencarian.",
  inputSchema: z.object({
    url: z.string().min(1).max(2_000).describe("URL lengkap (http/https) yang mau dibaca."),
  }),
  execute: async (input, ctx) => {
    const ownerUserId = callerId(ctx);
    if (!(await precheckExternalSearch(ctx, ownerUserId))) {
      return { ok: false as const, note: "Kuota pencarian eksternal sudah habis untuk periode ini." };
    }
    const result = await scrapeUrlFirecrawl({ url: input.url });
    if (!result.ok) {
      return {
        ok: false as const,
        note:
          `Pembacaan URL GAGAL — ini BUKAN "halaman kosong". ${result.failureReason ?? "unknown"}. ` +
          "Kredit tidak dipotong. Nilai bukti dari cuplikan pencarian yang ada, atau coba sumber lain.",
      };
    }
    const charged = await chargeToolUsage(ctx, {
      ownerUserId,
      feature: "external_search",
      tool: "read_url",
      provider: "firecrawl_read",
    });
    if (!charged) {
      console.error("[tools] read_url debit gagal pasca-sukses scrape (race kuota) — hasil tetap dikembalikan");
    }
    const truncated = result.markdown.length > MAX_FULLTEXT_CHARS;
    const output = await numberPersistAndOutput(ctx, {
      ownerUserId,
      candidates: [
        {
          origin: "web",
          provider: "firecrawl_read",
          evidenceStrength: "strong",
          title: result.title,
          locator: result.url,
          url: result.url,
          snippet: result.snippet,
        },
      ],
      discoveryQuery: input.url,
    });
    const source = output.results[0];
    return {
      ok: true as const,
      ...(source?.n !== undefined ? { n: source.n } : {}),
      title: result.title,
      url: result.url,
      markdown: result.markdown.slice(0, MAX_FULLTEXT_CHARS),
      ...(truncated
        ? { note: `Konten dipotong pada ${MAX_FULLTEXT_CHARS} karakter (halaman lebih panjang).` }
        : {}),
    };
  },
});
