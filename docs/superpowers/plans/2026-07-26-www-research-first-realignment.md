# Aqsha www Research-first Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyelaraskan seluruh `apps/www` dengan Aqsha research-first, mengaktifkan waitlist, dan menyediakan placeholder preview produk yang dapat diganti screenshot/demo Svelte kelak.

**Architecture:** Pertahankan Astro page graph, token, responsive composition, frame chrome, motion, dan primitive yang ada. Ganti data fitur sebagai source of truth, render placeholder di frame lama alih-alih media produk lama, lalu realign semua copy/CTA/SEO/editorial terhadap loop proyek → sumber → Typst → proposal Astra → review. Waitlist memakai kembali form API yang sudah ada sebelum commit penonaktifan CTA.

**Tech Stack:** Bun 1.3.10, Astro 5, React 19 islands, TypeScript, Tailwind v4, Motion, Astro Content Collections, `bun:test`.

## Global Constraints

- Gunakan Bun `1.3.10`; jangan gunakan npm, pnpm, atau yarn.
- Jangan menambah dependency baru atau mengubah `apps/www` agar bergantung pada package `@aqsha/*` lain.
- Copy publik memakai Bahasa Indonesia, sentence case, dan tone calm/clear/playful.
- Jangan membuat klaim fear-driven, jaminan ketepatan sitasi, anti-AI-detection, testimonial, jumlah pengguna, atau social proof yang tidak dapat diverifikasi.
- Jangan menyebut generic workspace/global chat sebagai pusat produk; gunakan istilah proyek, dokumen Typst, referensi, literatur, draf, dan review proposal Astra.
- Semua CTA akuisisi menuju `WAITLIST_PATH` (`/waitlist`); waitlist harus benar-benar dapat disubmit, bukan hanya dapat dikunjungi.
- Placeholder hanya memberi label surface produk; jangan membuat screenshot palsu atau data produk fiktif. Screenshot/demo dari `apps/svelte` akan dipasang belakangan dengan rasio/chrome yang sama.
- Jangan mengubah harga atau entitlement catalog. UI mengganti label “Workspace” menjadi “Proyek”, tetapi `workspaceLimit` dan `features` pada snapshot plan tetap identik dengan `packages/services/src/plan.ts` agar `check:plans` tetap lulus.
- Hapus legacy media yang tidak lagi dipakai, tetapi pertahankan `apps/www/public/landing/me.jpeg` untuk foto pembuat.
- Semua test baru memakai `bun:test` karena `apps/www` belum memakai DOM renderer atau test runner tambahan.

---

## File Structure

| File | Peran setelah perubahan |
| --- | --- |
| `apps/www/src/lib/marketing/cta.ts` | Source of truth tujuan CTA akuisisi (`WAITLIST_PATH`). |
| `apps/www/src/components/waitlist/waitlist-form.tsx` | Form waitlist aktif dengan submit API, honeypot, state submit/sukses/error. |
| `apps/www/src/data/features.ts` | Katalog empat capability research-first dan metadata placeholder untuk hero/nav/feature grid. |
| `apps/www/src/components/marketing/product-preview-placeholder.tsx` | Leaf visual netral pengganti screenshot produk lama. |
| `apps/www/src/components/marketing/feature-frame.tsx` | Frame animatif yang merender placeholder, bukan `<img>` legacy. |
| `apps/www/src/components/marketing/landing-hero-section.tsx` | Hero project-first serta collage placeholder. |
| `apps/www/src/components/marketing/feature-blocks-section.tsx` | Feature workflow empat tahap memakai data/placeholder baru. |
| `apps/www/src/data/compare-rows.ts` | Data perbandingan workflow netral, tanpa kompetitor bernama. |
| `apps/www/src/components/marketing/why-aqsha-section.tsx` | Renderer perbandingan “alur terpencar” vs “di Aqsha”. |
| `apps/www/src/components/marketing/audience-marquee-section.tsx` | Marker audience statis, pengganti social-proof kampus. |
| `apps/www/src/components/marketing/{marketing-chrome,mobile-nav-tree,pricing-section,faq-section,bottom-cta-section}.tsx` | CTA aktif dan copy/istilah research-first. |
| `apps/www/src/components/marketing/{founder-story-section,landing-footer.astro,hero-doodles.tsx}` | Cerita produk, footer, dan aksen visual yang bebas klaim/konten lama. |
| `apps/www/src/pages/index.astro` | Susunan landing tanpa testimonial/social proof lama. |
| `apps/www/src/{lib/marketing/nav.ts,components/marketing/faq-data.ts,lib/seo-config.ts,components/marketing/structured-data.tsx}` | Navigasi, FAQ, dan metadata research-first. |
| `apps/www/src/pages/{waitlist.astro,waitlist/verify.astro,blog/index.astro,changelog/index.astro}` | Copy route publik yang konsisten. |
| `apps/www/src/components/{blog/blog-list.tsx,changelog/changelog-list.tsx}` | Deskripsi blog baru dan changelog empty state dengan CTA. |
| `apps/www/src/content/blog/*.mdx` | Tiga artikel evergreen research-first baru. |
| `apps/www/src/content/changelog/` | Kosong sampai ada rilis publik yang nyata. |
| `apps/www/src/components/marketing/{university-marquee-section.tsx,testimonial-section.tsx}` | Dihapus; bergantung pada social proof/persona tidak terverifikasi. |
| `apps/www/src/lib/marketing/social-proof.ts` | Dihapus bersama university marquee. |
| `apps/www/public/landing/{frame-*.webp,hero-loop.mp4,hero-loop.webm,hero-poster.webp,workspace-view.webp}` | Dihapus sebagai media produk legacy yang tidak lagi dirender. |

## Task 1: Aktifkan kembali form waitlist yang benar-benar submit

**Files:**
- Create: `apps/www/src/components/waitlist/waitlist-form.test.ts`
- Modify: `apps/www/src/components/waitlist/waitlist-form.tsx`
- Reuse unchanged: `apps/www/src/lib/waitlist-api.ts`

**Interfaces:**
- Consumes: `submitWaitlist(input: WaitlistInput): Promise<void>` dan `WaitlistApiError` dari `@/lib/waitlist-api`.
- Produces: `WaitlistForm`, yang mengirim `{ email, companyOrUniversity, website }`, menampilkan state submit/sukses/error, dan hanya menonaktifkan input selama request berjalan.

- [ ] **Step 1: Tulis test gagal untuk form waitlist aktif**

