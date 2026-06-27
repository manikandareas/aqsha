# SEO Audit & Research — Aqsha (`apps/web`)

> Tanggal: 2026-06-27 · Scope: `apps/web` (Next.js 16.2.6, App Router) · Domain produksi: `aqshara.com`
> Status: audit selesai, implementasi belum (lihat [implementation-plan-a-b.md](./implementation-plan-a-b.md)).

## Ringkasan eksekutif

Aqsha punya **dua masalah SEO yang terpisah**:

1. **Infrastruktur SEO teknis nyaris kosong.** Tidak ada `sitemap`, `robots`, `metadataBase`, Open Graph, structured data, atau canonical. Akibatnya Google kesulitan meng-crawl, meng-index, dan menampilkan bahkan satu landing page dengan benar. Selain itu `<html lang="en">` padahal seluruh copy berbahasa Indonesia, dan root `description` masih placeholder dev.
2. **Surface konten = satu halaman.** Seluruh navigasi landing adalah anchor `#`, dan konten riset paling berharga (paper pages) terkunci di balik auth. Untuk sebuah _research product_, ini menyia-nyiakan lever pertumbuhan organik terbesar: ribuan halaman paper/topik yang seharusnya bisa di-index (programmatic SEO).

Masalah #1 diselesaikan oleh **Opsi A + B** (cheap, high ROI). Masalah #2 adalah **Opsi C** — inisiatif produk tersendiri, ROI terbesar tapi butuh keputusan expose data.

## Metodologi

- Audit kode `apps/web`: struktur `app/`, `lib/metadata.ts`, `app/layout.tsx`, `app/page.tsx`, `app/manifest.json`, `next.config.ts`, komponen `features/marketing/*`.
- Verifikasi API metadata terhadap **docs Next.js 16.2.6 terinstal** (`node_modules/next/dist/docs/01-app/.../metadata/{sitemap,robots,...}.md`) sesuai mandat CLAUDE.md.
- Cek domain produksi via `docs/architecture/phase-10-plan.md` (`aqshara.com`).

## Scorecard kondisi sekarang

| Area                               | Status         | Detail                                                                                         |
| ---------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| Metadata dasar (title/description) | 🟡 Sebagian    | `lib/metadata.ts` hanya title+description; banyak halaman tanpa metadata sendiri               |
| `metadataBase`                     | 🔴 Tidak ada   | OG/canonical URL resolve relatif/rusak; Next.js memunculkan warning                            |
| `sitemap.xml`                      | 🔴 Tidak ada   | Crawler tidak punya peta URL                                                                   |
| `robots.txt`                       | 🔴 Tidak ada   | Tidak ada arahan crawl, tidak ada pointer sitemap, route app/auth tidak di-`noindex`           |
| Open Graph / Twitter Card          | 🔴 Tidak ada   | Share ke WhatsApp/X/LinkedIn polos tanpa preview                                               |
| OG image (`opengraph-image`)       | 🔴 Tidak ada   | —                                                                                              |
| Structured data (JSON-LD)          | 🔴 Tidak ada   | Tidak ada Organization/WebSite/SoftwareApplication/FAQ → tidak ada rich result                 |
| Canonical URL                      | 🔴 Tidak ada   | —                                                                                              |
| `lang` attribute                   | 🔴 Salah       | `<html lang="en">` padahal copy 100% bahasa Indonesia                                          |
| Root `description`                 | 🔴 Placeholder | "Aqsha V2 — research workspace (foundations rail)."                                            |
| Heading hierarchy                  | 🟢 Sehat       | `m.h1` (hero) → `h2` (section) → `h3`                                                          |
| Image alt                          | 🟢 N/A         | Landing pakai SVG/CSS gradient, bukan raster                                                   |
| Manifest PWA                       | 🟡 Lemah       | `theme_color` hardcoded putih (abaikan dark mode), icon hanya `maskable` (tanpa `any`), statis |
| Indexable content surface          | 🔴 1 halaman   | Semua nav = anchor `#`; konten riset terkunci di balik auth                                    |

## Temuan detail

### P0 — Kritis (memblok crawl/index/tampilan)

