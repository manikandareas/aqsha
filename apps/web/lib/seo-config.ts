/**
 * SEO config — single source of truth untuk semua nilai SEO/metadata.
 *
 * Cara pakai: isi nilai bertanda `TODO:` di bawah. Sisanya sudah punya default
 * yang aman. Dikonsumsi oleh metadata (lib/metadata.ts), robots.ts, sitemap.ts,
 * manifest.ts, dan JSON-LD (lihat docs/seo/implementation-plan-a-b.md).
 *
 * `siteUrl` dibaca dari env NEXT_PUBLIC_SITE_URL agar gampang dipindah domain
 * tanpa ubah kode. Tambahkan ke apps/web/.env.example & .env.local.
 */

// ── Identitas situs ────────────────────────────────────────────────────────
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://aqshara.com";

export const siteName = "Aqsha";

/** Nama legal/organisasi untuk JSON-LD Organization. */
export const orgLegalName = "Aqsha"; // TODO: ganti ke nama PT/badan hukum bila ada

/** Tagline default — fallback description untuk halaman tanpa description sendiri. */
export const defaultDescription =
  "Asisten AI untuk skripsi, tesis, dan paper. Aqsha mengecek tiap sumber ke paper aslinya — cari jurnal, menulis bareng Astra, semua di satu tempat.";

/** Locale konten. Landing 100% bahasa Indonesia. */
export const locale = "id_ID";
export const htmlLang = "id";

// ── Kontak ─────────────────────────────────────────────────────────────────
export const contactEmail = "vitoandareas15@gmail.com"; // TODO: email kontak/support resmi

// ── Social profiles (untuk Organization.sameAs & twitter:site) ─────────────
// Isi yang ada, kosongkan ("") yang belum punya — yang kosong di-skip otomatis.
export const social = {
  twitter: "", // TODO: handle X tanpa @, mis. "aqshaapp"
  instagram: "", // TODO: URL penuh, mis. "https://instagram.com/aqsha.app"
  linkedin: "", // TODO: URL penuh
  tiktok: "", // TODO: URL penuh
  youtube: "", // TODO: URL penuh
} as const;

/** sameAs[] untuk JSON-LD Organization — hanya URL non-kosong. */
export const sameAs = [
  social.twitter ? `https://x.com/${social.twitter}` : "",
  social.instagram,
  social.linkedin,
  social.tiktok,
  social.youtube,
].filter(Boolean);

// ── Verifikasi search engine ───────────────────────────────────────────────
// Token dari Google Search Console & Bing Webmaster (meta tag verification).
export const verification = {
  google: "", // TODO: token Google Search Console
  bing: "", // TODO: token Bing Webmaster (opsional)
};

// ── Branding (manifest + OG image) ─────────────────────────────────────────
export const themeColor = "#0a0a0a"; // TODO: samakan dgn warna brand (BRAND-IDENTITY.md)
export const backgroundColor = "#ffffff";

/** Teks default untuk OG image dinamis (Opsi B). */
export const ogImage = {
  title: "Asisten AI buat skripsi, tesis & paper",
  subtitle: "Sumber yang nggak ngarang.",
};
