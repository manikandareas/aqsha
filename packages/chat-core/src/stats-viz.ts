/**
 * @aqsha/chat-core/stats-viz — kontrak + builder blok hasil analisis statistik
 * (tabel gaya output SPSS, kartu verdict rule-based, figur PNG dari sandbox Daytona).
 *
 * File entry MANDIRI ketiga chat-core (subpath `./stats-viz`, sibling `./deep-viz`) —
 * TANPA relative import supaya aman di-bundle konsumen (runtime agent Node + web).
 * Dependency tunggal `zod` (versi dipin sama dengan apps/web + apps/agent).
 *
 * Prinsip (paralel deep-viz, mekanisme BERBEDA):
 * - Angka TIDAK pernah ditulis LLM — semua tabel/verdict dihitung template Python
 *   deterministik `aqsha_stats`; `buildStatsBlocks` hanya membungkusnya jadi blok.
 * - Anti-pemalsuan lewat **join DB** (bukan strip-fence): tool `run_analysis` menyimpan
 *   blok ke `analysis_result_blocks` (keyed `runKey`), model menaruh penanda
 *   `{{stats:<runKey>}}` di narasi; FE me-resolve penanda ke blok HANYA bila `runKey`
 *   punya blok ASLI di DB thread itu (penanda tanpa blok → teks biasa). PNG chart tak
 *   pernah lewat model (hemat token) maupun teks pesan (tetap ramping) — di-fetch FE
 *   dari DB per-thread. Nomor "Tabel n"/"Gambar n" dihitung FE dari urutan blok.
 *
 * Union verdict WAJIB sinkron dengan `aqsha_stats` (`contract.py` VERDICT_*).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Kontrak — zod schema + type per blok (payload ber-`v: 1` untuk versioning)
// ---------------------------------------------------------------------------

/** Verdict rule-based — MIRROR `aqsha_stats/contract.py` (`VERDICT_LOLOS`/`_TIDAK_LOLOS`/`_PERHATIAN`). */
export const STATS_VERDICTS = ["lolos", "tidak_lolos", "perhatian"] as const;
export type StatsVerdict = (typeof STATS_VERDICTS)[number];

/** Sel tabel: angka, teks, atau kosong (null = "-" di SPSS). */
const cellSchema = z.union([z.number(), z.string(), z.null()]);

/** Satu tabel gaya output SPSS (bentuk = `aqsha_stats/contract.py` `table()`). */
export const statsTableDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(cellSchema)),
  notes: z.array(z.string()).default([]),
});
export type StatsTableData = z.infer<typeof statsTableDataSchema>;

/** Satu keputusan rule-based (bentuk = `aqsha_stats/contract.py` `decision()`). */
export const statsDecisionSchema = z.object({
  id: z.string(),
  label: z.string(),
  rule: z.string(),
  value: cellSchema,
  cutoff: cellSchema,
  verdict: z.enum(STATS_VERDICTS),
  interpretation: z.string(),
});
export type StatsDecision = z.infer<typeof statsDecisionSchema>;

/** Nomor urut "Tabel n"/"Gambar n" — di-stamp FE saat render (bukan dipersist). Optional. */
const numberSchema = z.number().int().min(1).optional();

export const statsTableBlockSchema = z.object({
  v: z.literal(1),
  type: z.literal("stats-table"),
  id: z.string(),
  tableNumber: numberSchema,
  table: statsTableDataSchema,
});

export const statsDecisionBlockSchema = z.object({
  v: z.literal(1),
  type: z.literal("stats-decision"),
  id: z.string(),
  /** Judul kartu verdict (mis. "Kesimpulan uji validitas X1"). */
  title: z.string(),
  decisions: z.array(statsDecisionSchema),
});

export const statsFigureBlockSchema = z.object({
  v: z.literal(1),
  type: z.literal("stats-figure"),
  id: z.string(),
  figureNumber: numberSchema,
  /** PNG base64 (tanpa prefix data-uri) dari `ExecutionResult.artifacts.charts` Daytona. */
  png: z.string(),
  caption: z.string().default(""),
  /** Tipe chart bawaan metadata Daytona (scatter/line/…) — informatif. */
  chartType: z.string().optional(),
});

export const statsBlockSchema = z.discriminatedUnion("type", [
  statsTableBlockSchema,
  statsDecisionBlockSchema,
  statsFigureBlockSchema,
]);

