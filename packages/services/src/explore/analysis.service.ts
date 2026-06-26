/**
 * ExploreAnalysisService — Gap Finder + Tension Map (berat) sbg background job + SEMANTIC-REUSE.
 *
 * Alur `getOrStartAnalysis(q)`:
 *   1. Exact: queryNorm match & fresh → kembalikan (status ready/pending).
 *   2. Semantic: embed `q` → vector-search analisis lama. Jarak < NEAR → pakai hasilnya
 *      langsung (hemat penuh); jarak < SIMILAR → ambil `papers`-nya sbg SEED (bahan), worker
 *      tinggal top-up fetch selisihnya. Else fetch penuh.
 *   3. Insert `pending` (+embedding) → enqueue job (dedupe `jobId = queryNorm`).
 * Worker (`runAnalysis`) baca korpus (seed + OpenAlex/arXiv) → 1 LLM call (gpt-4o-mini) →
 * patch `ready`. Hasil = heuristik, bukan otoritatif. Bukan data per-user (analisis topik global).
 */
import {
  enqueue,
  EXPLORE_QUEUES,
} from "../clients/queue";
import { embedTexts, isEmbeddingEnabled } from "../clients/embeddings";
import { normalizeKey } from "../lib/text";
import {
  type Db,
  ExploreAnalysesRepo,
  type ExploreAnalysis,
} from "@aqsha/db";
import { generateText } from "ai";
import { fastModel } from "../clients/fast-model";
import { fetchOpenAlexWorks } from "../feed/openAlex";
import type { ExplorePaperInput } from "./model";
import { ResearchService } from "../research";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // hasil dianggap fresh 7 hari
const NEAR_IDENTICAL = 0.05; // jarak cosine: makna ~identik → reuse hasil penuh
const SIMILAR = 0.18; // jarak cosine: bersinggungan → reuse bahan (seed) + top-up
const CORPUS_TARGET = 24;
const CORPUS_MIN = 8;

/** Paper sbg "bahan" analisis (korpus) — disimpan jsonb utk semantic-reuse. */
export type AnalysisPaper = {
  key: string;
  title: string;
  abstract: string;
  year?: number;
  citedByCount?: number;
  doi?: string;
  authors?: string[];
  url?: string;
};

export type GapResult = {
  num: string;
  question: string;
  citeA: string;
  citeB: string;
  novelty: number;
};
export type TensionClaim = { label: string; weight?: number };
export type TensionData = { question: string; support: TensionClaim[]; dispute: TensionClaim[] };

export type ExploreAnalysisStatus = "idle" | "pending" | "ready" | "error";
export type ExploreAnalysisResult = {
  status: ExploreAnalysisStatus;
  gap: GapResult[];
  tension: TensionData | null;
};

export type ExploreAnalysisJob = { id: string; query: string; seedPapers: AnalysisPaper[] | null };

function normalizeQuery(q: string): string {
  return normalizeKey(q).slice(0, 200);
}

function isFresh(row: { createdAt: number }, now: number): boolean {
  return now - row.createdAt < TTL_MS;
}

function shapeResult(row: ExploreAnalysis): ExploreAnalysisResult {
  return {
    status: (row.status as ExploreAnalysisStatus) ?? "pending",
    gap: Array.isArray(row.gap) ? (row.gap as GapResult[]) : [],
    tension: row.tension && typeof row.tension === "object" ? (row.tension as TensionData) : null,
  };
}