```ts
/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const source = await Bun.file(
  new URL("./waitlist-form.tsx", import.meta.url),
).text();

test("submits a live waitlist form and preserves its accessible states", () => {
  expect(source).toContain(
    'import { submitWaitlist, type WaitlistApiError } from "@/lib/waitlist-api";',
  );
  expect(source).toContain(
    "await submitWaitlist({ email, companyOrUniversity, website });",
  );
  expect(source).toContain('disabled={state === "submitting"}');
  expect(source).toContain('role="alert"');
  expect(source).toContain("Cek email kamu untuk mengonfirmasi pendaftaran.");
  expect(source).not.toMatch(/onSubmit=\{\(event\) => event\.preventDefault\(\)\}/);
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `bun test apps/www/src/components/waitlist/waitlist-form.test.ts`  
Expected: FAIL karena form saat ini tidak mengimpor `submitWaitlist` dan selalu `preventDefault()`.

- [ ] **Step 3: Pulihkan implementasi form aktif yang sudah pernah ada sebelum CTA dinonaktifkan**

Gunakan versi persis sebelum commit penonaktifan, yang sudah memiliki honeypot, API error state, loading state, `aria-invalid`, dan success state:

```bash
git show 0b1d989c^:apps/www/src/components/waitlist/waitlist-form.tsx \
  > apps/www/src/components/waitlist/waitlist-form.tsx
```

Pastikan implementasi hasil restore memiliki detail berikut:

```tsx
const [state, setState] = useState<FormState>("idle");
const [error, setError] = useState<WaitlistApiError | null>(null);

async function onSubmit(event: { preventDefault(): void }) {
  event.preventDefault();
  if (state === "submitting") return;
  setState("submitting");
  setError(null);

  try {
    await submitWaitlist({ email, companyOrUniversity, website });
    setState("submitted");
  } catch (err) {
    const apiError = err as WaitlistApiError;
    setError({
      message: apiError?.message ?? "Permintaan belum berhasil. Coba lagi.",
      code: apiError?.code,
      field: apiError?.field,
    });
    setState("error");
  }
}
```

Input email, organisasi opsional, dan submit harus memakai `disabled={state === "submitting"}`. Honeypot `website` tetap diberi `tabIndex={-1}`, `autoComplete="off"`, dan berada di container yang tersembunyi secara visual.

- [ ] **Step 4: Jalankan test untuk memastikan lolos**

Run: `bun test apps/www/src/components/waitlist/waitlist-form.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit task**

```bash
git add apps/www/src/components/waitlist/waitlist-form.tsx \
  apps/www/src/components/waitlist/waitlist-form.test.ts
git commit -m "fix(www): reactivate waitlist form"
```

## Task 2: Satukan dan aktifkan semua CTA waitlist

**Files:**
- Create: `apps/www/src/lib/marketing/cta.ts`
- Create: `apps/www/src/lib/marketing/cta.test.ts`
- Modify: `apps/www/src/components/marketing/marketing-chrome.tsx`
- Modify: `apps/www/src/components/marketing/mobile-nav-tree.tsx`
- Modify: `apps/www/src/components/marketing/landing-hero-section.tsx`
- Modify: `apps/www/src/components/marketing/feature-blocks-section.tsx`
- Modify: `apps/www/src/components/marketing/bottom-cta-section.tsx`
- Modify: `apps/www/src/components/marketing/faq-section.tsx`
- Modify: `apps/www/src/components/marketing/pricing-section.tsx`
- Modify: `apps/www/src/components/marketing/landing-footer.astro`

**Interfaces:**
- Produces: `export const WAITLIST_PATH = "/waitlist"`.
- Consumes: setiap CTA marketing mengimpor `WAITLIST_PATH` dan merender `<Button asChild><a href={WAITLIST_PATH}>…</a></Button>`.
- Depends on: Task 1 agar destination CTA juga menerima submit.

- [ ] **Step 1: Tulis test gagal untuk destination CTA tunggal**

```ts
/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const ctaFiles = [
  "../../components/marketing/marketing-chrome.tsx",
  "../../components/marketing/mobile-nav-tree.tsx",
  "../../components/marketing/landing-hero-section.tsx",
  "../../components/marketing/feature-blocks-section.tsx",
  "../../components/marketing/bottom-cta-section.tsx",
  "../../components/marketing/faq-section.tsx",
  "../../components/marketing/pricing-section.tsx",
] as const;

test("all marketing acquisition controls use the shared live waitlist path", async () => {
  const ctaSource = await Bun.file(
    new URL("./cta.ts", import.meta.url),
  ).text();
  expect(ctaSource).toBe('export const WAITLIST_PATH = "/waitlist";\n');

  for (const path of ctaFiles) {
    const source = await Bun.file(new URL(path, import.meta.url)).text();
    expect(source).toContain('WAITLIST_PATH');
    expect(source).not.toMatch(/<Button\s+disabled/);
  }
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `bun test apps/www/src/lib/marketing/cta.test.ts`  
Expected: FAIL karena `cta.ts` belum ada dan marketing CTA masih `disabled`.

- [ ] **Step 3: Buat konstanta CTA dan ubah semua tombol menjadi link aktif**

Buat `apps/www/src/lib/marketing/cta.ts`:

```ts
export const WAITLIST_PATH = "/waitlist";
```

Di setiap component marketing, import konstanta tersebut dan gunakan pola berikut:

```tsx
<Button asChild size="lg">
  <a href={WAITLIST_PATH}>Gabung waitlist</a>
</Button>
```

Terapkan dengan label berikut:

| Lokasi | Label dan detail |
| --- | --- |
| `marketing-chrome.tsx` | Kembalikan link sekunder `Dapatkan kabar saat rilis` dan primary `Gabung waitlist`; keduanya memakai `WAITLIST_PATH`. |
| `mobile-nav-tree.tsx` | Kembalikan dua CTA setara desktop: ghost `Dapatkan kabar saat rilis` dan primary `Gabung waitlist`, keduanya `asChild`. Tambahkan kembali prop `waitlistLabel: string` dan kirim dari `MarketingChrome`. |
| `landing-hero-section.tsx` | Kembalikan `MagneticButton` dan tombol primary `Gabung waitlist`; import `MagneticButton` serta `WAITLIST_PATH`. |
| `feature-blocks-section.tsx` | Primary CTA `Gabung waitlist →` menjadi link aktif. |
| `bottom-cta-section.tsx` | Kembalikan `MagneticButton` yang membungkus CTA `Gabung waitlist →`. |
| `faq-section.tsx` | Tombol kontak `Gabung waitlist` menjadi `asChild` link aktif. |
| `pricing-section.tsx` | Tambahkan `href: WAITLIST_PATH` pada setiap `planPresentation` dan render `<Button asChild …><a href={presentation.href}>{presentation.cta}</a></Button>`. |
| `landing-footer.astro` | Import `WAITLIST_PATH`, tambahkan kembali kolom link berisi `Dapatkan kabar saat rilis` dan `Gabung waitlist`, keduanya ke konstanta tersebut; kembalikan grid dua kolom untuk `linkColumns`. |

Jangan memakai literal `"/waitlist"` di component atau layout; satu-satunya deklarasi literal harus berada di `cta.ts`.

- [ ] **Step 4: Jalankan test CTA dan typecheck**

Run: `bun test apps/www/src/lib/marketing/cta.test.ts && bun run --filter '@aqsha/www' typecheck`  
Expected: seluruh test PASS; Astro check dan plan catalog check PASS.

- [ ] **Step 5: Commit task**

```bash
git add apps/www/src/lib/marketing/cta.ts apps/www/src/lib/marketing/cta.test.ts \
  apps/www/src/components/marketing/marketing-chrome.tsx \
  apps/www/src/components/marketing/mobile-nav-tree.tsx \
  apps/www/src/components/marketing/landing-hero-section.tsx \
  apps/www/src/components/marketing/feature-blocks-section.tsx \
  apps/www/src/components/marketing/bottom-cta-section.tsx \
  apps/www/src/components/marketing/faq-section.tsx \
  apps/www/src/components/marketing/pricing-section.tsx \
  apps/www/src/components/marketing/landing-footer.astro