1. **`metadataBase` tidak diset** (`app/layout.tsx`). Semua URL OG & canonical relatif jadi tidak resolve; Next.js log warning di build.
2. **`app/robots.ts` tidak ada.** Tidak ada arahan crawler, tidak ada pointer sitemap, dan route privat (`/app`, `/sign-in`, `/sign-up`, `/onboarding`, `/eve`) tidak di-disallow.
3. **`app/sitemap.ts` tidak ada.** Tidak ada URL discovery.
4. **Open Graph & Twitter Card tidak ada.** `createPageMetadata` (`lib/metadata.ts`) hanya menghasilkan `title` + `description`. Share link = tanpa preview.
5. **`app/opengraph-image` tidak ada.** Tidak ada gambar share.
6. **Root `description` = placeholder dev.** Ini juga fallback untuk halaman tanpa description sendiri.
7. **`lang="en"` ≠ konten Indonesia.** Mempengaruhi interpretasi & penyajian Google ke user ID, plus aksesibilitas.

### P1 — Tinggi (naikkan CTR & kualitas hasil)

8. **Tidak ada JSON-LD.** Landing punya pricing, comparison, how-it-works, audience, FAQ-able content — cocok untuk `Organization`, `WebSite`, `SoftwareApplication`, dan `FAQPage` → kandidat rich snippet & knowledge panel.
9. **Tidak ada canonical URL** (`alternates.canonical`).
10. **Manifest lemah:** `theme_color` putih hardcoded, icon hanya `purpose: "maskable"` (sebagian launcher tampil blank), statis. Bisa jadi `app/manifest.ts` dinamis.
11. **Metadata per-halaman tipis.** sign-in/sign-up/landing berbagi fallback yang sama; tidak ada OG/twitter per halaman.
12. **Tidak ada verification meta** (Google Search Console / Bing) → sitemap belum bisa disubmit & diverifikasi.

### P2 — Strategis (lever pertumbuhan terbesar)

13. **Seluruh SEO surface = 1 halaman.** Semua link nav adalah anchor in-page (`#bandingin`, `#cara-kerja`, `#fitur`, `#buat-siapa`, `#pricing`). Tidak ada blog/konten, dan route riset `/app/(product)/explore/[paperRef]` + `/explore/n/[id]` berada di balik auth. Untuk research product, **public indexable paper pages** adalah lever organik terbesar (pola Semantic Scholar / Connected Papers / ResearchRabbit).

## Tiga opsi improvement

| Opsi  | Fokus                                                                          | Impact            | Effort     | Status di plan              |
| ----- | ------------------------------------------------------------------------------ | ----------------- | ---------- | --------------------------- |
| **A** | Fondasi SEO teknis (metadataBase, robots, sitemap, OG, lang, canonical)        | Tinggi            | ~½ hari    | ✅ dirinci                  |
| **B** | Rich results + sosial (JSON-LD, FAQ, OG image dinamis, manifest, verification) | Sedang–tinggi     | ~1 hari    | ✅ dirinci                  |
| **C** | Programmatic SEO engine (public paper pages dari Postgres + sitemap DB-driven) | **Sangat tinggi** | Multi-hari | ⏸ inisiatif produk terpisah |

Detail langkah A & B: lihat [implementation-plan-a-b.md](./implementation-plan-a-b.md).
Variabel yang perlu diisi (domain, email, social, verification token): lihat `apps/web/lib/seo-config.ts`.

### Catatan Opsi C (untuk nanti)

- Bikin route **publik** `/explore/[paperRef]` (atau `/riset/...`) read-only, no-auth, render judul+abstract dari Postgres + CTA "buka di Aqsha".
- `generateMetadata` per-paper + JSON-LD `ScholarlyArticle`/`Article`.
- `app/explore/sitemap.ts` di-generate dari DB (`feed_items` sudah punya tsvector/GIN); pakai `generateSitemaps` bila >50k URL (limit Google per sitemap).
- Internal linking topik → paper terkait untuk crawl depth.
- **Prasyarat keputusan produk:** boleh expose subset data paper ke publik? + rate-limit/caching. Bukan quick win, tapi ROI organik jangka panjang jauh di atas A+B.

## Catatan domain

Landing saat ini menempel di `aqshara.com` (subdomain produk). Untuk marketing idealnya apex `aqsha.app`/`www`, tapi itu keputusan infra terpisah. Snippet memakai `NEXT_PUBLIC_SITE_URL` (lihat `seo-config.ts`) agar gampang dipindah tanpa ubah kode.
