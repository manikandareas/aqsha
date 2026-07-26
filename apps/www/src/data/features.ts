/**
 * Feature identity SSOT for marketing — hero collage, feature blocks, and nav
 * share keys / ids / preview metadata / titles from here. Layout-only props
 * (tilt, collage position) stay colocated with the section that owns them.
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

/** Editorial order on the landing. Must stay even length for the 2-col steps grid. */
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

/** In-page hash, e.g. `#fitur-proyek`. */
export function featureHash(id: string): string {
  return `#${id}`;
}

/** Cross-page landing deep link, e.g. `/#fitur-proyek`. */
export function featurePath(id: string): string {
  return `/#${id}`;
}

/**
 * Partner cell in the 2-column steps grid (0↔1, 2↔3).
 * Assumes `FEATURE_KEYS` is even and laid out as row pairs.
 */
export function featurePartnerIndex(index: number): number {
  return index % 2 === 0 ? index + 1 : index - 1;
}