export const ExploreAnalysisService = {
  /** Entry frontend: kembalikan hasil cached/reused ATAU mulai job (status pending). */
  async getOrStartAnalysis(db: Db, q: string): Promise<ExploreAnalysisResult> {
    const query = q.trim();
    if (query.length < 2) return { status: "idle", gap: [], tension: null };
    const norm = normalizeQuery(query);
    const now = Date.now();

    // 1. Exact hit
    const exact = await ExploreAnalysesRepo.findByQueryNorm(db, norm);
    if (exact && isFresh(exact, now)) {
      if (exact.status === "ready") {
        await ExploreAnalysesRepo.bumpLastUsed(db, exact.id, now);
        return shapeResult(exact);
      }
      if (exact.status === "pending") return { status: "pending", gap: [], tension: null };
      // status "error" & fresh → jatuh ke recompute di bawah
    }

    // 2. Embed + semantic reuse
    let embedding: number[] | null = null;
    if (isEmbeddingEnabled()) {
      try {
        embedding = (await embedTexts([query]))[0] ?? null;
      } catch {
        embedding = null;
      }
    }

    let seedPapers: AnalysisPaper[] | null = null;
    if (embedding) {
      const similar = await ExploreAnalysesRepo.searchSimilar(db, { queryVector: embedding, limit: 3 });
      const best = similar.find((s) => s.status === "ready" && s.queryNorm !== norm && isFresh(s, now));
      if (best) {
        if (best.distance < NEAR_IDENTICAL) {
          await ExploreAnalysesRepo.bumpLastUsed(db, best.id, now);
          return shapeResult(best); // makna ~identik → hemat penuh
        }
        if (best.distance < SIMILAR && Array.isArray(best.papers)) {
          seedPapers = best.papers as AnalysisPaper[]; // bersinggungan → reuse bahan
        }
      }
    }

    // 3. Insert pending + enqueue (dedupe by queryNorm)
    const row = await ExploreAnalysesRepo.upsertPending(db, {
      id: exact?.id ?? crypto.randomUUID(),
      query,
      queryNorm: norm,
      queryEmbedding: embedding,
      status: "pending",
      papers: null,
      gap: null,
      tension: null,
      createdAt: now,
      lastUsedAt: now,
    });
    await enqueue(
      EXPLORE_QUEUES.exploreAnalysis,
      { id: row.id, query, seedPapers } satisfies ExploreAnalysisJob,
      { jobId: norm },
    );
    return { status: "pending", gap: [], tension: null };
  },

  /** Worker: bangun korpus (seed + fetch) → LLM gap/tension → patch ready. */
  async runAnalysis(db: Db, job: ExploreAnalysisJob): Promise<void> {
    const now = Date.now();
    let corpus: AnalysisPaper[] = Array.isArray(job.seedPapers) ? job.seedPapers : [];

    try {
      const fresh = await fetchOpenAlexWorks({ query: job.query, limit: CORPUS_TARGET });
      corpus = mergePapers(corpus, fresh.papers.map(paperInputToAnalysis));
    } catch {
      // OpenAlex gagal → andalkan seed / arXiv
    }
    if (corpus.length < CORPUS_MIN) {
      try {
        const arxiv = await ResearchService.searchArxiv({ query: job.query, limit: 10 });
        corpus = mergePapers(corpus, arxiv.map(candidateToAnalysis));
      } catch {
        // best-effort top-up
      }
    }
    corpus = corpus.filter((p) => p.title && (p.abstract || p.citedByCount)).slice(0, CORPUS_TARGET + 4);

    if (corpus.length === 0) {
      await ExploreAnalysesRepo.patchResult(db, job.id, {
        status: "ready",
        papers: [],
        gap: [],
        tension: null,
        lastUsedAt: now,
      });
      return;
    }

    const { gap, tension } = await generateAnalysis(job.query, corpus);
    await ExploreAnalysesRepo.patchResult(db, job.id, {
      status: "ready",
      papers: corpus,
      gap,
      tension,
      lastUsedAt: now,
    });
  },
};

function paperInputToAnalysis(p: ExplorePaperInput): AnalysisPaper {
  return {
    key: p.key,
    title: p.title,
    abstract: p.abstract ?? p.snippet ?? "",
    year: p.year,
    citedByCount: p.citedByCount,
    doi: p.doi,
    authors: p.authors,
    url: p.url,
  };
}

function candidateToAnalysis(c: {
  title: string;
  snippet: string;
  doi?: string;
  url?: string;
  locator: string;
}): AnalysisPaper {
  return {
    key: c.doi ? `doi:${c.doi}` : c.locator || c.url || `title:${c.title}`,
    title: c.title,
    abstract: c.snippet ?? "",
    doi: c.doi,
    url: c.url,
  };
}