export type StatsTableBlock = z.infer<typeof statsTableBlockSchema>;
export type StatsDecisionBlock = z.infer<typeof statsDecisionBlockSchema>;
export type StatsFigureBlock = z.infer<typeof statsFigureBlockSchema>;
export type StatsBlock = z.infer<typeof statsBlockSchema>;

/**
 * Grup blok satu pemanggilan `run_analysis` (satu uji) — unit yang dipersist di
 * `analysis_result_blocks` dan yang di-resolve FE dari penanda `{{stats:<runKey>}}`.
 */
export const statsGroupSchema = z.object({
  v: z.literal(1),
  /** Kunci penanda — unik per run dalam thread (disanitasi dari toolCallId). */
  runKey: z.string(),
  /** Id analisis katalog (mis. `uji_validitas`), atau `custom` untuk codegen fallback. */
  analysis: z.string(),
  /** Judul manusiawi grup (mis. "Uji validitas X1"). */
  title: z.string(),
  blocks: z.array(statsBlockSchema),
  /** True bila hasil codegen fallback (`run_python_analysis`) — di luar katalog terverifikasi. */
  custom: z.boolean().optional(),
  /** Kode Python yang dieksekusi (fase 4, auditability "Lihat kode") — hanya untuk custom. */
  code: z.string().optional(),
});
export type StatsGroup = z.infer<typeof statsGroupSchema>;

