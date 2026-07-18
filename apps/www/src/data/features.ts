/**
 * Feature identity SSOT for marketing — hero collage, feature blocks, and nav
 * share keys / hrefs / images / titles from here. Layout-only props (tilt,
 * collage position) stay colocated with the section that owns them.
 */

export type FeatureKey = "workspace" | "astra" | "citations" | "provenance";

export type FeatureDefinition = {
  key: FeatureKey;
  /** Anchor id target, e.g. `#fitur-workspace`. */
  href: string;
  image: string;
  /** Full editorial title (feature blocks + hero aria). */
  title: string;
  /** Short chrome label (hero window title bar). */
  label: string;
  num: string;
  phase: string;
  body: string;
  points: readonly string[];
  alt: string;
  navLabel: string;
  navDescription: string;
  navIcon: "sparkles" | "shield-check" | "quote" | "pen";
};

export const FEATURES = {
  workspace: {
    key: "workspace",
    href: "#fitur-workspace",
    image: "/landing/frame-workspace.webp",
    title: "Semua sumber di satu tempat",
    label: "Workspace",
    num: "01",
    phase: "Pas mulai",
    body: "Cari referensi dan simpan semuanya di satu workspace — nggak ada lagi 30 tab kebuka dan bingung mana yang penting.",
    points: ["Cari jurnal dari workspace", "PDF, DOI, dan catatan jadi satu"],
    alt: "Workspace riset Aqsha dengan sumber, PDF, dan catatan terkumpul",
    navLabel: "Workspace penulisan",
    navDescription: "Nulis dan kelola karya tulis di satu tempat.",
    navIcon: "pen",
  },
  astra: {
    key: "astra",
    href: "#fitur-astra",
    image: "/landing/frame-astra.webp",
    title: "Nulis bareng Astra",
    label: "Nulis bareng Astra",
    num: "02",
    phase: "Pas nyusun & nulis",
    body: "Astra bantu nyari dan nyusun bahan dari jurnal. Kamu yang ngarahin dan mikir, dia yang bantu beresin — bukan ngerjain semuanya.",
    points: ["Arah riset tetap di tanganmu", "Tiap poin nunjuk sumbernya"],
    alt: "Menulis draf riset bersama asisten Astra",
    navLabel: "Astra AI",
    navDescription: "Chat riset + deep research yang nunjukin prosesnya.",
    navIcon: "sparkles",
  },
  citations: {
    key: "citations",
    href: "#fitur-citations",
    image: "/landing/frame-citations.webp",
    title: "Tiap sumber dicek ke aslinya",
    label: "Cek sitasi",
    num: "03",
    phase: "Sebelum submit",
    body: "Sebelum dikirim, Aqsha mastiin tiap kutipan beneran ada di sumbernya — dicocokin ke isi paper aslinya, bukan cuma judulnya.",
    points: ["Yang aman ditandai", "Yang meragukan diflag biar kamu cek dulu"],
    alt: "Pengecekan kutipan ke paper asli sebelum submit",
    navLabel: "Manajer sitasi",
    navDescription: "Sitasi rapi otomatis, sinkron Mendeley & Zotero.",
    navIcon: "quote",
  },
  provenance: {
    key: "provenance",
    href: "#fitur-provenance",
    image: "/landing/frame-provenance.webp",
    title: "Jejak prosesmu tersimpan",
    label: "Jejak proses",
    num: "04",
    phase: "Kalau ditanya",
    body: "Setiap langkah nulismu direkam. Kalau tulisan jujurmu salah dicap buatan AI, kamu punya bukti prosesnya.",
    points: ["Kapan nulis, kapan pakai AI, kapan sitasi", "Bukti proses, bukan cuma hasil akhir"],
    alt: "Jejak proses penulisan yang terekam per langkah",
    navLabel: "Verifikasi sumber",
    navDescription: "Tiap klaim dicek balik ke paper aslinya.",
    navIcon: "shield-check",
  },
} as const satisfies Record<FeatureKey, FeatureDefinition>;

/** Editorial order on the landing (workspace → provenance). */
export const FEATURE_KEYS = [
  "workspace",
  "astra",
  "citations",
  "provenance",
] as const satisfies readonly FeatureKey[];

/** Mega-nav order: Astra first, then provenance/citations/workspace. */
export const FEATURE_NAV_KEYS = [
  "astra",
  "provenance",
  "citations",
  "workspace",
] as const satisfies readonly FeatureKey[];