git commit -m "feat(www): enable waitlist acquisition CTAs"
```

## Task 3: Ganti katalog fitur dan media legacy dengan placeholder produk

**Files:**
- Create: `apps/www/src/components/marketing/product-preview-placeholder.tsx`
- Create: `apps/www/src/data/features.test.ts`
- Modify: `apps/www/src/data/features.ts`
- Modify: `apps/www/src/components/marketing/feature-frame.tsx`
- Modify: `apps/www/src/components/marketing/landing-hero-section.tsx`
- Modify: `apps/www/src/components/marketing/feature-blocks-section.tsx`

**Interfaces:**
- Produces: `ProductPreviewSurface`, `ProductPreview`, dan `ProductPreviewPlaceholder`.
- Consumes: hero collage serta `FeatureFrame` menerima `feature.preview`, tidak lagi menerima image path/alt legacy.
- Depends on: Task 2 untuk CTA di hero/feature section.

- [ ] **Step 1: Tulis test gagal untuk katalog research-first**

```ts
/// <reference types="bun-types" />

import { expect, test } from "bun:test";
import { FEATURE_KEYS, FEATURES } from "./features";

test("feature catalog tells the project-first product story", () => {
  expect(FEATURE_KEYS).toEqual(["projects", "document", "references", "astra"]);
  expect(FEATURES.projects.preview.surface).toBe("research-shelf");
  expect(FEATURES.document.preview.surface).toBe("typst-document");
  expect(FEATURES.references.preview.surface).toBe("references");
  expect(FEATURES.astra.preview.surface).toBe("astra-review");
  expect(JSON.stringify(FEATURES)).not.toContain("frame-workspace.webp");
  expect(JSON.stringify(FEATURES)).not.toContain("fitur-provenance");
});

