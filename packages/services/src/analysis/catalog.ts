/**
 * Katalog analisis statistik (SSOT TS) — mirror registry Python `aqsha_stats`
 * (packages/stats-py/aqsha_stats/registry.py `ANALYSIS_IDS`; dijaga sync-test
 * `test/analysis-catalog.test.ts`). Dipakai untuk: tool description `list_analyses`
 * (model tidak mengarang nama uji), validasi ringan args TS-side (validasi kolom
 * sesungguhnya di Python), timeout + kredit per analisis. TANPA zod — spec args
 * deskriptif untuk model; angka & verdict semua dihitung template Python.
 */

export const ANALYSIS_IDS = [
  "profile",
  "descriptive",
  "uji_validitas",
  "uji_reliabilitas",
  "uji_normalitas",
  "uji_multikolinearitas",
  "uji_heteroskedastisitas",
  "uji_autokorelasi",
  "uji_linearitas",
  "regresi_linear",
  "korelasi",
] as const;
export type AnalysisId = (typeof ANALYSIS_IDS)[number];

export type AnalysisArgSpec = {
  name: string;
  /** Bentuk nilai yang diharapkan (deskriptif, untuk model + validasi ringan). */
  type: "string" | "string[]" | "number" | "boolean" | "enum" | "object";
  values?: readonly string[];
  required: boolean;
  description: string;
};

export type AnalysisCatalogEntry = {
  id: AnalysisId;
  title: string;
  description: string;
  args: readonly AnalysisArgSpec[];
  /** Kredit `sandbox_compute` per run (0 = gratis, mis. profil dataset). */
  credits: number;
  /** Analisis berat (bootstrap besar) → timeout codeRun panjang. */
  heavy: boolean;
};

const dependent: AnalysisArgSpec = {
  name: "dependent",
  type: "string",
  required: true,
  description: "Nama kolom variabel terikat (Y).",
};
const independents: AnalysisArgSpec = {
  name: "independents",
  type: "string[]",
  required: true,
  description: "Nama kolom variabel bebas (X1, X2, …).",
};

export const ANALYSIS_CATALOG: readonly AnalysisCatalogEntry[] = [
  {
    id: "profile",
    title: "Profil dataset",
    description:
      "Ringkasan skema dataset: kolom, tipe, missing, deteksi skala Likert, statistik dasar, preview 5 baris. Gratis — jalankan dulu sebelum analisis lain.",
    args: [],
    credits: 0,
    heavy: false,
  },
  {
    id: "descriptive",
    title: "Statistik deskriptif",
    description:
      "Tabel Descriptive Statistics gaya SPSS (N, Min, Max, Mean, Std. Deviation) + tabel frekuensi untuk variabel kategorik/diskrit. Bisa merangkum skor total per grup item.",
    args: [
      {
        name: "variables",
        type: "string[]",
        required: false,
        description: "Kolom yang dirangkum (default: semua kolom numerik).",
      },
      {
        name: "groups",
        type: "object",
        required: false,
        description:
          'Peta variabel laten → item, mis. {"X1": ["X1.1","X1.2"]} — skor total dihitung dulu lalu dirangkum.',
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_validitas",
    title: "Uji validitas (Pearson item-total vs r tabel)",
    description:
      "Konvensi skripsi Indonesia: korelasi Pearson tiap item terhadap skor total, dibandingkan r tabel (df=n−2). Verdict Valid/Tidak Valid per item.",
    args: [
      {
        name: "items",
        type: "string[]",
        required: true,
        description: "Kolom item kuesioner satu variabel (mis. X1.1..X1.4).",
      },
      {
        name: "alpha",
        type: "number",
        required: false,
        description: "Taraf signifikansi r tabel (default 0.05, two-tailed).",
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_reliabilitas",
    title: "Uji reliabilitas (Cronbach's alpha)",
    description:
      "Reliability Statistics (alpha + N of items, CI 95%) + Item-Total Statistics (scale if item deleted). Cutoff 0,60 (catatan sekunder 0,70).",
    args: [
      {
        name: "items",
        type: "string[]",
        required: true,
        description: "Kolom item kuesioner satu variabel.",
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_normalitas",
    title: "Uji normalitas (K-S Lilliefors + Shapiro-Wilk)",
    description:
      "One-Sample Kolmogorov-Smirnov dengan koreksi Lilliefors (persis output SPSS) + Shapiro-Wilk. Mode residual (regresi Y~X) atau per-variabel. Sig > 0,05 → normal.",
    args: [
      {
        name: "mode",
        type: "enum",
        values: ["residual", "variables"],
        required: true,
        description: "residual = uji residual regresi (baku skripsi); variables = per kolom.",
      },
      { ...dependent, required: false, description: "Wajib untuk mode residual: kolom Y." },
      {
        ...independents,
        required: false,
        description: "Wajib untuk mode residual: kolom X.",
      },
      {
        name: "variables",
        type: "string[]",
        required: false,
        description: "Wajib untuk mode variables: kolom yang diuji.",
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_multikolinearitas",
    title: "Uji multikolinearitas (Tolerance/VIF)",
    description: "Tolerance > 0,10 dan VIF < 10 per variabel bebas → tidak terjadi multikolinearitas.",
    args: [dependent, independents],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_heteroskedastisitas",
    title: "Uji heteroskedastisitas (Glejser + scatterplot)",
    description:
      "Regresi |residual| terhadap variabel bebas (Glejser); Sig > 0,05 → tidak terjadi heteroskedastisitas. Plus scatterplot SRESID × ZPRED.",
    args: [dependent, independents],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_autokorelasi",
    title: "Uji autokorelasi (Durbin-Watson)",
    description:
      "Statistik DW dibandingkan tabel Savin-White (dL/dU, α=0,05): du < DW < 4−du → tidak ada autokorelasi.",
    args: [
      dependent,
      independents,
      {
        name: "alpha",
        type: "number",
        required: false,
        description: "Taraf signifikansi tabel DW (default 0.05).",
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_linearitas",
    title: "Uji linearitas (deviation from linearity)",
    description:
      "ANOVA table gaya SPSS Means → Test for Linearity. Sig. Deviation from Linearity > 0,05 → hubungan linear.",
    args: [
      dependent,
      {
        name: "independent",
        type: "string",
        required: true,
        description: "Nama kolom satu variabel bebas.",
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "regresi_linear",
    title: "Regresi linear (sederhana/berganda)",
    description:
      "Model Summary (R, R², adjusted R², SE), ANOVA (uji F simultan), Coefficients (B, Beta, uji t parsial) + persamaan regresi.",
    args: [
      dependent,
      independents,
      {
        name: "durbin_watson",
        type: "boolean",
        required: false,
        description: "Sertakan Durbin-Watson di Model Summary.",
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "korelasi",
    title: "Korelasi (Pearson/Spearman)",
    description:
      "Matriks korelasi + Sig. (2-tailed) + N, tanda signifikansi 0,05/0,01, interpretasi kekuatan hubungan.",
    args: [
      {
        name: "variables",
        type: "string[]",
        required: true,
        description: "Kolom yang dikorelasikan (≥ 2).",
      },
      {
        name: "method",
        type: "enum",
        values: ["pearson", "spearman"],
        required: false,
        description: "Default pearson.",
      },
    ],
    credits: 10,
    heavy: false,
  },
] as const;

const catalogById = new Map(ANALYSIS_CATALOG.map((entry) => [entry.id, entry]));

export function analysisCatalogEntry(id: string): AnalysisCatalogEntry | null {
  return catalogById.get(id as AnalysisId) ?? null;
}
