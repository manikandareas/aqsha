/**
 * @aqsha/chat-core/deep-viz — kontrak + builder + injector blok visual berbasis bukti
 * untuk laporan `/deep` (evidence viz ala Consensus, tanpa sandbox).
 *
 * File entry MANDIRI kedua chat-core (subpath `./deep-viz` di exports map): sama seperti
 * `index.ts`, TANPA relative import supaya aman di-bundle konsumen (runtime agent Node +
 * web). Satu-satunya dependency adalah `zod` (paket npm ter-compile, bundler-safe; versi
 * dipin sama dengan apps/web + apps/agent).
 *
 * Prinsip:
 * - Angka TIDAK pernah ditulis LLM — semua agregat dihitung `buildDeepVizBlocks`
 *   deterministik; LLM hanya klasifikasi per paper + memilih POSISI blok via marker.
 * - Laporan markdown self-contained — blok di-embed sebagai fenced block ```aqsha:viz
 *   berisi JSON satu baris; FE mem-parse dengan `deepVizBlockSchema` (fallback bila korup).
 * - Anti-pemalsuan — `injectVizBlocks` MEMBUANG semua fence `aqsha:viz` tulisan model
 *   sebelum injeksi.
 *
 * Union stance/study design WAJIB sinkron dengan CHECK kolom `research_sources`
 * (`packages/db/src/schema/researchSources.ts`) — chat-core tak boleh depend db (dipakai
 * web), jadi sinkronisasi dijaga test lintas-paket di `packages/services`.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Kontrak — zod schema + type per blok (payload ber-`v: 1` untuk versioning)
// ---------------------------------------------------------------------------

/** Stance yang tampil di meter (tanpa `not_applicable` — di-exclude saat agregasi). */
export const DEEP_VIZ_STANCES = ["yes", "possibly", "mixed", "no"] as const;
export type DeepVizStance = (typeof DEEP_VIZ_STANCES)[number];

/** Hasil klasifikasi per paper (superset stance meter). */
export const DEEP_VIZ_CLASSIFIED_STANCES = [...DEEP_VIZ_STANCES, "not_applicable"] as const;
export type DeepVizClassifiedStance = (typeof DEEP_VIZ_CLASSIFIED_STANCES)[number];

export const DEEP_VIZ_STUDY_DESIGNS = [
  "meta_analysis",
  "systematic_review",
  "rct",
  "observational",
  "review",
  "other",
] as const;
export type DeepVizStudyDesign = (typeof DEEP_VIZ_STUDY_DESIGNS)[number];

/** Bucket kolom gaps-matrix (agregasi 6 design → 4 kolom). */
export const DEEP_VIZ_DESIGN_BUCKETS = ["meta_sysrev", "rct", "observational", "other"] as const;
export type DeepVizDesignBucket = (typeof DEEP_VIZ_DESIGN_BUCKETS)[number];

export type DeepVizEvidenceStrength = "strong" | "medium" | "weak";

const countSchema = z.number().int().min(0);

/**
 * Nomor urut "Gambar n" — di-stamp `injectVizBlocks` sesuai urutan blok pada dokumen
 * final. Optional untuk kompat laporan lama yang dipersist sebelum field ini ada.
 */
const figureSchema = z.number().int().min(1).optional();

/** Partial<Record<DeepVizStudyDesign, number>> — badge ikon design per baris stance. */
const designCountsSchema = z.object({
  meta_analysis: countSchema.optional(),
  systematic_review: countSchema.optional(),
  rct: countSchema.optional(),
  observational: countSchema.optional(),
  review: countSchema.optional(),
  other: countSchema.optional(),
});

export const consensusMeterBlockSchema = z.object({
  v: z.literal(1),
  type: z.literal("consensus-meter"),
  id: z.string(),
  figure: figureSchema,
  subQuestionIndex: z.number().int().min(0),
  question: z.string(),
  /** N = paper unik terklasifikasi (exclude `not_applicable`). */
  n: countSchema,
  stances: z.object({
    yes: countSchema,
    possibly: countSchema,
    mixed: countSchema,
    no: countSchema,
  }),
  designByStance: z.object({
    yes: designCountsSchema,
    possibly: designCountsSchema,
    mixed: designCountsSchema,
    no: designCountsSchema,
  }),
});