test("placeholder is explicit and decorative", async () => {
  const source = await Bun.file(
    new URL("../components/marketing/product-preview-placeholder.tsx", import.meta.url),
  ).text();
  expect(source).toContain("data-product-preview");
  expect(source).toContain("aria-hidden");
  expect(source).toContain("Preview produk");
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `bun test apps/www/src/data/features.test.ts`  
Expected: FAIL karena feature key lama masih `workspace`, `citations`, dan `provenance`; placeholder belum ada.

- [ ] **Step 3: Definisikan data fitur dan interface preview yang baru**

Ganti isi `apps/www/src/data/features.ts` dengan interface dan katalog berikut. Pertahankan helper `featureHash`, `featurePath`, dan `featurePartnerIndex`.

```ts
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
```

Gunakan definisi feature berikut:

```ts
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
  points: ["Pilih jenis karya dan mulai dari kerangka", "Topik, tenggat, dan bahan pendukung tetap dekat"],
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
  points: ["Outline bab selalu dekat", "Preview membantu kamu melihat draf sebagai satu kesatuan"],
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
  points: ["Library akun dan referensi proyek saling terhubung", "Cari literatur paper-first saat kamu butuh bahan baru"],
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
  points: ["Tandai bagian yang ingin dibantu", "Terima atau tolak usulan per-hunk"],
  navLabel: "Astra sebagai co-writer",
  navDescription: "Bantuan scoped proyek dengan proposal yang dapat direview.",
  navIcon: "sparkles",
},
```

Atur `FEATURE_KEYS` dan `FEATURE_NAV_KEYS` menjadi `["projects", "document", "references", "astra"]` agar hero, nav, dan langkah mengikuti urutan proyek-first.

- [ ] **Step 4: Buat placeholder dan hubungkan ke frame yang ada**

Buat `apps/www/src/components/marketing/product-preview-placeholder.tsx`:

```tsx
import type { ProductPreview } from "@/data/features";
import { cn } from "@/lib/utils";

export function ProductPreviewPlaceholder({
  preview,
  className,
}: {
  preview: ProductPreview;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-product-preview={preview.surface}
      className={cn(
        "absolute inset-0 grid place-items-center bg-muted/45 p-5 text-center",
        className,
      )}
    >
      <div className="max-w-[16rem] rounded-xl border-2 border-dashed border-border bg-card/85 px-4 py-5">
        <p className="text-xs font-semibold text-muted-foreground">Preview produk</p>
        <p className="font-heading mt-2 text-lg font-medium text-foreground">
          {preview.title}
        </p>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">
          {preview.caption}
        </p>
      </div>
    </div>
  );
}
```

Ubah `FeatureFrame` agar menerima `preview: ProductPreview`, merender `<ProductPreviewPlaceholder preview={preview} />`, dan hapus prop `image`, `alt`, serta `<img>`. Pertahankan seluruh motion wrapper, `FrameChrome`, aspect ratio, tilt, dan parallax.

Pada `FeatureBlocksSection`, ganti kedua pemakaian berikut:

```tsx
<FeatureFrame
  preview={feature.preview}
  aspectClassName="h-full w-full"
  initialRotate={index % 2 === 0 ? -1.1 : 1.1}
/>
```

Pada `LandingHeroSection`:

- Ganti `HERO_FRAME_LAYOUT` key menjadi `projects`, `document`, `references`, `astra` dan pertahankan posisi/rotasi masing-masing yang sekarang dipakai empat frame.
- Hapus `<img src={frame.image} … />` dan render `<ProductPreviewPlaceholder preview={frame.preview} />` pada area aspect ratio frame.
- Hapus field `image` dan `alt` dari data yang dikonsumsi hero.

- [ ] **Step 5: Jalankan test dan typecheck**

Run: `bun test apps/www/src/data/features.test.ts && bun run --filter '@aqsha/www' typecheck`  
Expected: PASS; tidak ada referensi prop `image`/`alt` yang tersisa pada `FeatureFrame`.

- [ ] **Step 6: Commit task**

```bash
git add apps/www/src/data/features.ts apps/www/src/data/features.test.ts \
  apps/www/src/components/marketing/product-preview-placeholder.tsx \
  apps/www/src/components/marketing/feature-frame.tsx \
  apps/www/src/components/marketing/landing-hero-section.tsx \
  apps/www/src/components/marketing/feature-blocks-section.tsx
git commit -m "feat(www): present project-first product placeholders"
```

## Task 4: Ganti social proof dan media legacy dengan cerita produk yang jujur

**Files:**
- Create: `apps/www/src/components/marketing/audience-marquee-section.tsx`
- Create: `apps/www/src/components/marketing/landing-content.test.ts`
- Modify: `apps/www/src/pages/index.astro`
- Modify: `apps/www/src/components/marketing/founder-story-section.tsx`
- Modify: `apps/www/src/components/marketing/bottom-cta-section.tsx`
- Modify: `apps/www/src/components/marketing/hero-doodles.tsx`
- Delete: `apps/www/src/components/marketing/university-marquee-section.tsx`
- Delete: `apps/www/src/lib/marketing/social-proof.ts`
- Delete: `apps/www/src/components/marketing/testimonial-section.tsx`
- Delete: `apps/www/src/components/marketing/testimonial-section.test.ts`
- Delete: `apps/www/public/landing/frame-astra.webp`
- Delete: `apps/www/public/landing/frame-citations.webp`
- Delete: `apps/www/public/landing/frame-provenance.webp`
- Delete: `apps/www/public/landing/frame-workspace.webp`
- Delete: `apps/www/public/landing/hero-loop.mp4`
- Delete: `apps/www/public/landing/hero-loop.webm`
- Delete: `apps/www/public/landing/hero-poster.webp`
- Delete: `apps/www/public/landing/workspace-view.webp`

**Interfaces:**
- Produces: `AudienceMarqueeSection`, marker audience statis tanpa counter, nama universitas, atau testimonial.
- Consumes: `ProductPreviewPlaceholder` dari Task 3 bila diperlukan untuk mempertahankan frame di cerita produk.
- Depends on: Task 3 agar landing tidak lagi memerlukan asset `frame-*.webp`.

- [ ] **Step 1: Tulis test gagal untuk landing tanpa social proof/media lama**

```ts
/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const indexSource = await Bun.file(
  new URL("../../pages/index.astro", import.meta.url),
).text();
const founderSource = await Bun.file(
  new URL("./founder-story-section.tsx", import.meta.url),
).text();

test("landing uses an audience marker instead of unsupported social proof", () => {
  expect(indexSource).toContain('<AudienceMarqueeSection client:visible />');
  expect(indexSource).not.toContain("UniversityMarqueeSection");
  expect(indexSource).not.toContain("TestimonialSection");
});

test("founder story no longer embeds the old product tour media", () => {
  expect(founderSource).not.toContain("hero-loop.webm");
  expect(founderSource).not.toContain("hero-loop.mp4");
  expect(founderSource).not.toContain("hero-poster.webp");
  expect(founderSource).toContain("karya tulis");
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `bun test apps/www/src/components/marketing/landing-content.test.ts`  
Expected: FAIL karena landing masih mengimpor `UniversityMarqueeSection`/`TestimonialSection` dan founder masih memuat video lama.

- [ ] **Step 3: Buat audience marker statis dan susun ulang landing**

Buat `audience-marquee-section.tsx` dengan marker berikut dan tanpa state, counter, Motion `animate`, atau nama institusi:

```tsx
const AUDIENCE_MARKERS = [
  "Skripsi",
  "Tesis",
  "Disertasi",
  "Artikel jurnal",
  "Proposal",
  "Makalah",
] as const;

export function AudienceMarqueeSection() {
  return (
    <section
      aria-label="Aqsha untuk karya tulis akademik"
      className="pt-16 sm:pt-24"
    >
      <div className="mx-auto max-w-7xl px-4 pb-7 text-center sm:px-6 sm:pb-8">
        <p className="mx-auto max-w-2xl text-pretty text-lg leading-snug text-foreground/75 sm:text-xl">
          Untuk karya tulis yang sedang kamu kerjakan—dari ide awal sampai draf siap direview.
        </p>
      </div>
      <div className="overflow-hidden border-y-2 border-border bg-primary">
        <ul className="mx-auto flex w-full max-w-7xl flex-wrap items-stretch justify-center">
          {AUDIENCE_MARKERS.map((marker) => (
            <li key={marker} className="border-l-2 border-primary-foreground/15 px-6 py-5 text-sm font-bold text-primary-foreground first:border-l-0 sm:px-9 sm:py-6">
              {marker}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

Di `index.astro`:

- Ganti import/pemakaian `UniversityMarqueeSection` menjadi `AudienceMarqueeSection`.
- Hapus import/pemakaian `TestimonialSection`.
- Pertahankan urutan hero → audience marker → comparison → latest teaser → feature blocks → founder story → pricing → FAQ → bottom CTA → footer.
- Ubah meta description menjadi: `Aqsha menyatukan proyek karya tulis, dokumen Typst, referensi, dan Astra supaya risetmu bergerak menjadi draf yang siap direview.`

- [ ] **Step 4: Tulis ulang story, CTA, dan doodle tanpa narasi fear-driven**

Di `founder-story-section.tsx`:

- Pertahankan foto `me.jpeg` dan block letter, tetapi hapus seluruh block video serta import `DrawnArrow` dan `HandNote` yang hanya dipakai video.
- Ganti pembuka menjadi: `Aqsha dimulai dari masalah yang sederhana: riset dan tulisan sering hidup di tempat yang berbeda.`
- Gunakan tiga alasan berikut di `REASONS`:

```ts
const REASONS = [
  {
    lead: "Mulai dari karya tulis yang ingin diselesaikan",
    rest: ", bukan dari percakapan kosong yang cepat kehilangan konteks.",
  },
  {
    lead: "Menjaga sumber dekat dengan draf",
    rest: ", supaya ide, catatan, dan referensi tidak tercerai-berai.",
  },
  {
    lead: "Memberi Astra ruang untuk membantu tanpa mengambil alih",
    rest: ", lewat usulan yang tetap kamu review sendiri.",
  },
] as const;
```

Di `bottom-cta-section.tsx`, ganti konstanta dan deskripsi:

```ts
const HEADLINE = "Beri risetmu satu tempat untuk bertumbuh.";
```

```tsx
Aqsha membantu kamu menautkan proyek, sumber, dan draf—lalu tetap memegang keputusan pada setiap perubahan penting.
```

Di `hero-doodles.tsx`, ganti hand note `tiap klaim ada sumbernya` menjadi `ide dan sumber, satu benang`.

- [ ] **Step 5: Hapus media dan komponen yang tidak lagi digunakan**

```bash
rm apps/www/src/components/marketing/university-marquee-section.tsx \
  apps/www/src/lib/marketing/social-proof.ts \
  apps/www/src/components/marketing/testimonial-section.tsx \
  apps/www/src/components/marketing/testimonial-section.test.ts \
  apps/www/public/landing/frame-astra.webp \
  apps/www/public/landing/frame-citations.webp \
  apps/www/public/landing/frame-provenance.webp \
  apps/www/public/landing/frame-workspace.webp \
  apps/www/public/landing/hero-loop.mp4 \
  apps/www/public/landing/hero-loop.webm \
  apps/www/public/landing/hero-poster.webp \
  apps/www/public/landing/workspace-view.webp
```

- [ ] **Step 6: Jalankan test dan cek tidak ada referensi asset lama**

Run:

```bash
bun test apps/www/src/components/marketing/landing-content.test.ts
rg -n 'UniversityMarqueeSection|TestimonialSection|STUDENT_COUNT|hero-loop|hero-poster|workspace-view|frame-(astra|citations|provenance|workspace)' apps/www/src apps/www/public
```

Expected: test PASS; `rg` keluar dengan exit code `1` (tidak ada kecocokan).

- [ ] **Step 7: Commit task**

```bash
git add -A apps/www/src/components/marketing apps/www/src/lib/marketing \
  apps/www/src/pages/index.astro apps/www/public/landing
git commit -m "refactor(www): remove legacy social proof and product media"
```

## Task 5: Jadikan perbandingan workflow netral dan product-first

**Files:**
- Create: `apps/www/src/data/compare-rows.test.ts`
- Modify: `apps/www/src/data/compare-rows.ts`
- Modify: `apps/www/src/components/marketing/why-aqsha-section.tsx`

**Interfaces:**
- Produces: `CompareRow` dengan `fragmented` dan `aqsha`, bukan field competitor.
- Consumes: `WhyAqshaSection` merender dua workflow tanpa brand kompetitor atau jawaban AI palsu.

- [ ] **Step 1: Tulis test gagal untuk data perbandingan netral**

```ts
/// <reference types="bun-types" />

import { expect, test } from "bun:test";
import { COMPARE_ROWS } from "./compare-rows";

test("comparison rows contrast workflows without naming competitors", () => {
  expect(COMPARE_ROWS).toHaveLength(3);
  for (const row of COMPARE_ROWS) {
    expect(row.fragmented.label).toBe("Alur terpencar");
    expect(row.aqsha.label).toBe("Di Aqsha");
    expect(row.aqsha.steps.length).toBeGreaterThan(1);
  }
  expect(JSON.stringify(COMPARE_ROWS)).not.toContain("ChatGPT");
  expect(JSON.stringify(COMPARE_ROWS)).not.toContain("Perplexity");
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `bun test apps/www/src/data/compare-rows.test.ts`  
Expected: FAIL karena tipe/data saat ini masih memiliki `competitor` dan menyebut ChatGPT/Perplexity.

- [ ] **Step 3: Ganti tipe dan tiga row perbandingan**

Ganti tipe menjadi:

```ts
export type CompareRow = {
  prompt: string;
  fragmented: {
    label: "Alur terpencar";
    detail: string;
    note: string;
  };
  aqsha: {
    label: "Di Aqsha";
    steps: { icon: CompareStepIconKey; text: string }[];
    result: string;
  };
};
```

Gunakan tiga row berikut:

```ts
{
  prompt: "Mulai menulis karya tulis baru",
  fragmented: {
    label: "Alur terpencar",
    detail: "Topik, catatan, dokumen, dan percakapan AI dimulai di tempat yang berbeda.",
    note: "konteksnya mudah putus di tengah jalan",
  },
  aqsha: {
    label: "Di Aqsha",
    steps: [
      { icon: "pen", text: "Buat proyek sesuai jenis karya tulis" },
      { icon: "archive", text: "Simpan topik, tenggat, dan bahan pendukung di satu rumah" },
      { icon: "book-open", text: "Mulai dari dokumen dan outline yang sama" },
    ],
    result: "Kamu mulai dari karya yang ingin diselesaikan, bukan dari tab kosong.",
  },
},
{
  prompt: "Menemukan sumber untuk bab berikutnya",
  fragmented: {
    label: "Alur terpencar",
    detail: "Paper tersimpan di banyak tab, metadata di satu tempat, dan daftar pustaka di tempat lain.",
    note: "sumber sulit kembali ke draf yang membutuhkannya",
  },
  aqsha: {
    label: "Di Aqsha",
    steps: [
      { icon: "search", text: "Jelajahi literatur secara paper-first" },
      { icon: "archive", text: "Simpan sitasi ke perpustakaan akun" },
      { icon: "quote", text: "Tautkan referensi ke proyek aktif" },
    ],
    result: "Sumber tetap dekat dengan proyek dan draf tempat ia akan dipakai.",
  },
},
{
  prompt: "Meminta bantuan untuk memperbaiki bagian draf",
  fragmented: {
    label: "Alur terpencar",
    detail: "Saran AI datang sebagai teks baru tanpa hubungan yang jelas dengan dokumen yang sedang kamu kerjakan.",
    note: "perubahan penting mudah masuk tanpa sempat ditinjau",
  },
  aqsha: {
    label: "Di Aqsha",
    steps: [
      { icon: "book-open", text: "Tandai bagian yang perlu dibantu" },
      { icon: "pen", text: "Astra menyusun proposal perubahan dalam konteks proyek" },
      { icon: "check-circle", text: "Review dan terima hunk yang kamu setujui" },
    ],
    result: "Astra membantu menggerakkan draf, sementara keputusan akhirnya tetap di tanganmu.",
  },
},
```

Tambahkan `quote` pada `CompareStepIconKey` dan map ke `QuoteIcon` di renderer.

- [ ] **Step 4: Adaptasi renderer tanpa bubble kompetitor**

Di `why-aqsha-section.tsx`:

- Ganti variant `competitor` pada `ToolChip` menjadi `fragmented`; icon sparkle hanya untuk variant `aqsha`.
- Ganti semua `row.competitor`, `row.competitorReply`, `row.competitorNote`, `row.steps`, dan `row.result` menjadi `row.fragmented.*` serta `row.aqsha.*`.
- Ubah heading dan intro menjadi:

```tsx
Bukan lebih banyak tab.
Lebih banyak benang yang tersambung.
```

```tsx
Aqsha memberi proyekmu satu tempat untuk bergerak dari bahan mentah menjadi draf yang bisa kamu review dengan tenang.
```

- Hapus paragraf footer yang menyebut riset Reddit, cerita pengguna “keburu percaya”, atau “mereka udah kena”.

- [ ] **Step 5: Jalankan test dan typecheck**

Run: `bun test apps/www/src/data/compare-rows.test.ts && bun run --filter '@aqsha/www' typecheck`  
Expected: PASS.

- [ ] **Step 6: Commit task**

```bash
git add apps/www/src/data/compare-rows.ts apps/www/src/data/compare-rows.test.ts \
  apps/www/src/components/marketing/why-aqsha-section.tsx
git commit -m "refactor(www): compare research workflows without fear copy"
```

## Task 6: Selaraskan navigation, FAQ, pricing, footer, dan waitlist copy

**Files:**
- Create: `apps/www/src/lib/marketing/public-copy.test.ts`
- Modify: `apps/www/src/lib/marketing/nav.ts`
- Modify: `apps/www/src/components/marketing/faq-data.ts`
- Modify: `apps/www/src/components/marketing/pricing-section.tsx`
- Modify: `apps/www/src/components/marketing/landing-footer.astro`
- Modify: `apps/www/src/pages/waitlist.astro`
- Modify: `apps/www/src/pages/waitlist/verify.astro`

**Interfaces:**
- Consumes: feature nav identity dari Task 3 dan `WAITLIST_PATH` dari Task 2.
- Produces: istilah publik research-first dengan UI price catalog yang tetap sinkron terhadap product snapshot.

- [ ] **Step 1: Tulis test gagal untuk copy publik tanpa terminology lama**

```ts
/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const publicFiles = [
  "./nav.ts",
  "../../components/marketing/faq-data.ts",
  "../../components/marketing/pricing-section.tsx",
  "../../components/marketing/landing-footer.astro",
  "../../pages/waitlist.astro",
] as const;

test("public marketing copy names projects and reviewable writing workflows", async () => {
  const allSource = await Promise.all(
    publicFiles.map((path) => Bun.file(new URL(path, import.meta.url)).text()),
  ).then((sources) => sources.join("\n"));

  expect(allSource).toContain("Proyek");
  expect(allSource).toContain("Typst");
  expect(allSource).toContain("referensi");
  expect(allSource).not.toContain("aman pas sidang");
  expect(allSource).not.toContain("sumbernya beneran ada");
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `bun test apps/www/src/lib/marketing/public-copy.test.ts`  
Expected: FAIL karena FAQ/pricing/footer masih memakai terminology dan janji lama.

- [ ] **Step 3: Perbarui navigation dan pricing tanpa mengubah plan snapshot**

Di `nav.ts`:

```ts
export const navTree: NavTopItem[] = [
  {
    type: "menu",
    label: "Cara Aqsha bekerja",
    items: FEATURE_NAV_KEYS.map(featureNavItem),
    footerLinks: [
      { href: "/#cara-kerja", label: "Alur penulisan" },
      { href: "/#bandingin", label: "Kenapa berbasis proyek" },
    ],
  },
  { type: "link", label: "Mengapa Aqsha", href: "/#cerita-pembuat" },
  { type: "link", label: "Harga", href: "/#pricing" },
  { type: "link", label: "Blog", href: "/blog" },
  { type: "link", label: "Changelog", href: "/changelog" },
];
```

Di `pricing-section.tsx`, ubah hanya row UI:

```ts
{
  label: "Proyek",
  value:
    plan.workspaceLimit === UNLIMITED
      ? "∞"
      : formatCount(plan.workspaceLimit),
},
```

Jangan ubah `workspaceLimit`, `PLAN_CATALOG`, atau feature array pada `plan-catalog.ts`.

- [ ] **Step 4: Ganti FAQ dan footer copy dengan copy research-first**

Ganti `faqItems` menjadi tepat berikut:

```ts
export const faqItems = [
  {
    q: "Apa itu Aqsha?",
    a: "Aqsha adalah workspace riset dan penulisan untuk karya tulis akademik. Kamu mengelola proyek, dokumen Typst, referensi, dan bantuan Astra dalam satu alur.",
  },
  {
    q: "Karya tulis apa yang bisa dimulai di Aqsha?",
    a: "Kamu bisa memulai skripsi, tesis, disertasi, artikel jurnal, proposal, makalah, atau proyek bebas. Setiap jenis memberi kamu titik mulai yang sesuai, lalu tetap bisa kamu kembangkan sendiri.",
  },
  {
    q: "Apa peran Astra saat aku menulis?",
    a: "Astra bekerja dalam konteks proyekmu: membantu berpikir, menyusun outline, mencari bahan saat diperlukan, dan mengusulkan edit. Perubahan pada dokumen resmi tetap menunggu review dan keputusanmu.",
  },
  {
    q: "Bagaimana referensi terhubung dengan proyek?",
    a: "Perpustakaan menyimpan sitasi milik akunmu. Saat sebuah sumber ditautkan ke proyek, ia tetap tersedia untuk draf dan bibliografi proyek itu tanpa membuat salinan metadata baru.",
  },
  {
    q: "Apakah Aqsha sudah bisa dipakai sekarang?",
    a: "Aqsha sedang menyiapkan akses awal. Daftar di waitlist untuk mengonfirmasi email dan mendapatkan kabar saat akses dibuka.",
  },
] as const;
```

Di `landing-footer.astro`:

- Ubah heading menjadi dua baris `Riset dan tulisan` / `yang tetap terhubung`.
- Ubah `jumpLinks` menjadi `Cara kerja`, `Fitur`, `Harga`, dan `Mengapa Aqsha`.
- Hapus paragraph pill `sitasi kecek ke paper aslinya` dan hand note `dicek, baru dipercaya`.
- Hapus aside image `workspace-view.webp`; ubah grid wrapper menjadi satu kolom dan pertahankan navigasi, theme toggle, social link, serta copyright.

Di `waitlist.astro`, gunakan:

```astro
title="Akses awal Aqsha"
description="Daftar waitlist untuk mendapatkan kabar saat Aqsha, workspace riset dan penulisan berbasis proyek, membuka akses awal."
```

```astro
<h1>Masuk daftar akses awal Aqsha</h1>
<p>
  Tinggalkan email untuk mengonfirmasi pendaftaran. Kami akan mengabarimu saat
  Aqsha siap dibuka—bukan untuk mengirim newsletter marketing.
</p>
```

Di `waitlist/verify.astro`, ubah `description` menjadi `Konfirmasi email untuk akses awal Aqsha.` tanpa mengubah flow verifikasi.

- [ ] **Step 5: Jalankan test, plan check, dan typecheck**

Run:

```bash
bun test apps/www/src/lib/marketing/public-copy.test.ts
bun run --filter '@aqsha/www' check:plans
bun run --filter '@aqsha/www' typecheck
```

Expected: semua PASS, termasuk sync `PLAN_CATALOG` dengan `packages/services`.

- [ ] **Step 6: Commit task**

```bash
git add apps/www/src/lib/marketing/nav.ts \
  apps/www/src/lib/marketing/public-copy.test.ts \
  apps/www/src/components/marketing/faq-data.ts \
  apps/www/src/components/marketing/pricing-section.tsx \
  apps/www/src/components/marketing/landing-footer.astro \
  apps/www/src/pages/waitlist.astro apps/www/src/pages/waitlist/verify.astro
git commit -m "feat(www): align public copy with research-first Aqsha"
```

## Task 7: Reset blog, kosongkan changelog, dan tangani empty state secara eksplisit

**Files:**
- Create: `apps/www/src/components/changelog/changelog-list.test.ts`
- Create: `apps/www/src/content/blog/proyek-dulu-baru-percakapan-ai.mdx`
- Create: `apps/www/src/content/blog/sumber-klaim-draf-tetap-terhubung.mdx`
- Create: `apps/www/src/content/blog/astra-co-writer-yang-bisa-kamu-review.mdx`
- Modify: `apps/www/src/components/blog/blog-list.tsx`
- Modify: `apps/www/src/components/changelog/changelog-list.tsx`
- Modify: `apps/www/src/pages/blog/index.astro`
- Modify: `apps/www/src/pages/changelog/index.astro`
- Delete: `apps/www/src/content/blog/cara-verifikasi-sumber.mdx`
- Delete: `apps/www/src/content/blog/halo-aqsha.mdx`
- Delete: `apps/www/src/content/changelog/analisis-statistik-di-chat.mdx`
- Delete: `apps/www/src/content/changelog/deep-research-nunjukin-prosesnya.mdx`
- Delete: `apps/www/src/content/changelog/kelola-sitasi.mdx`
- Delete: `apps/www/src/content/changelog/rilis-pertama-aqsha.mdx`
- Delete: `apps/www/src/content/changelog/verifikasi-sumber-lebih-ketat.mdx`

**Interfaces:**
- Consumes: `WAITLIST_PATH` dari Task 2 dan existing `ChangelogEntry[]` mapping.
- Produces: changelog index yang informatif saat `entries.length === 0`; blog dengan tiga posting public research-first dan slug baru.

- [ ] **Step 1: Tulis test gagal untuk empty changelog yang dapat ditindaklanjuti**

```ts
/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const source = await Bun.file(
  new URL("./changelog-list.tsx", import.meta.url),
).text();

test("empty changelog explains the release state and offers waitlist", () => {
  expect(source).toContain("Belum ada catatan rilis");
  expect(source).toContain("WAITLIST_PATH");
  expect(source).toContain("Dapatkan kabar saat akses dibuka");
  expect(source).not.toContain("Belum ada pembaruan. Nantikan, ya.");
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `bun test apps/www/src/components/changelog/changelog-list.test.ts`  
Expected: FAIL karena empty state saat ini hanya menampilkan `Belum ada pembaruan. Nantikan, ya.`.

- [ ] **Step 3: Tulis ulang list/index copy dan empty state changelog**

Di `blog-list.tsx`, ubah deskripsi menjadi:

```tsx
Catatan Aqsha tentang menautkan proyek, sumber, dan draf saat menulis karya ilmiah.
```

Di `blog/index.astro`, gunakan description:

```astro
"Catatan Aqsha tentang proyek karya tulis, literatur, referensi, dan proses menulis yang saling terhubung."
```

Di `changelog/index.astro`, gunakan:

```astro
title="Changelog"
description="Catatan rilis Aqsha. Pembaruan dipublikasikan saat kapabilitas baru siap diumumkan."
```

Di `changelog-list.tsx`, import `Button` dan `WAITLIST_PATH`, lalu ganti empty branch dengan:

```tsx
<div className={`${changelogGutter} mt-10 max-w-md rounded-xl border-2 border-border bg-card p-5`}>
  <p className="font-medium text-foreground">Belum ada catatan rilis.</p>
  <p className="mt-2 text-sm leading-6 text-muted-foreground">
    Aqsha sedang menyiapkan akses awal untuk workflow riset dan penulisan berbasis proyek.
  </p>
  <Button asChild className="mt-5">
    <a href={WAITLIST_PATH}>Dapatkan kabar saat akses dibuka</a>
  </Button>
</div>
```

- [ ] **Step 4: Buat tiga artikel blog baru dengan frontmatter dan isi lengkap**

Buat `proyek-dulu-baru-percakapan-ai.mdx`:

```mdx
---
title: "Mulai dari proyek karya tulis, bukan dari percakapan AI"
description: "Kenapa karya tulis perlu menjadi pusat kerja riset, sementara chat dan tool lain mengorbit di sekelilingnya."
publishedAt: "2026-07-26"
tags: ["produk", "menulis akademik", "workflow"]
author: "Tim Aqsha"
---

Saat mulai menulis, godaan paling mudah adalah membuka chat lalu bertanya dari nol. Jawaban bisa datang cepat, tetapi konteks karya tulis sering tertinggal beberapa tab di belakang: judul, tujuan, catatan pembimbing, sumber, dan draf hidup terpisah.

## Proyek memberi konteks yang menetap

Sebuah skripsi atau paper bukan rangkaian prompt. Ia punya tujuan, struktur, tenggat, dan keputusan yang tumbuh bersama. Saat proyek menjadi rumah utama, setiap sesi dimulai dari karya yang sama—bukan dari percakapan yang harus menjelaskan ulang semuanya.

## Dokumen, sumber, dan bantuan berada di sekitar karya

Dokumen adalah tempat argumen berkembang. Referensi membantu kamu kembali ke bahan yang mendukungnya. Astra membantu ketika kamu membutuhkan pasangan berpikir. Ketiganya penting, tetapi tidak saling berebut menjadi pusat.

## Mulai dari bagian yang ingin kamu selesaikan

Pilih jenis karya, beri judul sementara, lalu buka bagian pertama yang perlu bergerak. Riset tidak harus rapi sejak awal; yang penting ia punya satu tempat untuk kembali.
```

Buat `sumber-klaim-draf-tetap-terhubung.mdx`:

```mdx
---
title: "Menjaga sumber, klaim, dan draf tetap terhubung"
description: "Hubungan yang terlihat antara referensi dan tulisan membuat proses riset lebih mudah dilanjutkan dari hari ke hari."
publishedAt: "2026-07-26"
tags: ["referensi", "literatur", "menulis akademik"]
author: "Tim Aqsha"
---

Banyak pekerjaan riset berhenti bukan karena idenya habis, tetapi karena jalan kembali ke sumbernya semakin kabur. Paper tersimpan di folder, catatan berada di aplikasi lain, dan kalimat yang sudah ditulis tidak lagi mengingat dari mana ia berangkat.

## Referensi bukan tumpukan file

Sebuah referensi berguna ketika kamu bisa menemukannya lagi saat sedang menulis. Perpustakaan sitasi menyimpan metadata milikmu, sedangkan referensi proyek memberi tahu sumber mana yang sedang relevan untuk karya tertentu.

## Klaim perlu hidup dekat dengan bukti

Ini bukan soal mengubah riset menjadi daftar pemeriksaan yang menegangkan. Ini soal mengurangi energi yang hilang saat kamu ingin membaca ulang, membandingkan, atau memperbaiki sebuah bagian draf.

## Buat jalur yang bisa diikuti lagi

Saat menemukan literatur, simpan ke perpustakaan. Saat ia penting untuk sebuah karya, tautkan ke proyek. Saat menulis, biarkan dokumen dan referensi itu tetap berada dalam jangkauan yang sama.
```

Buat `astra-co-writer-yang-bisa-kamu-review.mdx`:

```mdx
---
title: "Astra adalah co-writer yang bisa kamu review"
description: "Bantuan AI paling berguna saat ia memberi usulan yang dapat dipertimbangkan, bukan perubahan yang diam-diam masuk ke dokumen."
publishedAt: "2026-07-26"
tags: ["astra", "ai", "review"]
author: "Tim Aqsha"
---

Menulis dengan AI tidak harus berarti menyerahkan dokumen kepada satu tombol. Dalam karya akademik, keputusan kecil—pilihan istilah, susunan argumen, dan bagian yang perlu diperjelas—tetap membutuhkan pertimbangan penulisnya.

## Bantuan dimulai dari konteks proyek

Astra bekerja dari proyek yang sedang kamu buka. Ia dapat membaca dokumen aktif, melihat referensi proyek, dan memahami bagian mana yang kamu tandai untuk dibantu.

## Usulan lebih baik daripada perubahan diam-diam

Saat Astra menyarankan perbaikan, ia menyusunnya sebagai proposal. Kamu dapat meninjau perbedaan, menerima bagian yang sesuai, menolak bagian lain, atau meminta pendekatan baru.

## Penulis tetap memegang arah

Co-writer yang baik membuat langkah berikutnya lebih jelas. Ia tidak mengambil alih kepemilikan atas gagasan atau keputusan akhir tentang drafmu.
```

- [ ] **Step 5: Hapus katalog lama yang tidak lagi sesuai**

```bash
rm apps/www/src/content/blog/cara-verifikasi-sumber.mdx \
  apps/www/src/content/blog/halo-aqsha.mdx \
  apps/www/src/content/changelog/analisis-statistik-di-chat.mdx \
  apps/www/src/content/changelog/deep-research-nunjukin-prosesnya.mdx \
  apps/www/src/content/changelog/kelola-sitasi.mdx \
  apps/www/src/content/changelog/rilis-pertama-aqsha.mdx \
  apps/www/src/content/changelog/verifikasi-sumber-lebih-ketat.mdx
```

- [ ] **Step 6: Jalankan test, typecheck, dan verifikasi katalog**

Run:

```bash
bun test apps/www/src/components/changelog/changelog-list.test.ts
bun run --filter '@aqsha/www' typecheck
find apps/www/src/content/changelog -type f -name '*.mdx' -print
find apps/www/src/content/blog -type f -name '*.mdx' -print | sort
```

Expected: test/typecheck PASS; perintah changelog tidak mencetak file; perintah blog mencetak tepat tiga file baru.

- [ ] **Step 7: Commit task**

```bash
git add -A apps/www/src/components/blog apps/www/src/components/changelog \
  apps/www/src/content/blog apps/www/src/content/changelog \
  apps/www/src/pages/blog/index.astro apps/www/src/pages/changelog/index.astro
git commit -m "docs(www): reset editorial content for research-first Aqsha"
```

## Task 8: Perbarui SEO, structured data, dan lakukan gate verifikasi akhir

**Files:**
- Create: `apps/www/src/lib/seo-config.test.ts`
- Modify: `apps/www/src/lib/seo-config.ts`
- Modify: `apps/www/src/components/marketing/structured-data.tsx`
- Modify: `apps/www/src/pages/index.astro`
- Verify: seluruh file yang diubah pada Task 1–7

**Interfaces:**
- Consumes: `defaultDescription` baru serta `faqItems` dari Task 6.
- Produces: title/description/JSON-LD yang menggambarkan product-first Aqsha tanpa klaim lama.

- [ ] **Step 1: Tulis test gagal untuk metadata research-first**

```ts
/// <reference types="bun-types" />

import { expect, test } from "bun:test";
import { defaultDescription, ogImage } from "./seo-config";

test("site metadata describes the research-and-writing workspace", () => {
  expect(defaultDescription).toContain("proyek karya tulis");
  expect(defaultDescription).toContain("dokumen Typst");
  expect(defaultDescription).toContain("referensi");
  expect(defaultDescription).not.toContain("mengecek tiap sumber");
  expect(ogImage.subtitle).toBe("Proyek, sumber, dan draf yang tetap terhubung.");
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `bun test apps/www/src/lib/seo-config.test.ts`  
Expected: FAIL karena deskripsi dan Open Graph subtitle masih menjual pengecekan sumber.

- [ ] **Step 3: Ganti metadata dan pastikan JSON-LD tetap menggunakan source of truth**

Di `seo-config.ts`, ubah:

```ts
export const defaultDescription =
  "Aqsha adalah workspace riset dan penulisan untuk proyek karya tulis: dokumen Typst, referensi terhubung, dan Astra yang mengusulkan perubahan untuk kamu review.";
```

```ts
export const ogImage = {
  title: "Aqsha untuk riset dan karya tulis",
  subtitle: "Proyek, sumber, dan draf yang tetap terhubung.",
};
```

Di `structured-data.tsx`:

- Tetap impor `faqItems`; jangan menyalin FAQ ke JSON-LD.
- Ubah `softwareApplication.applicationCategory` dari `EducationalApplication` menjadi `WritingApplication`.
- Pastikan `description: defaultDescription` tetap dipakai pada `SoftwareApplication`.

Di `index.astro`, gunakan title `Workspace riset dan karya tulis untuk mahasiswa` dan pastikan description hero memakai kalimat yang sama dengan arah research-first, bukan janji “nggak ketahuan pas sidang”.

- [ ] **Step 4: Jalankan seluruh test www, typecheck, build, dan scan regresi**

Run:

```bash
bun test apps/www/src
bun run --filter '@aqsha/www' typecheck
bun run --filter '@aqsha/www' build
rg -n -i 'nggak ketahuan|aman pas sidang|sumbernya beneran ada|paper palsu|ChatGPT|Perplexity|STUDENT_COUNT|UniversityMarqueeSection|TestimonialSection|frame-workspace|frame-astra|frame-citations|frame-provenance|hero-loop|workspace-view' apps/www/src apps/www/public
```

Expected: seluruh test/typecheck/build PASS; `rg` selesai dengan exit code `1` karena seluruh legacy claim/reference telah hilang.

- [ ] **Step 5: Uji manual route dan state penting**

1. Jalankan `bun run dev:www` dari root dan buka `http://localhost:4321`.
2. Periksa hero, feature frame placeholder, audience marker, perbandingan netral, pricing label Proyek, FAQ, footer, serta semua CTA pada desktop dan mobile.
3. Klik CTA di hero, header desktop, mobile navigation, feature block, pricing, FAQ, footer, dan bottom CTA; setiap tautan harus berakhir di `/waitlist`.
4. Di `/waitlist`, isi email valid, organisasi opsional, lalu submit saat API lokal aktif; pastikan state berubah menjadi `Mengirim…` lalu instruksi cek email. Uji respons API error untuk memastikan alert dan field invalid tetap terbaca.
5. Periksa `/blog` menampilkan tiga artikel baru dan `/changelog` menampilkan empty state + CTA, bukan error.
6. Ulangi route `/`, `/waitlist`, `/blog`, dan `/changelog` dalam light/dark theme serta viewport sekitar 375px dan 1440px. Pastikan focus ring dapat dilihat dan tidak ada media legacy yang broken.

- [ ] **Step 6: Commit task**

```bash
git add apps/www/src/lib/seo-config.ts apps/www/src/lib/seo-config.test.ts \
  apps/www/src/components/marketing/structured-data.tsx apps/www/src/pages/index.astro
git commit -m "feat(www): publish research-first marketing metadata"
```
