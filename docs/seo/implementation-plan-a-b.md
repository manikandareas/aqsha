# SEO Implementation Plan — Opsi A & B

> Konteks & temuan: [audit-and-research.md](./audit-and-research.md)
> Variabel (domain, email, social, verification): `apps/web/lib/seo-config.ts` (SSOT — isi `TODO:` di sana).
> Semua path relatif ke `apps/web/`. Target: Next.js 16.2.6 App Router.

## Prinsip

- **Satu sumber kebenaran:** semua nilai dari `lib/seo-config.ts`. Tidak ada string domain/email yang di-hardcode di tempat lain.
- **Lazy:** pakai konvensi file bawaan Next (`robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, `manifest.ts`) + `ImageResponse`. **Tanpa dependency baru.**
- **Semua halaman ikut otomatis:** upgrade `createPageMetadata` sekali → setiap page yang sudah memakainya langsung dapat OG/Twitter/canonical.

---

## Opsi A — Fondasi SEO teknis (~½ hari)

### A0. Prasyarat env

- Tambah `NEXT_PUBLIC_SITE_URL=https://aqshara.com` ke `.env.example` dan `.env.local`.
- (Opsional, rekomendasi) verifikasi di build: `seo-config.ts` sudah punya default, jadi tidak wajib.

### A1. Root layout — `app/layout.tsx`

- Tambah `metadataBase: new URL(siteUrl)` ke object `metadata`.
- Ganti `description` placeholder → `defaultDescription` dari `seo-config`.
- Ganti `<html lang="en">` → `lang={htmlLang}` (`"id"`).
- (Opsional) tambah `alternates: { canonical: "/" }` default + `openGraph` default level-root.

**Acceptance:** `view-source` landing menampilkan `<html lang="id">`, `<meta name="description">` benar, dan tidak ada warning `metadataBase` saat `bun run build`.

### A2. `lib/metadata.ts` — upgrade `createPageMetadata`

Ganti implementasi agar menghasilkan OG + Twitter + canonical (lihat snippet di audit). Signature baru:

```ts
createPageMetadata({ title, description, path = "/" }): Metadata
```

- `alternates.canonical: path`
- `openGraph: { title, description, url: path, siteName, locale, type: "website" }`
- `twitter: { card: "summary_large_image", title, description }`
- Import `siteName`, `locale` dari `seo-config` (hapus duplikat `siteName` lama di `metadata.ts`).

**Migrasi pemanggil:** tambahkan `path` di tiap pemanggil yang sudah ada agar canonical benar:

- `app/page.tsx` → `path: "/"`
- `app/sign-up/[[...rest]]/page.tsx` → `path: "/sign-up"`
- `app/(product)/page.tsx` → biarkan (route privat, akan di-noindex; canonical tidak kritikal)
- `app/not-found.tsx` → boleh tanpa path.

**Acceptance:** `view-source` landing & /sign-up punya `og:title`, `og:url`, `twitter:card`, `<link rel="canonical">` yang absolut & benar.

### A3. `app/robots.ts` (baru)

```ts
import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo-config";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/sign-in", "/sign-up", "/onboarding", "/eve"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
```

**Acceptance:** `GET /robots.txt` mengembalikan disallow + baris `Sitemap:` absolut.

### A4. `app/sitemap.ts` (baru)

```ts
import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo-config";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/sign-up`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
```

**Acceptance:** `GET /sitemap.xml` valid, hanya berisi route publik (bukan `/app`).

### A5. `app/opengraph-image.tsx` (baru) + `app/twitter-image.tsx`

- Render OG image 1200×630 via `ImageResponse` (Edge), pakai `ogImage.title`/`ogImage.subtitle` + brand color dari `seo-config`. `twitter-image` boleh re-export OG yang sama.
- Alternatif paling lazy: taruh static `app/opengraph-image.png` (1200×630) dari aset brand yang sudah ada — Next otomatis wire `og:image`. Pilih ini bila tak mau render dinamis.

**Acceptance:** share URL landing di WhatsApp/X menampilkan kartu preview dengan gambar.

### A6. Verifikasi A

- `bun run build` (apps/web) bebas warning metadata.
- `bun run lint` + `bun run typecheck` hijau.
- Manual: cek `/robots.txt`, `/sitemap.xml`, `view-source` landing.

---

## Opsi B — Rich results + sosial (~1 hari)

Bergantung pada A (metadataBase + seo-config sudah ada).

### B1. JSON-LD identitas — komponen `features/marketing/components/structured-data.tsx` (baru)

Server Component yang me-render `<script type="application/ld+json">`. Tanpa library. Berisi:

- `Organization` — `name: orgLegalName`, `url: siteUrl`, `logo`, `sameAs` (dari `seo-config.sameAs`), `email: contactEmail`.
- `WebSite` — `name: siteName`, `url`, (opsional) `potentialAction` SearchAction bila nanti ada `/search`.
- `SoftwareApplication` — `name`, `applicationCategory: "EducationalApplication"`, `operatingSystem: "Web"`, `offers` (dari pricing-section; jangan duplikat angka, impor/derive bila memungkinkan).

Pasang sekali di `app/page.tsx` (landing).

**Acceptance:** [Google Rich Results Test](https://search.google.com/test/rich-results) mendeteksi Organization + SoftwareApplication tanpa error.

### B2. FAQ JSON-LD

- Ekstrak Q&A dari konten "Cara kerja" / "Bandingin" jadi array `{ q, a }` (boleh file data kecil `features/marketing/faq-data.ts`).
- Render `FAQPage` JSON-LD + (opsional) section FAQ visible di landing yang membaca array yang sama (single source).

**Acceptance:** Rich Results Test mendeteksi `FAQPage`; SERP berpotensi menampilkan accordion FAQ.

### B3. OG image dinamis (kalau A5 pakai static)

- Upgrade ke `ImageResponse` dinamis bila ingin OG berbeda per halaman (title halaman auto-render). Skip bila A5 sudah cukup.

### B4. `app/manifest.ts` dinamis (ganti `app/manifest.json`)

- Konversi `manifest.json` → `manifest.ts` yang membaca `siteName`, `themeColor`, `backgroundColor`, `defaultDescription` dari `seo-config`.
- Tambah icon `purpose: "any"` (selain `maskable`) agar tidak blank di sebagian launcher.
- Hapus `manifest.json` lama.

**Acceptance:** `GET /manifest.webmanifest` punya theme_color brand + icon `any`+`maskable`.

### B5. Verification meta

- Tambah `verification: { google: verification.google, other: { "msvalidate.01": verification.bing } }` di root `metadata` (`app/layout.tsx`), conditional bila token non-kosong.
- Setelah deploy: submit `sitemap.xml` di Google Search Console + Bing Webmaster.

**Acceptance:** meta verification muncul di `<head>` bila token diisi; sitemap tersubmit.

### B6. Verifikasi B

- Rich Results Test hijau untuk Organization, SoftwareApplication, FAQPage.
- `bun run lint` + `bun run typecheck` + `bun run build` hijau.

---

## Ringkasan file yang disentuh

| File                                                | A   | B    | Aksi                                          |
| --------------------------------------------------- | --- | ---- | --------------------------------------------- |
| `lib/seo-config.ts`                                 | ✓   | ✓    | sudah dibuat (isi `TODO:`)                    |
| `.env.example` / `.env.local`                       | ✓   |      | tambah `NEXT_PUBLIC_SITE_URL`                 |
| `app/layout.tsx`                                    | ✓   | ✓    | metadataBase, lang, description, verification |
| `lib/metadata.ts`                                   | ✓   |      | upgrade `createPageMetadata`                  |
| pemanggil `createPageMetadata`                      | ✓   |      | tambah `path`                                 |
| `app/robots.ts`                                     | ✓   |      | baru                                          |
| `app/sitemap.ts`                                    | ✓   |      | baru                                          |
| `app/opengraph-image.tsx` (+`twitter-image`)        | ✓   | (B3) | baru                                          |
| `features/marketing/components/structured-data.tsx` |     | ✓    | baru                                          |
| `features/marketing/faq-data.ts`                    |     | ✓    | baru (opsional)                               |
| `app/manifest.ts` (ganti `.json`)                   |     | ✓    | konversi                                      |

## Definition of Done

- `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` valid & benar.
- `view-source` landing: `lang="id"`, description bukan placeholder, OG+Twitter+canonical absolut.
- Rich Results Test hijau (Organization, SoftwareApplication, FAQPage).
- Share link tampil kartu dengan gambar.
- `bun run lint && bun run typecheck && bun run build` (apps/web) hijau.
- Token verification diisi di `seo-config.ts` & sitemap disubmit (langkah owner pasca-deploy).