export const resultsTimelineBlockSchema = z.object({
  v: z.literal(1),
  type: z.literal("results-timeline"),
  id: z.literal("timeline"),
  figure: figureSchema,
  points: z.array(
    z.object({
      /** Nomor sitasi [n] global run — FE resolve ke kartu sumber via CitationProvider. */
      n: z.number().int().min(1),
      year: z.number().int(),
      citedByCount: z.number().int().min(0).nullable(),
    }),
  ),
});

export const topContributorsBlockSchema = z.object({
  v: z.literal(1),
  type: z.literal("top-contributors"),
  id: z.literal("contributors"),
  figure: figureSchema,
  authors: z.array(z.object({ name: z.string(), papers: z.array(z.number().int().min(1)) })),
  venues: z.array(z.object({ name: z.string(), papers: z.array(z.number().int().min(1)) })),
});

export const claimsEvidenceBlockSchema = z.object({
  v: z.literal(1),
  type: z.literal("claims-evidence"),
  id: z.literal("claims"),
  figure: figureSchema,
  claims: z.array(
    z.object({
      text: z.string(),
      reasoning: z.string(),
      papers: z.array(z.number().int().min(1)),
      /** 0..10, deterministik (bobot design × multiplier evidenceStrength). */
      score: z.number().min(0).max(10),
      label: z.enum(["strong", "moderate", "limited"]),
    }),
  ),
});

export const gapsMatrixBlockSchema = z.object({
  v: z.literal(1),
  type: z.literal("gaps-matrix"),
  id: z.literal("gaps"),
  figure: figureSchema,
  /** Outcome ternormalisasi (≤5 baris). */
  rows: z.array(z.string()),
  cols: z.tuple([
    z.literal("meta_sysrev"),
    z.literal("rct"),
    z.literal("observational"),
    z.literal("other"),
  ]),
  /** cells[row][col] = count paper unik. */
  cells: z.array(z.array(countSchema)),
});

export const openQuestionsBlockSchema = z.object({
  v: z.literal(1),
  type: z.literal("open-questions"),
  id: z.literal("open-questions"),
  figure: figureSchema,
  items: z.array(z.object({ question: z.string(), why: z.string() })),
});

export const deepVizBlockSchema = z.discriminatedUnion("type", [
  consensusMeterBlockSchema,
  resultsTimelineBlockSchema,
  topContributorsBlockSchema,
  claimsEvidenceBlockSchema,
  gapsMatrixBlockSchema,
  openQuestionsBlockSchema,
]);

export type ConsensusMeterBlock = z.infer<typeof consensusMeterBlockSchema>;
export type ResultsTimelineBlock = z.infer<typeof resultsTimelineBlockSchema>;
export type TopContributorsBlock = z.infer<typeof topContributorsBlockSchema>;
export type ClaimsEvidenceBlock = z.infer<typeof claimsEvidenceBlockSchema>;
export type GapsMatrixBlock = z.infer<typeof gapsMatrixBlockSchema>;
export type OpenQuestionsBlock = z.infer<typeof openQuestionsBlockSchema>;
export type DeepVizBlock = z.infer<typeof deepVizBlockSchema>;

/**
 * Parse payload fenced block `aqsha:viz` (string JSON) → blok tervalidasi, atau `null`
 * bila JSON korup / `v` tak dikenal / `type` tak dikenal (FE render fallback ringkas).
 */
