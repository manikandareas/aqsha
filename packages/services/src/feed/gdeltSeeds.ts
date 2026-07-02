/**
 * Taksonomi seed GDELT untuk lane `refreshGdeltNews`. Scope semi-global: mayoritas seed
 * berbahasa Indonesia (outlet ID sudah meliput dunia/sains/finansial) + sebagian kecil seed
 * global-English untuk topik frontier (AI, antariksa, sains mutakhir, ekonomi global).
 *
 * INVARIAN PERSONALISASI: `topics` tiap seed HARUS reuse nilai dari `INTEREST_FIELD_TOPICS`
 * (single source of truth). Item yang di-ingest ditandai `topics` ini → `interestMatch`
 * (feed/ranking.ts) langsung menyala untuk user yang memilih field terkait saat onboarding.
 * Union semua `topics` menutup ke-15 field minat.
 */
import { INTEREST_FIELD_TOPICS as T } from "./interestKeywords";

export type GdeltSeedScope = "id" | "global";

export type GdeltSeed = {
  /** Label diagnostik (log). Bukan bagian dari personalisasi. */
  label: string;
  /** Topic personalisasi (WAJIB dari INTEREST_FIELD_TOPICS). */
  topics: string[];
  /** Query GDELT tanpa filter bahasa; `gdeltSeedQuery` menambahkan sourcelang dari scope. */
  query: string;
  scope: GdeltSeedScope;
};

/** ID-first (dedupe lintas-seed memprioritaskan sumber Indonesia yang muncul lebih dulu). */
export const GDELT_TOPIC_SEEDS: GdeltSeed[] = [
  // ── Indonesia (sourcelang:indonesian) ─────────────────────────────────────
  {
    label: "AI & Teknologi (ID)",
    topics: [...T.ai_cs, ...T.teknik],
    query: '("kecerdasan buatan" OR "artificial intelligence" OR teknologi OR startup OR robotika OR rekayasa)',
    scope: "id",
  },
  {
    label: "Kesehatan (ID)",
    topics: [...T.kesehatan, ...T.psikologi],
    query: '(kesehatan OR medis OR penyakit OR vaksin OR "kesehatan mental" OR psikologi)',
    scope: "id",
  },
  {
    label: "Sains (ID)",
    topics: [...T.fisika, ...T.biologi, ...T.kimia, ...T.matematika],
    query: "(sains OR penelitian OR fisika OR biologi OR genetika OR kimia OR matematika OR antariksa OR astronomi)",
    scope: "id",
  },
  {
    label: "Ekonomi & Finansial (ID)",
    topics: [...T.ekonomi],
    query: '(ekonomi OR bisnis OR keuangan OR "pasar saham" OR inflasi OR investasi OR fintech)',
    scope: "id",
  },
  {
    label: "Lingkungan & Iklim (ID)",
    topics: [...T.lingkungan],
    query: '(lingkungan OR iklim OR "perubahan iklim" OR "energi terbarukan" OR emisi OR konservasi)',
    scope: "id",
  },
  {
    label: "Masyarakat, Pendidikan & Hukum (ID)",
    topics: [...T.sosial_politik, ...T.pendidikan, ...T.hukum, ...T.linguistik],
    query: "(politik OR kebijakan OR masyarakat OR pendidikan OR universitas OR hukum OR linguistik OR bahasa)",
    scope: "id",
  },
  // ── Global frontier (sourcelang:english) ──────────────────────────────────
  {
    label: "AI research (global)",
    topics: [...T.ai_cs],
    query: '("artificial intelligence" OR "machine learning" OR "large language model" OR "generative AI")',
    scope: "global",
  },
  {
    label: "Science & Space (global)",
    topics: [...T.fisika, ...T.biologi, ...T.neuroscience],
    query: '(physics OR astronomy OR "space exploration" OR genomics OR neuroscience OR "quantum computing")',
    scope: "global",
  },
  {
    label: "Global economy & geopolitics (global)",
    topics: [...T.ekonomi, "political science"],
    query: '(economy OR "stock market" OR "central bank" OR geopolitics OR "international relations")',
    scope: "global",
  },
];

/** Query final seed = query + filter bahasa (implicit AND, sesuai operator GDELT). */
export function gdeltSeedQuery(seed: GdeltSeed): string {
  const lang = seed.scope === "id" ? "sourcelang:indonesian" : "sourcelang:english";
  return `${seed.query} ${lang}`;
}