function mergePapers(base: AnalysisPaper[], extra: AnalysisPaper[]): AnalysisPaper[] {
  const seen = new Set(base.map((p) => p.doi ?? p.key));
  const out = [...base];
  for (const p of extra) {
    const k = p.doi ?? p.key;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function citeOf(p: AnalysisPaper): string {
  const last = (p.authors?.[0] ?? "").trim().split(/\s+/).slice(-1)[0] ?? "";
  return `${last || "Anon"} ${p.year ?? ""}`.trim();
}

async function generateAnalysis(
  query: string,
  corpus: AnalysisPaper[],
): Promise<{ gap: GapResult[]; tension: TensionData | null }> {
  const docs = corpus
    .map((p, i) => `[${i + 1}] ${citeOf(p)} — ${p.title} (sitasi ${p.citedByCount ?? 0})\n${truncate(p.abstract, 600)}`)
    .join("\n\n");

  const prompt =
    `Kamu analis riset. Dari ${corpus.length} abstrak paper tentang "${query}" di bawah, hasilkan:\n` +
    "1) 3 CELAH RISET (gap): pertanyaan penting yang BELUM terjawab, tiap celah dirujuk 2 sitasi dari daftar.\n" +
    "2) PETA TENSI: satu pertanyaan kontroversial + sisi MENDUKUNG vs MEMBANTAH (label = topik — Nama Tahun).\n" +
    'Balas HANYA JSON valid (tanpa markdown/penjelasan), bentuk PERSIS:\n' +
    '{"gap":[{"question":"...","citeA":"Nama Tahun","citeB":"Nama Tahun","novelty":70}],' +
    '"tension":{"question":"...","support":[{"label":"...","weight":1.2}],"dispute":[{"label":"...","weight":1}]}}\n' +
    "novelty = 0..100 (makin tinggi makin jarang diteliti). Semua teks Bahasa Indonesia.\n\n" +
    `Abstrak:\n${docs}`;

  const { text } = await generateText({ model: fastModel(), prompt });
  return parseAnalysis(text);
}

/** Parse JSON output LLM (toleran: strip code-fence, ambil objek pertama). Gagal → kosong. */
export function parseAnalysis(text: string): { gap: GapResult[]; tension: TensionData | null } {
  const empty = { gap: [] as GapResult[], tension: null as TensionData | null };
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object") return empty;
  const obj = parsed as { gap?: unknown; tension?: unknown };

  const gap: GapResult[] = Array.isArray(obj.gap)
    ? obj.gap.slice(0, 3).map((g, i) => {
        const r = (g ?? {}) as Record<string, unknown>;
        return {
          num: String(i + 1).padStart(2, "0"),
          question: String(r.question ?? "").slice(0, 280),
          citeA: String(r.citeA ?? "").slice(0, 80),
          citeB: String(r.citeB ?? "").slice(0, 80),
          novelty: clampNovelty(r.novelty),
        };
      }).filter((g) => g.question.length > 0)
    : [];

  let tension: TensionData | null = null;
  if (obj.tension && typeof obj.tension === "object") {
    const tRaw = obj.tension as Record<string, unknown>;
    const question = String(tRaw.question ?? "").slice(0, 280);
    const support = toClaims(tRaw.support);
    const dispute = toClaims(tRaw.dispute);
    if (question && (support.length > 0 || dispute.length > 0)) {
      tension = { question, support, dispute };
    }
  }
  return { gap, tension };
}

function clampNovelty(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toClaims(v: unknown): TensionClaim[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 4)
    .map((c) => {
      const r = (c ?? {}) as Record<string, unknown>;
      const label = String(r.label ?? "").slice(0, 120);
      const weight = typeof r.weight === "number" && Number.isFinite(r.weight) ? r.weight : 1;
      return { label, weight };
    })
    .filter((c) => c.label.length > 0);
}
