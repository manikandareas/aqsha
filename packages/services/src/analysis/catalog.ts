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
  "uji_beda_t",
  "uji_anova",
  "uji_mann_whitney",
  "uji_wilcoxon",
  "uji_kruskal_wallis",
  "uji_chi_square",
  "transformasi_msi",
  "regresi_logistik",
  "uji_moderasi",
  "uji_mediasi",
  "uji_anova_dua_arah",
  "uji_ancova",
  "uji_manova",
  "analisis_faktor",
  "cb_sem",
  "sem_pls",
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
const groupArg: AnalysisArgSpec = {
  name: "group",
  type: "string",
  required: true,
  description: "Nama kolom pengelompok (kategorik, mis. JenisKelamin).",
};
const dependentNumeric: AnalysisArgSpec = {
  name: "dependent",
  type: "string",
  required: true,
  description: "Nama kolom nilai yang dibandingkan (numerik).",
};
const preArg: AnalysisArgSpec = {
  name: "pre",
  type: "string",
  required: true,
  description: "Kolom pengukuran pertama (pre/sebelum).",
};
const postArg: AnalysisArgSpec = {
  name: "post",
  type: "string",
  required: true,
  description: "Kolom pengukuran kedua (post/sesudah).",
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
  {
    id: "uji_beda_t",
    title: "Uji beda rata-rata (t test)",
    description:
      "Independent-Samples t Test (2 grup, + Levene) atau Paired-Samples t Test (pre/post). Sig. (2-tailed) < 0,05 → ada perbedaan signifikan.",
    args: [
      {
        name: "mode",
        type: "enum",
        values: ["independent", "paired"],
        required: true,
        description: "independent = beda 2 grup; paired = beda pre-post satu grup.",
      },
      { ...dependentNumeric, required: false, description: "Wajib mode independent: kolom nilai (numerik)." },
      { ...groupArg, required: false, description: "Wajib mode independent: kolom grup (TEPAT 2 kategori)." },
      { ...preArg, required: false },
      { ...postArg, required: false },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_anova",
    title: "One-Way ANOVA (+ Levene + Tukey)",
    description:
      "Uji beda rata-rata ≥3 grup: homogenitas (Levene) + ANOVA (uji F) + post-hoc Tukey HSD bila signifikan. Sig. < 0,05 → ada perbedaan antar grup.",
    args: [dependentNumeric, groupArg],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_mann_whitney",
    title: "Uji Mann-Whitney U (non-parametrik, 2 grup)",
    description:
      "Alternatif non-parametrik t independent (data tidak normal/ordinal), TEPAT 2 grup. Asymp. Sig. < 0,05 → ada perbedaan.",
    args: [dependentNumeric, groupArg],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_wilcoxon",
    title: "Uji Wilcoxon Signed-Rank (non-parametrik, berpasangan)",
    description:
      "Alternatif non-parametrik paired t (pre/post tidak normal). Asymp. Sig. < 0,05 → ada perbedaan pre-post.",
    args: [preArg, postArg],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_kruskal_wallis",
    title: "Uji Kruskal-Wallis H (non-parametrik, ≥3 grup)",
    description:
      "Alternatif non-parametrik one-way ANOVA (data tidak normal/ordinal). Asymp. Sig. < 0,05 → ada perbedaan antar grup.",
    args: [dependentNumeric, groupArg],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_chi_square",
    title: "Uji Chi-Square (asosiasi 2 kategorik)",
    description:
      "Crosstab + Pearson Chi-Square + Cramer's V untuk hubungan dua variabel kategorik. Asymp. Sig. < 0,05 → ada asosiasi.",
    args: [
      { name: "row", type: "string", required: true, description: "Kolom kategorik baris." },
      { name: "col", type: "string", required: true, description: "Kolom kategorik kolom." },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "transformasi_msi",
    title: "Transformasi MSI (ordinal → interval)",
    description:
      "Method of Successive Interval: ubah skor Likert ordinal menjadi skala interval per item (prasyarat regresi/path atas data Likert). Menghasilkan tabel nilai transformasi.",
    args: [
      {
        name: "items",
        type: "string[]",
        required: true,
        description: "Kolom item ordinal yang ditransformasi.",
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "regresi_logistik",
    title: "Regresi logistik biner",
    description:
      "Binary Logistic: Omnibus, Model Summary (Nagelkerke R²), Variables in Equation (B, Wald, Sig., Exp(B)). Untuk variabel terikat biner (0/1).",
    args: [
      { ...dependentNumeric, description: "Kolom terikat BINER (2 nilai, mis. 0/1)." },
      independents,
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_moderasi",
    title: "Uji moderasi (MRA)",
    description:
      "Moderated Regression Analysis: Y ~ X + M + X*M (mean-centered). Sig. interaksi < 0,05 → M memoderasi pengaruh X terhadap Y.",
    args: [
      dependent,
      { name: "independent", type: "string", required: true, description: "Variabel bebas (X)." },
      { name: "moderator", type: "string", required: true, description: "Variabel moderasi (M)." },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_mediasi",
    title: "Uji mediasi (path + Sobel + bootstrap)",
    description:
      "Analisis jalur X → M → Y: efek langsung/tak langsung, uji Sobel, dan bootstrap CI 95% (5000 sampel). 0 di luar CI → M memediasi.",
    args: [
      dependent,
      { name: "independent", type: "string", required: true, description: "Variabel bebas (X)." },
      { name: "mediator", type: "string", required: true, description: "Variabel mediasi (M)." },
    ],
    credits: 20,
    heavy: true,
  },
  {
    id: "uji_anova_dua_arah",
    title: "Two-Way ANOVA (GLM Univariate)",
    description:
      "Efek utama 2 faktor + interaksi terhadap 1 variabel terikat (Type III SS, paritas SPSS GLM): Levene per sel + Tests of Between-Subjects Effects. Sig. < 0,05 → efek signifikan.",
    args: [
      dependentNumeric,
      { name: "factor1", type: "string", required: true, description: "Kolom faktor pertama (kategorik)." },
      { name: "factor2", type: "string", required: true, description: "Kolom faktor kedua (kategorik)." },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_ancova",
    title: "ANCOVA (GLM Univariate + kovariat)",
    description:
      "Pengaruh faktor terhadap variabel terikat SETELAH mengontrol kovariat (Type III SS) + Estimated Marginal Means. Sig. faktor < 0,05 → berpengaruh setelah kontrol kovariat.",
    args: [
      dependentNumeric,
      { name: "factor", type: "string", required: true, description: "Kolom faktor (kategorik)." },
      {
        name: "covariates",
        type: "string[]",
        required: true,
        description: "Kolom kovariat numerik yang dikontrol (≥ 1).",
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "uji_manova",
    title: "One-Way MANOVA (GLM Multivariate)",
    description:
      "Perbedaan simultan ≥2 variabel terikat antar grup: Pillai/Wilks/Hotelling/Roy. Sig. Wilks' Lambda < 0,05 → ada perbedaan simultan.",
    args: [
      {
        name: "dependents",
        type: "string[]",
        required: true,
        description: "Kolom variabel terikat numerik (≥ 2).",
      },
      groupArg,
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "analisis_faktor",
    title: "Analisis faktor eksploratori (EFA + KMO & Bartlett)",
    description:
      "KMO & Bartlett's Test + ekstraksi Principal Component + rotasi varimax (default SPSS): Communalities, Total Variance Explained, Rotated Component Matrix. KMO ≥ 0,50 & Sig. Bartlett < 0,05 → layak difaktorkan.",
    args: [
      {
        name: "items",
        type: "string[]",
        required: true,
        description: "Kolom item yang difaktorkan (≥ 3).",
      },
      {
        name: "n_factors",
        type: "number",
        required: false,
        description: "Jumlah faktor (default: kriteria Kaiser eigenvalue > 1).",
      },
      {
        name: "rotation",
        type: "enum",
        values: ["varimax", "none"],
        required: false,
        description: "Default varimax.",
      },
    ],
    credits: 10,
    heavy: false,
  },
  {
    id: "cb_sem",
    title: "CB-SEM (covariance-based, ala AMOS/lavaan)",
    description:
      "SEM berbasis kovarians via semopy: loadings pengukuran, jalur struktural (estimate, C.R., Sig.), dan Goodness of Fit (Chi-Square, CFI, TLI, GFI, AGFI, RMSEA). Laten 1 item diperlakukan sebagai variabel observed.",
    args: [
      {
        name: "latents",
        type: "object",
        required: true,
        description: 'Peta laten → item, mis. {"X1": ["X1.1","X1.2"], "Y": ["Y.1","Y.2"]}.',
      },
      {
        name: "paths",
        type: "string[]",
        required: true,
        description: 'Jalur struktural "Sumber -> Target", mis. ["X1 -> Y"].',
      },
    ],
    credits: 20,
    // Hessian numerik semopy tumbuh super-linear dengan jumlah parameter — model
    // skripsi realistis (5+ laten, 20+ indikator) bisa melewati timeout 120 dtk.
    heavy: true,
  },
  {
    id: "sem_pls",
    title: "SEM-PLS (ala SmartPLS)",
    description:
      "PLS-SEM (path weighting + bootstrap, seed tetap): Outer Loadings, Construct Reliability & Validity (alpha/CR/AVE), Fornell-Larcker, HTMT, R Square, Path Coefficients (T Statistics, P Values), SRMR. Untuk skripsi berbasis SmartPLS.",
    args: [
      {
        name: "latents",
        type: "object",
        required: true,
        description: 'Peta laten → indikator, mis. {"X1": ["X1.1","X1.2"], "Y": ["Y.1","Y.2"]}.',
      },
      {
        name: "paths",
        type: "string[]",
        required: true,
        description: 'Jalur struktural "Sumber -> Target", mis. ["X1 -> Y", "X2 -> Y"].',
      },
      {
        name: "bootstrap",
        type: "number",
        required: false,
        description: "Jumlah sampel bootstrap 100–2000 (default 1000; ≥ 500 untuk pelaporan).",
      },
    ],
    credits: 20,
    heavy: true,
  },
] as const;

const catalogById = new Map(ANALYSIS_CATALOG.map((entry) => [entry.id, entry]));

export function analysisCatalogEntry(id: string): AnalysisCatalogEntry | null {
  return catalogById.get(id as AnalysisId) ?? null;
}
