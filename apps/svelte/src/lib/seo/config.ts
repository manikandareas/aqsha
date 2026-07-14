/**
 * SEO config — single source of truth untuk semua nilai SEO/metadata.
 * Port 1:1 dari `apps/web/lib/seo-config.ts`. `siteUrl` dibaca dari `PUBLIC_SITE_URL`
 * (`$env/dynamic/public` via `publicEnv`, §3.7) agar domain dipindah tanpa ubah kode.
 * Client-safe (tanpa zod/services) — dipakai metadata, robots, sitemap, manifest, JSON-LD.
 */
import { publicEnv } from '$lib/env/public';

// ── Identitas situs ────────────────────────────────────────────────────────
export const siteUrl = publicEnv.PUBLIC_SITE_URL.replace(/\/$/, '');

export const siteName = 'Aqsha';

/** Nama legal/organisasi untuk JSON-LD Organization. */
export const orgLegalName = 'Aqsha';

/** Tagline default — fallback description untuk halaman tanpa description sendiri. */
export const defaultDescription =
	'Asisten AI untuk skripsi, tesis, dan paper. Aqsha mengecek tiap sumber ke paper aslinya — cari jurnal, menulis bareng Astra, semua di satu tempat.';

/** Locale konten. Landing 100% bahasa Indonesia. */
export const locale = 'id_ID';
export const htmlLang = 'id';

// ── Kontak ─────────────────────────────────────────────────────────────────
export const contactEmail = 'vitoandareas15@gmail.com';

// ── Social profiles (untuk Organization.sameAs & twitter:site) ─────────────
export const social = {
	twitter: '',
	instagram: '',
	linkedin: '',
	tiktok: '',
	youtube: ''
} as const;

/** sameAs[] untuk JSON-LD Organization — hanya URL non-kosong. */
export const sameAs = [
	social.twitter ? `https://x.com/${social.twitter}` : '',
	social.instagram,
	social.linkedin,
	social.tiktok,
	social.youtube
].filter(Boolean);

// ── Verifikasi search engine ───────────────────────────────────────────────
export const verification = {
	google: '',
	bing: ''
};

// ── Branding (manifest + OG image) ─────────────────────────────────────────
export const themeColor = '#0a0a0a';
export const backgroundColor = '#ffffff';

/** Teks default untuk OG image. */
export const ogImage = {
	title: 'Asisten AI buat skripsi, tesis & paper',
	subtitle: 'Sumber yang nggak ngarang.'
};

/** Alt untuk OG/Twitter image (padanan `alt` export web opengraph-image.tsx). */
export const ogImageAlt = `${siteName} — ${ogImage.title}`;

/** Path OG/Twitter card image (static, 1200×630). Dipakai og:image + twitter:image. */
export const ogImagePath = '/og.png';

/**
 * Gate index mesin telusur (§10 Phase 4 preview-noindex → cutover). `true` HANYA saat
 * `PUBLIC_SEO_ALLOW_INDEXING === 'true'` (di-set owner saat flip domain, Phase 12); selain itu
 * preview di-noindex (robots.txt disallow-all + `<meta name="robots" content="noindex">`).
 */
export const seoAllowIndexing = publicEnv.PUBLIC_SEO_ALLOW_INDEXING === 'true';
