/**
 * Feature identity SSOT for marketing — hero collage and nav share the core
 * feature keys; `WORKFLOW_STEPS` owns the five-step landing narrative.
 * Layout-only props (tilt, collage position) stay colocated with the section
 * that owns them.
 */

export type ProductPreviewSurface =
  | "research-shelf"
  | "typst-document"
  | "references"
  | "astra-review";

export type ProductPreview = {
  surface: ProductPreviewSurface;
  title: string;
  caption: string;
};

export type FeatureKey = "projects" | "document" | "references" | "astra";

export type FeatureDefinition = {
  key: FeatureKey;
  /** DOM id / hash target without `#`, e.g. `fitur-proyek`. */
  id: string;
  preview: ProductPreview;
  /** Full editorial title (feature blocks + hero aria). */
  title: string;
  /** Short chrome label (hero window title bar). */
  label: string;
  num: string;
  body: string;
  points: readonly string[];
  navLabel: string;
  navDescription: string;
  navIcon: "sparkles" | "quote" | "pen" | "idea";
};

export const FEATURES = {
  projects: {
    key: "projects",
    id: "fitur-proyek",
    preview: {
      surface: "research-shelf",
      title: "Ruang riset",
      caption: "Daftar proyek karya tulismu",
    },
    title: "Mulai dari karya tulismu",
    label: "Ruang riset",
    num: "01",
    body: "Satu proyek jadi rumah untuk skripsi, tesis, proposal, paper, atau tulisan yang sedang kamu kerjakan.",
    points: [
      "Pilih jenis karya dan mulai dari kerangka",
      "Topik, tenggat, dan bahan pendukung tetap dekat",
    ],
    navLabel: "Proyek karya tulis",
    navDescription: "Mulai dari karya yang benar-benar ingin kamu selesaikan.",
    navIcon: "pen",
  },
  document: {
    key: "document",
    id: "fitur-dokumen",
    preview: {
      surface: "typst-document",
      title: "Dokumen .typ",
      caption: "Satu dokumen, preview langsung",
    },
    title: "Tulis dalam satu dokumen yang hidup",
    label: "Dokumen .typ",
    num: "02",
    body: "Tulis, lihat preview, dan bergerak antar-bab dalam satu dokumen Typst yang terus berkembang bersama risetmu.",
    points: [
      "Outline bab selalu dekat",
      "Preview membantu kamu melihat draf sebagai satu kesatuan",
    ],
    navLabel: "Dokumen Typst",
    navDescription: "Dokumen kontinu dengan preview dan outline proyek.",
    navIcon: "idea",
  },
  references: {
    key: "references",
    id: "fitur-referensi",
    preview: {
      surface: "references",
      title: "Referensi proyek",
      caption: "Sumber yang tertaut ke karya tulis",
    },
    title: "Jaga sumber tetap terhubung",
    label: "Referensi",
    num: "03",
    body: "Simpan sitasi di perpustakaan, tautkan ke proyek yang tepat, lalu biarkan sumber tetap dekat dengan draf yang membutuhkannya.",
    points: [
      "Library akun dan referensi proyek saling terhubung",
      "Cari literatur paper-first saat kamu butuh bahan baru",
    ],
    navLabel: "Referensi terhubung",
    navDescription: "Library sitasi yang mengikuti proyek dan drafmu.",
    navIcon: "quote",
  },
  astra: {
    key: "astra",
    id: "fitur-astra",
    preview: {
      surface: "astra-review",
      title: "Review Astra",
      caption: "Usulan edit yang menunggu keputusanmu",
    },
    title: "Astra mengusulkan, kamu yang memutuskan",
    label: "Review Astra",
    num: "04",
    body: "Astra membaca konteks proyek lalu mengusulkan perubahan yang bisa kamu tinjau sebelum menjadi bagian dari dokumen resmi.",
    points: [
      "Tandai bagian yang ingin dibantu",
      "Terima atau tolak usulan per-hunk",
    ],
    navLabel: "Astra sebagai co-writer",
    navDescription: "Bantuan scoped proyek dengan proposal yang dapat direview.",
    navIcon: "sparkles",
  },
} as const satisfies Record<FeatureKey, FeatureDefinition>;

/** Editorial order for the four-card hero collage. */
export const FEATURE_KEYS = [
  "projects",
  "document",
  "references",
  "astra",
] as const satisfies readonly FeatureKey[];

/** Mega-nav follows the project-first workflow. */
export const FEATURE_NAV_KEYS = [
  "projects",
  "document",
  "references",
  "astra",
] as const satisfies readonly FeatureKey[];

/** One user-facing action in the landing's five-step research workflow. */
export type WorkflowStep = Pick<
  FeatureDefinition,
  "id" | "preview" | "title" | "num" | "body" | "points"
>;

/**
 * Landing workflow — sells the connected journey, not a disconnected feature
 * inventory. Existing core IDs keep hero and navigation deep-links valid.
 */
export const WORKFLOW_STEPS = [
  {
    id: "fitur-proyek",
    preview: FEATURES.projects.preview,
    title: "Mulai dari karya tulismu",
    num: "01",
    body: "Buat satu proyek untuk skripsi, tesis, disertasi, paper, proposal, atau makalah yang ingin kamu selesaikan.",
    points: ["Topik, draf, dan referensi tinggal di satu rumah."],
  },
  {
    id: "fitur-literatur",
    preview: {
      surface: "references",
      title: "Cari literatur",
      caption: "322.192.000+ karya ilmiah",
    },
    title: "Temukan sumber yang tepat",
    num: "02",
    body: "Telusuri 322.192.000+ literatur ilmiah untuk menemukan bahan yang benar-benar mendukung penelitianmu.",
    points: ["Cari, simpan, dan bawa sumber yang relevan ke proyek aktif."],
  },
  {
    id: "fitur-referensi",
    preview: {
      surface: "references",
      title: "Citation Manager",
      caption: "Sitasi yang tertaut ke proyek",
    },
    title: "Kelola sitasi tanpa pindah aplikasi",
    num: "03",
    body: "Impor referensi dari Mendeley atau Zotero, lalu kelola semuanya di Citation Manager Aqsha.",
    points: ["Sitasi tetap dekat dengan draf yang membutuhkannya."],
  },
  {
    id: "fitur-dokumen",
    preview: {
      surface: "typst-document",
      title: "Anotasi draf",
      caption: "Tandai bagian yang ingin dibantu",
    },
    title: "Tandai bagian yang perlu dibantu",
    num: "04",
    body: "Sedang buntu di satu paragraf atau bab? Tandai langsung bagian draf yang ingin kamu perbaiki.",
    points: ["Beri Aqsha konteks yang tepat, bukan prompt yang harus dijelaskan dari awal."],
  },
  {
    id: "fitur-astra",
    preview: {
      surface: "astra-review",
      title: "Review Aqsha",
      caption: "Usulan edit menunggu keputusanmu",
    },
    title: "Review usulan Aqsha",
    num: "05",
    body: "Aqsha mengusulkan perubahan berdasarkan proyek, draf, dan sumbermu. Kamu meninjau setiap usulan sebelum menerapkannya.",
    points: ["Tetap karya kamu. Keputusan akhirnya tetap di tanganmu."],
  },
] as const satisfies readonly WorkflowStep[];

/** In-page hash, e.g. `#fitur-proyek`. */
export function featureHash(id: string): string {
  return `#${id}`;
}

/** Cross-page landing deep link, e.g. `/#fitur-proyek`. */
export function featurePath(id: string): string {
  return `/#${id}`;
}