export function parseDeepVizBlock(payload: string): DeepVizBlock | null {
  try {
    const parsed = deepVizBlockSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Builders deterministik — input klasifikasi → blok yang MEMENUHI ambang saja
// ---------------------------------------------------------------------------

/**
 * Satu unit klasifikasi = pasangan unik `n × subQuestionIndex` (duplikat → kemunculan
 * pertama menang). `stance`/`studyDesign` null = unit belum/gagal diklasifikasi.
 */
export type DeepVizSourceInput = {
  n: number;
  subQuestionIndex: number | null;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  citedByCount: number | null;
  evidenceStrength: DeepVizEvidenceStrength;
  stance: DeepVizClassifiedStance | null;
  studyDesign: DeepVizStudyDesign | null;
  outcomes: string[];
  /** Topik provider — fallback baris gaps-matrix bila `outcomes` LLM kosong. */
  topics: string[];
};

export type DeepVizClaimInput = { text: string; reasoning: string; papers: number[] };
export type DeepVizOpenQuestionInput = { question: string; why: string };

export type BuildDeepVizInput = {
  /** Sub-pertanyaan run, indeks = subQuestionIndex. */
  subQuestions: string[];
  sources: DeepVizSourceInput[];
  /** Penilaian LLM: subQ berbentuk dapat dijawab ya/tidak (syarat consensus-meter). */
  subQuestionAnswerable: Array<{ subQuestionIndex: number; answerable: boolean }>;
  claims: DeepVizClaimInput[];
  openQuestions: DeepVizOpenQuestionInput[];
};

const CONSENSUS_MIN_PAPERS = 5;
const TIMELINE_MIN_POINTS = 4;
const TIMELINE_MIN_YEARS = 2;
const CONTRIBUTOR_MIN_PAPERS = 2;
const CONTRIBUTOR_TOP = 3;
const CLAIMS_MIN_VALID = 3;
const GAPS_MAX_ROWS = 5;
const GAPS_MIN_ROWS = 2;
const GAPS_MIN_PAPERS = 8;
const OPEN_QUESTIONS_MIN = 2;
const OPEN_QUESTIONS_MAX = 4;

const DESIGN_WEIGHT: Record<DeepVizStudyDesign, number> = {
  meta_analysis: 3.0,
  systematic_review: 3.0,
  rct: 2.5,
  observational: 1.5,
  review: 1.0,
  other: 1.0,
};

const STRENGTH_MULTIPLIER: Record<DeepVizEvidenceStrength, number> = {
  strong: 1.0,
  medium: 0.75,
  weak: 0.5,
};

const DESIGN_TO_BUCKET: Record<DeepVizStudyDesign, DeepVizDesignBucket> = {
  meta_analysis: "meta_sysrev",
  systematic_review: "meta_sysrev",
  rct: "rct",
  observational: "observational",
  review: "other",
  other: "other",
};

/** Profil satu paper unik `n` — hasil merge semua unit klasifikasi paper itu. */
type PaperProfile = {
  n: number;
  year: number | null;
  venue: string | null;
  citedByCount: number | null;
  authors: string[];
  evidenceStrength: DeepVizEvidenceStrength;
  studyDesign: DeepVizStudyDesign | null;
  outcomes: string[];
  topics: string[];
};

function collapseLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Dedupe unit by `n × subQuestionIndex` (kemunculan pertama menang). */
function dedupeUnits(sources: DeepVizSourceInput[]): DeepVizSourceInput[] {
  const seen = new Set<string>();
  const units: DeepVizSourceInput[] = [];
  for (const source of sources) {
    const key = `${source.n}:${source.subQuestionIndex ?? "-"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(source);
  }
  return units;
}

/** Merge unit-unit satu paper → profil per `n` (first-non-null menang; outcomes/topics di-union). */
function paperProfiles(units: DeepVizSourceInput[]): Map<number, PaperProfile> {
  const byN = new Map<number, PaperProfile>();
  for (const unit of units) {
    const existing = byN.get(unit.n);
    if (!existing) {
      byN.set(unit.n, {
        n: unit.n,
        year: unit.year,
        venue: unit.venue !== null ? collapseLabel(unit.venue) || null : null,
        citedByCount: unit.citedByCount,
        authors: unit.authors.map(collapseLabel).filter(Boolean),
        evidenceStrength: unit.evidenceStrength,
        studyDesign: unit.studyDesign,
        outcomes: unit.outcomes.map(collapseLabel).filter(Boolean),
        topics: unit.topics.map(collapseLabel).filter(Boolean),
      });
      continue;
    }
    existing.year ??= unit.year;
    existing.venue ??= unit.venue !== null ? collapseLabel(unit.venue) || null : null;
    existing.citedByCount ??= unit.citedByCount;
    if (existing.authors.length === 0) {
      existing.authors = unit.authors.map(collapseLabel).filter(Boolean);
    }
    existing.studyDesign ??= unit.studyDesign;
    for (const outcome of unit.outcomes.map(collapseLabel).filter(Boolean)) {
      if (!existing.outcomes.includes(outcome)) existing.outcomes.push(outcome);
    }
    for (const topic of unit.topics.map(collapseLabel).filter(Boolean)) {
      if (!existing.topics.includes(topic)) existing.topics.push(topic);
    }
  }
  return byN;
}

function buildConsensusMeters(
  units: DeepVizSourceInput[],
  subQuestions: string[],
  answerable: Array<{ subQuestionIndex: number; answerable: boolean }>,
): ConsensusMeterBlock[] {
  const answerableSet = new Set(
    answerable.filter((entry) => entry.answerable).map((entry) => entry.subQuestionIndex),
  );
  const blocks: ConsensusMeterBlock[] = [];
  for (let index = 0; index < subQuestions.length; index++) {
    if (!answerableSet.has(index)) continue;
    const question = collapseLabel(subQuestions[index] ?? "");
    if (!question) continue;
    const classified = units.filter(
      (unit) =>
        unit.subQuestionIndex === index &&
        unit.stance !== null &&
        unit.stance !== "not_applicable",
    );
    if (classified.length < CONSENSUS_MIN_PAPERS) continue;
    const stances = { yes: 0, possibly: 0, mixed: 0, no: 0 };
    const designByStance: ConsensusMeterBlock["designByStance"] = {
      yes: {},
      possibly: {},
      mixed: {},
      no: {},
    };
    for (const unit of classified) {
      const stance = unit.stance as DeepVizStance;
      stances[stance] += 1;
      const design = unit.studyDesign ?? "other";
      designByStance[stance][design] = (designByStance[stance][design] ?? 0) + 1;
    }
    const distinctStances = DEEP_VIZ_STANCES.filter((stance) => stances[stance] > 0).length;
    if (distinctStances < 2) continue;
    blocks.push({
      v: 1,
      type: "consensus-meter",
      id: `consensus-q${index}`,
      subQuestionIndex: index,
      question,
      n: classified.length,
      stances,
      designByStance,
    });
  }
  return blocks;
}

function buildResultsTimeline(papers: Map<number, PaperProfile>): ResultsTimelineBlock | null {
  const points = [...papers.values()]
    .filter((paper) => paper.year !== null)
    .map((paper) => ({
      n: paper.n,
      year: paper.year as number,
      citedByCount:
        paper.citedByCount !== null && paper.citedByCount >= 0 ? paper.citedByCount : null,
    }))
    .sort((a, b) => a.year - b.year || a.n - b.n);
  if (points.length < TIMELINE_MIN_POINTS) return null;
  if (new Set(points.map((point) => point.year)).size < TIMELINE_MIN_YEARS) return null;
  return { v: 1, type: "results-timeline", id: "timeline", points };
}

function topEntries(byName: Map<string, Set<number>>, papers: Map<number, PaperProfile>) {
  return [...byName.entries()]
    .filter(([, ns]) => ns.size >= CONTRIBUTOR_MIN_PAPERS)
    .map(([name, ns]) => ({
      name,
      papers: [...ns].sort((a, b) => a - b),
      totalCited: [...ns].reduce((sum, n) => sum + (papers.get(n)?.citedByCount ?? 0), 0),
    }))
    .sort(
      (a, b) =>
        b.papers.length - a.papers.length ||
        b.totalCited - a.totalCited ||
        a.name.localeCompare(b.name),
    )
    .slice(0, CONTRIBUTOR_TOP)
    .map(({ name, papers: ns }) => ({ name, papers: ns }));
}

function buildTopContributors(papers: Map<number, PaperProfile>): TopContributorsBlock | null {
  const byAuthor = new Map<string, Set<number>>();
  const byVenue = new Map<string, Set<number>>();
  for (const paper of papers.values()) {
    for (const author of paper.authors) {
      if (!byAuthor.has(author)) byAuthor.set(author, new Set());
      byAuthor.get(author)?.add(paper.n);
    }
    if (paper.venue) {
      if (!byVenue.has(paper.venue)) byVenue.set(paper.venue, new Set());
      byVenue.get(paper.venue)?.add(paper.n);
    }
  }
  const authors = topEntries(byAuthor, papers);
  const venues = topEntries(byVenue, papers);
  if (authors.length === 0 && venues.length === 0) return null;
  return { v: 1, type: "top-contributors", id: "contributors", authors, venues };
}

function claimScore(ns: number[], papers: Map<number, PaperProfile>): number {
  const raw = ns.reduce((sum, n) => {
    const paper = papers.get(n);
    if (!paper) return sum;
    const weight = DESIGN_WEIGHT[paper.studyDesign ?? "other"];
    return sum + weight * STRENGTH_MULTIPLIER[paper.evidenceStrength];
  }, 0);
  return Math.round(Math.min(10, Math.max(0, raw)) * 10) / 10;
}

function buildClaimsEvidence(
  claims: DeepVizClaimInput[],
  papers: Map<number, PaperProfile>,
): ClaimsEvidenceBlock | null {
  const sanitized: ClaimsEvidenceBlock["claims"] = [];
  for (const claim of claims) {
    const text = collapseLabel(claim.text);
    if (!text) continue;
    // `n` di luar inventaris dibuang; duplikat di-dedupe; klaim tanpa paper valid → drop.
    const ns = [...new Set(claim.papers)].filter((n) => papers.has(n)).sort((a, b) => a - b);
    if (ns.length === 0) continue;
    const score = claimScore(ns, papers);
    sanitized.push({
      text,
      reasoning: collapseLabel(claim.reasoning),
      papers: ns,
      score,
      label: score >= 6 ? "strong" : score >= 3 ? "moderate" : "limited",
    });
  }
  if (sanitized.length < CLAIMS_MIN_VALID) return null;
  return { v: 1, type: "claims-evidence", id: "claims", claims: sanitized };
}

function buildGapsMatrix(papers: Map<number, PaperProfile>): GapsMatrixBlock | null {
  // Tag per paper: outcomes LLM, fallback topics provider. Normalisasi lowercase-trim
  // untuk merge; label tampil = kemunculan pertama.
  const labelByKey = new Map<string, string>();
  const papersByKey = new Map<string, Set<number>>();
  const taggedPapers = new Set<number>();
  for (const paper of papers.values()) {
    const tags = paper.outcomes.length > 0 ? paper.outcomes : paper.topics;
    if (tags.length === 0) continue;
    taggedPapers.add(paper.n);
    for (const tag of tags) {
      const key = tag.toLowerCase();
      if (!labelByKey.has(key)) labelByKey.set(key, tag);
      if (!papersByKey.has(key)) papersByKey.set(key, new Set());
      papersByKey.get(key)?.add(paper.n);
    }
  }
  if (taggedPapers.size < GAPS_MIN_PAPERS) return null;
  const rowKeys = [...papersByKey.entries()]
    .sort(
      (a, b) =>
        b[1].size - a[1].size || (labelByKey.get(a[0]) ?? "").localeCompare(labelByKey.get(b[0]) ?? ""),
    )
    .slice(0, GAPS_MAX_ROWS)
    .map(([key]) => key);
  if (rowKeys.length < GAPS_MIN_ROWS) return null;
  const cells = rowKeys.map((key) => {
    const counts: Record<DeepVizDesignBucket, number> = {
      meta_sysrev: 0,
      rct: 0,
      observational: 0,
      other: 0,
    };
    for (const n of papersByKey.get(key) ?? []) {
      const design = papers.get(n)?.studyDesign;
      counts[design ? DESIGN_TO_BUCKET[design] : "other"] += 1;
    }
    return DEEP_VIZ_DESIGN_BUCKETS.map((bucket) => counts[bucket]);
  });
  return {
    v: 1,
    type: "gaps-matrix",
    id: "gaps",
    rows: rowKeys.map((key) => labelByKey.get(key) ?? key),
    cols: ["meta_sysrev", "rct", "observational", "other"],
    cells,
  };
}

function buildOpenQuestions(items: DeepVizOpenQuestionInput[]): OpenQuestionsBlock | null {
  const sanitized = items
    .map((item) => ({ question: collapseLabel(item.question), why: collapseLabel(item.why) }))
    .filter((item) => item.question.length > 0)
    .slice(0, OPEN_QUESTIONS_MAX);
  if (sanitized.length < OPEN_QUESTIONS_MIN) return null;
  return { v: 1, type: "open-questions", id: "open-questions", items: sanitized };
}

/**
 * Susun semua blok viz yang MEMENUHI ambang minimum data per tipe blok dari hasil
 * klasifikasi step `analyze-sources`. Deterministik penuh (tanpa Date/random). Urutan
 * output = urutan daftar id di prompt writer: consensus-q* (indeks naik), timeline,
 * contributors, claims, gaps, open-questions.
 */
export function buildDeepVizBlocks(input: BuildDeepVizInput): DeepVizBlock[] {
  const units = dedupeUnits(input.sources);
  const papers = paperProfiles(units);
  const blocks: Array<DeepVizBlock | null> = [
    ...buildConsensusMeters(units, input.subQuestions, input.subQuestionAnswerable),
    buildResultsTimeline(papers),
    buildTopContributors(papers),
    buildClaimsEvidence(input.claims, papers),
    buildGapsMatrix(papers),
    buildOpenQuestions(input.openQuestions),
  ];
  return blocks.filter((block): block is DeepVizBlock => block !== null);
}

// ---------------------------------------------------------------------------
// Injector — marker writer `{{viz:<id>}}` → fenced block JSON (post-process synthesize)
// ---------------------------------------------------------------------------

export type InjectVizResult = {
  report: string;
  /** Id blok yang ditempatkan writer via marker. */
  placedIds: string[];
  /** Id blok inti (consensus-q* dan claims) yang tak ditaruh writer → di-append di lampiran. */
  appendedIds: string[];
  /** Id blok non-inti yang tak ditaruh writer → di-drop. */
  droppedIds: string[];
  /** Jumlah fence `aqsha:viz` tulisan model yang dibuang (anti-forgery). */
  strippedFenceCount: number;
  /** Jumlah baris marker tak dikenal/duplikat yang dihapus. */
  removedMarkerCount: number;
};

/**
 * Baris marker penempatan blok. Toleran terhadap penyimpangan kecil writer dari format
 * `{{viz:<id>}}` polos: boleh berawalan bullet list dan berakhiran tanda baca ringan.
 */
const MARKER_LINE = /^\s*(?:[-*+]\s+)?\{\{viz:([a-z0-9-]+)\}\}\s*[.,;:]?\s*$/;
/** Token marker di posisi mana pun — jaring pengaman agar token mentah tak pernah bocor ke user. */
const MARKER_INLINE = /\{\{viz:[a-z0-9-]+\}\}/g;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const VIZ_APPENDIX_HEADING = "### Lampiran visual";

/** Blok yang wajib tampil walau writer tak menaruh markernya. */
function isCoreBlock(block: DeepVizBlock): boolean {
  return block.type === "consensus-meter" || block.type === "claims-evidence";
}

type FenceState = { char: string; length: number };

/**
 * Penutup fence per CommonMark: karakter sama, panjang run ≥ pembuka, tanpa info string.
 * Tanpa aturan panjang, baris ``` di dalam fence ```` akan salah dianggap penutup dan
 * isi contoh kode ikut diproses injector.
 */
function closesFence(fenceMatch: RegExpMatchArray, fence: FenceState): boolean {
  const run = fenceMatch[1] ?? "";
  return (
    run[0] === fence.char && run.length >= fence.length && (fenceMatch[2] ?? "").trim() === ""
  );
}

/** Fenced block `aqsha:viz` self-contained (JSON satu baris → aman dari fence-break). */
export function vizBlockToFence(block: DeepVizBlock): string {
  return ["```aqsha:viz", JSON.stringify(block), "```"].join("\n");
}

/**
 * Kolaps baris kosong beruntun (≥2) menjadi satu baris kosong, HANYA di luar fence —
 * isi code block tulisan writer harus lolos verbatim.
 */
function collapseBlankRuns(lines: string[]): string[] {
  const out: string[] = [];
  let fence: FenceState | null = null;
  let blankRun = 0;
  for (const line of lines) {
    const fenceMatch = line.match(FENCE_OPEN);
    if (fence) {
      out.push(line);
      if (fenceMatch && closesFence(fenceMatch, fence)) fence = null;
      continue;
    }
    if (fenceMatch) {
      const run = fenceMatch[1] ?? "```";
      fence = { char: run[0] ?? "`", length: run.length };
      blankRun = 0;
      out.push(line);
      continue;
    }
    if (line.trim() === "") {
      blankRun += 1;
      if (blankRun > 1) continue;
      out.push("");
      continue;
    }
    blankRun = 0;
    out.push(line);
  }
  return out;
}

/**
 * Post-processor laporan synthesize — pure & idempoten (retry synthesize mengulang
 * injeksi dengan hasil sama):
 * 1. STRIP semua fence `aqsha:viz` tulisan model (anti-forgery; fence tanpa penutup
 *    di-strip sampai akhir teks).
 * 2. Ganti baris marker `{{viz:<id>}}` → fenced block JSON blok ber-id sama. Marker
 *    tak dikenal → baris dihapus; duplikat → kemunculan pertama menang. Marker di dalam
 *    fence code lain TIDAK disentuh; token marker yang terselip di tengah kalimat
 *    dihapus dari teksnya (blok inti tetap muncul via lampiran).
 * 3. Blok inti (consensus-q*, claims) yang tak ditempatkan → append di bawah
 *    `### Lampiran visual`; blok lain yang tak ditempatkan → drop.
 * 4. Setiap blok yang ditulis diberi nomor `figure` berurutan sesuai posisinya di
 *    dokumen final — sumber tunggal penomoran "Gambar n" di FE.
 */
export function injectVizBlocks(report: string, blocks: DeepVizBlock[]): InjectVizResult {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const placedIds: string[] = [];
  let strippedFenceCount = 0;
  let removedMarkerCount = 0;
  let figureCount = 0;

  const stampFence = (block: DeepVizBlock): string => {
    figureCount += 1;
    return vizBlockToFence({ ...block, figure: figureCount });
  };

  const outLines: string[] = [];
  let insideFence: FenceState | null = null;
  let strippingViz: FenceState | null = null;
  for (const line of report.split("\n")) {
    const fenceMatch = line.match(FENCE_OPEN);
    if (strippingViz) {
      // Dalam fence aqsha:viz liar: buang sampai fence penutup (atau EOF).
      if (fenceMatch && closesFence(fenceMatch, strippingViz)) strippingViz = null;
      continue;
    }
    if (insideFence) {
      outLines.push(line);
      if (fenceMatch && closesFence(fenceMatch, insideFence)) insideFence = null;
      continue;
    }
    if (fenceMatch) {
      const run = fenceMatch[1] ?? "```";
      const state: FenceState = { char: run[0] ?? "`", length: run.length };
      const info = (fenceMatch[2] ?? "").trim();
      if (info.toLowerCase().startsWith("aqsha:viz")) {
        strippingViz = state;
        strippedFenceCount += 1;
        continue;
      }
      // Fence tanpa info string bisa pembuka atau penutup nyasar — perlakukan sebagai pembuka.
      insideFence = state;
      outLines.push(line);
      continue;
    }
    const markerMatch = line.match(MARKER_LINE);
    if (markerMatch) {
      const id = markerMatch[1] ?? "";
      const block = blockById.get(id);
      if (!block || placedIds.includes(id)) {
        removedMarkerCount += 1;
        continue;
      }
      placedIds.push(id);
      outLines.push("", stampFence(block), "");
      continue;
    }
    if (line.includes("{{viz:")) {
      // Token marker terselip di tengah teks (bukan baris marker valid): buang tokennya
      // saja supaya `{{viz:...}}` mentah tak pernah tampil ke user.
      const withoutMarkers = line.replace(MARKER_INLINE, "");
      if (withoutMarkers !== line) {
        removedMarkerCount += 1;
        const cleaned = withoutMarkers.replace(/[ \t]{2,}/g, " ").trimEnd();
        if (cleaned.trim() !== "") outLines.push(cleaned);
        continue;
      }
    }
    outLines.push(line);
  }

  // Blok yang tak ditempatkan writer: inti di-append, sisanya drop.
  const appendedIds: string[] = [];
  const droppedIds: string[] = [];
  const appendixFences: string[] = [];
  for (const block of blocks) {
    if (placedIds.includes(block.id)) continue;
    if (isCoreBlock(block)) {
      appendedIds.push(block.id);
      appendixFences.push(stampFence(block));
    } else {
      droppedIds.push(block.id);
    }
  }

  let resultLines = outLines;
  if (appendixFences.length > 0) {
    while (resultLines.length > 0 && resultLines[resultLines.length - 1]?.trim() === "") {
      resultLines = resultLines.slice(0, -1);
    }
    resultLines = [...resultLines, "", VIZ_APPENDIX_HEADING, "", appendixFences.join("\n\n"), ""];
  }
  const result = collapseBlankRuns(resultLines).join("\n");

  return { report: result, placedIds, appendedIds, droppedIds, strippedFenceCount, removedMarkerCount };
}

/**
 * Ringkasan analisis bukti untuk panel proses — SATU sumber wording untuk emit live di
 * workflow agent dan rekonstruksi riwayat di web, supaya baris yang sama tidak berganti
 * kalimat antara live-stream dan refresh/replay.
 */
export function formatDeepAnalyzeSummary(classifiedCount: number, blockIds: string[]): string {
  const head = `Analisis bukti: ${classifiedCount} unit sumber diklasifikasikan`;
  if (blockIds.length === 0) return `${head}; belum ada blok visual yang memenuhi ambang.`;
  return `${head}; ${blockIds.length} blok visual layak (${blockIds.join(", ")}).`;
}