/** Parse payload JSON satu blok → tervalidasi, atau `null` (JSON korup / tipe tak dikenal). */
export function parseStatsBlock(payload: string): StatsBlock | null {
  try {
    const parsed = statsBlockSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Parse satu grup blok (dari kolom `analysis_result_blocks.blocks` — sudah objek atau string). */
export function parseStatsGroup(payload: unknown): StatsGroup | null {
  try {
    const value = typeof payload === "string" ? JSON.parse(payload) : payload;
    const parsed = statsGroupSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Display-meta katalog — label + kredit per analysis id untuk FE (kartu run,
// panel Statistik). apps/web DILARANG import @aqsha/services → const ini jadi
// mirror-nya di chat-core; drift dijaga sync-test services
// (test/stats-analysis-meta.test.ts, pola vocab stance research-meta.test.ts).
// ---------------------------------------------------------------------------

export type StatsAnalysisMeta = {
  /** Label pendek manusiawi = judul katalog TANPA anotasi kurung (mirror `shortTitle` tool
   *  `run_analysis`, transform `title.replace(/\s*\(.*\)\s*$/, "")`) — sama dengan judul grup DB. */
  label: string;
  /** Kredit `sandbox_compute` per run (0 = gratis). */
  credits: number;
  /** Analisis berat (bootstrap/estimasi lama) → copy running bertahap di kartu. */
  heavy?: boolean;
};

/**
 * 27 entri katalog `aqsha_stats` + entri sintetis `custom` (`run_python_analysis`,
 * kredit flat 10 — mirror `PYTHON_ANALYSIS_CREDITS` di tool agent).
 */
export const STATS_ANALYSIS_META: Record<string, StatsAnalysisMeta> = {
  profile: { label: "Profil dataset", credits: 0 },
  descriptive: { label: "Statistik deskriptif", credits: 10 },
  uji_validitas: { label: "Uji validitas", credits: 10 },
  uji_reliabilitas: { label: "Uji reliabilitas", credits: 10 },
  uji_normalitas: { label: "Uji normalitas", credits: 10 },
  uji_multikolinearitas: { label: "Uji multikolinearitas", credits: 10 },
  uji_heteroskedastisitas: { label: "Uji heteroskedastisitas", credits: 10 },
  uji_autokorelasi: { label: "Uji autokorelasi", credits: 10 },
  uji_linearitas: { label: "Uji linearitas", credits: 10 },
  regresi_linear: { label: "Regresi linear", credits: 10 },
  korelasi: { label: "Korelasi", credits: 10 },
  uji_beda_t: { label: "Uji beda rata-rata", credits: 10 },
  uji_anova: { label: "One-Way ANOVA", credits: 10 },
  uji_mann_whitney: { label: "Uji Mann-Whitney U", credits: 10 },
  uji_wilcoxon: { label: "Uji Wilcoxon Signed-Rank", credits: 10 },
  uji_kruskal_wallis: { label: "Uji Kruskal-Wallis H", credits: 10 },
  uji_chi_square: { label: "Uji Chi-Square", credits: 10 },
  transformasi_msi: { label: "Transformasi MSI", credits: 10 },
  regresi_logistik: { label: "Regresi logistik biner", credits: 10 },
  uji_moderasi: { label: "Uji moderasi", credits: 10 },
  uji_mediasi: { label: "Uji mediasi", credits: 20, heavy: true },
  uji_anova_dua_arah: { label: "Two-Way ANOVA", credits: 10 },
  uji_ancova: { label: "ANCOVA", credits: 10 },
  uji_manova: { label: "One-Way MANOVA", credits: 10 },
  analisis_faktor: { label: "Analisis faktor eksploratori", credits: 10 },
  cb_sem: { label: "CB-SEM", credits: 20, heavy: true },
  sem_pls: { label: "SEM-PLS", credits: 20, heavy: true },
  custom: { label: "Analisis kustom", credits: 10 },
};

/** Lookup display-meta by analysis id — `undefined` untuk id di luar katalog (jangan mengarang). */
export function statsAnalysisMeta(analysis: string): StatsAnalysisMeta | undefined {
  return Object.hasOwn(STATS_ANALYSIS_META, analysis) ? STATS_ANALYSIS_META[analysis] : undefined;
}

/** Rekap satu grup untuk chip agregat (struk chat + list panel Statistik — SATU logika). */
export type StatsGroupSummary = {
  /** Jumlah decision per verdict (agregat semua blok `stats-decision` grup). */
  verdicts: Record<StatsVerdict, number>;
  tables: number;
  figures: number;
};

/** Hitung rekap verdict + jumlah tabel/gambar satu grup (deterministik, tanpa parsing teks). */
export function summarizeStatsGroup(group: StatsGroup): StatsGroupSummary {
  const verdicts: Record<StatsVerdict, number> = { lolos: 0, tidak_lolos: 0, perhatian: 0 };
  let tables = 0;
  let figures = 0;
  for (const block of group.blocks) {
    if (block.type === "stats-table") tables += 1;
    else if (block.type === "stats-figure") figures += 1;
    else if (block.type === "stats-decision") {
      for (const d of block.decisions) verdicts[d.verdict] += 1;
    }
  }
  return { verdicts, tables, figures };
}

// ---------------------------------------------------------------------------
// Penanda `{{stats:<runKey>}}` — model menaruh posisi grup; FE me-resolve dari DB
// ---------------------------------------------------------------------------

/** runKey valid: huruf kecil/angka/dash, ≤64 char (disanitasi dari toolCallId di tool). */
const RUN_KEY_RE = /^[a-z0-9-]{1,64}$/;

/** Sanitasi toolCallId → runKey aman-penanda (lowercase, non-alnum → `-`, cap 64). */
export function toRunKey(toolCallId: string): string {
  const cleaned = toolCallId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || "run";
}

export function isValidRunKey(runKey: string): boolean {
  return RUN_KEY_RE.test(runKey);
}

/** Penanda yang WAJIB ditulis model persis (satu per baris) untuk menempatkan grup hasil. */
export function statsMarker(runKey: string): string {
  return `{{stats:${runKey}}}`;
}

/** Token penanda di posisi mana pun — dipakai FE (rehype) untuk memecah text node. */
export const STATS_MARKER_RE = /\{\{stats:([a-z0-9-]{1,64})\}\}/g;

/**
 * Buang token penanda `{{stats:<runKey>}}` dari teks yang TIDAK dilewatkan renderer stats
 * (mis. teks antara/proses yang dirender polos) supaya token mentah tak pernah bocor ke user.
 * Grup tetap tampil via lampiran (`StatsAppendix`) karena teks jawaban final tak merujuknya.
 */
export function stripStatsMarkers(text: string): string {
  if (!text.includes("{{stats:")) return text;
  // Reuse the shared marker pattern (String.replace with a /g regex resets lastIndex, so
  // sharing it with referencedRunKeys' exec loop is safe).
  return text.replace(STATS_MARKER_RE, "").replace(/[ \t]{2,}/g, " ").trimEnd();
}

/**
 * runKey berurutan-kemunculan yang DIRUJUK penanda di teks (dedup, urutan pertama menang).
 * Dipakai FE untuk menghitung grup yang TAK ditempatkan model (di-append sebagai lampiran).
 */
export function referencedRunKeys(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  STATS_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null = STATS_MARKER_RE.exec(text);
  while (match !== null) {
    const runKey = match[1] ?? "";
    if (runKey && !seen.has(runKey)) {
      seen.add(runKey);
      out.push(runKey);
    }
    match = STATS_MARKER_RE.exec(text);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Builder — hasil `aqsha_stats` (tabel + decisions + charts) → grup blok
// ---------------------------------------------------------------------------

/** Bentuk mentah hasil `run_analysis` (JSON `build_result` Python) yang dipakai builder. */
export type StatsRunResult = {
  analysis?: unknown;
  tables?: Array<{
    id?: unknown;
    title?: unknown;
    columns?: unknown;
    rows?: unknown;
    notes?: unknown;
  }>;
  decisions?: Array<{
    id?: unknown;
    label?: unknown;
    rule?: unknown;
    value?: unknown;
    cutoff?: unknown;
    verdict?: unknown;
    interpretation?: unknown;
  }>;
};

/** Chart Daytona (PNG base64 + metadata) yang di-capture dari `plt.show()`. */
export type StatsChart = { png: string; title?: string; type?: string };

function cell(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

function tableData(raw: NonNullable<StatsRunResult["tables"]>[number], fallbackId: string): StatsTableData {
  return {
    id: typeof raw.id === "string" ? raw.id : fallbackId,
    title: typeof raw.title === "string" ? raw.title : "Tabel",
    columns: Array.isArray(raw.columns) ? raw.columns.map((c) => String(c)) : [],
    rows: Array.isArray(raw.rows)
      ? raw.rows.map((row) => (Array.isArray(row) ? row.map(cell) : []))
      : [],
    notes: Array.isArray(raw.notes) ? raw.notes.map((n) => String(n)) : [],
  };
}

function decisionData(
  raw: NonNullable<StatsRunResult["decisions"]>[number],
  fallbackId: string,
): StatsDecision {
  const verdict = STATS_VERDICTS.includes(raw.verdict as StatsVerdict)
    ? (raw.verdict as StatsVerdict)
    : "perhatian";
  return {
    id: typeof raw.id === "string" ? raw.id : fallbackId,
    label: typeof raw.label === "string" ? raw.label : "",
    rule: typeof raw.rule === "string" ? raw.rule : "",
    value: cell(raw.value),
    cutoff: cell(raw.cutoff),
    verdict,
    interpretation: typeof raw.interpretation === "string" ? raw.interpretation : "",
  };
}

/**
 * Bangun grup blok deterministik dari hasil `run_analysis` + charts. Urutan blok =
 * urutan pembacaan output SPSS: SEMUA tabel → satu kartu verdict (gabung decisions) →
 * figur (per chart). Grup tanpa isi apa pun (tak ada tabel/decision/chart) → `null`.
 */
export function buildStatsGroup(input: {
  runKey: string;
  analysis: string;
  title: string;
  result: StatsRunResult;
  charts: StatsChart[];
  /** Codegen fallback → tandai grup "analisis kustom" + simpan kode (auditability). */
  custom?: boolean;
  code?: string;
}): StatsGroup | null {
  const blocks: StatsBlock[] = [];

  const tables = Array.isArray(input.result.tables) ? input.result.tables : [];
  tables.forEach((raw, i) => {
    const data = tableData(raw, `${input.runKey}-t${i}`);
    blocks.push({ v: 1, type: "stats-table", id: `${input.runKey}-t${i}`, table: data });
  });

  const decisionsRaw = Array.isArray(input.result.decisions) ? input.result.decisions : [];
  const decisions = decisionsRaw.map((raw, i) => decisionData(raw, `${input.runKey}-d${i}`));
  if (decisions.length > 0) {
    blocks.push({
      v: 1,
      type: "stats-decision",
      id: `${input.runKey}-d`,
      title: `Kesimpulan ${input.title}`,
      decisions,
    });
  }

  input.charts.forEach((chart, i) => {
    if (!chart.png) return;
    blocks.push({
      v: 1,
      type: "stats-figure",
      id: `${input.runKey}-f${i}`,
      png: chart.png,
      caption: chart.title ?? "",
      ...(chart.type ? { chartType: chart.type } : {}),
    });
  });

  if (blocks.length === 0) return null;
  return {
    v: 1,
    runKey: input.runKey,
    analysis: input.analysis,
    title: input.title,
    blocks,
    ...(input.custom ? { custom: true } : {}),
    ...(input.code ? { code: input.code } : {}),
  };
}
