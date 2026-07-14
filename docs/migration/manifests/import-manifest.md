# Import manifest — dependency React/Next `apps/web` → target Svelte

Entry point untuk agent: dependency React/Next yang dipakai `apps/web`, jumlah file yang mengimpor (baseline `ec04389`, via `rg "from '…lib'"`), versi terpin, dan target Svelte per peta library §6. **Angka = jumlah file yang mengimpor**, penanda seberapa luas blast radius porting.

> Metode hitung: `rg -l "from ['\"].*<lib>" apps/web`. Transitive tidak dihitung. Versi target Svelte **tidak** disalin dari sini — di-pin setelah library gate §6.1 pada Phase 1.

## Core framework / runtime

| Lib (web) | Versi | #File | Target Svelte | Phase | Catatan |
|---|---|---:|---|---|---|
| `react` / `react-dom` | 19.2.7 | 201 | Svelte 5 runes | 1–10 | Tidak ada React di production bundle Svelte (gate). |
| `next/*` (navigation/link/image/font) | 16.2.6 | 62 | SvelteKit routing, `$app/navigation`, `$app/state`, `<a>`, `<img>`, self-host font | 1–4 | URL identik; preserve replace/push/scroll/focus. |
| `@clerk/nextjs` | ^7.5.2 | 19 | `svelte-clerk` di balik `lib/auth` | 1–2 | **Dealbreaker gate Phase 1.** Pin exact, auth E2E, tangga fallback `@clerk/clerk-js`. |
| `@clerk/themes` | ^2.4.57 | (via clerk) | appearance Clerk Svelte | 4–5 | Style sign-in/up. |

## Data / state / URL

| Lib (web) | Versi | #File | Target Svelte | Phase | Catatan |
|---|---|---:|---|---|---|
| `@tanstack/react-query` | ^5.100.14 | 13 | `@tanstack/svelte-query` | 2,6–10 | **Gotcha**: `create*` argumen wajib fungsi `() => ({...})`; `QueryClient` per-request; SSR `dehydrate`+`<HydrationBoundary>`. |
| `nuqs` | ^2.8.9 | 8 | `runed` `useSearchParams` + Zod codec | 2,7–9 | URL output byte-equivalent (contract test). |
| `@mastra/client-js` | ^1.28.0 | 1 | reuse (`@mastra/client-js`) | 6 | Framework-agnostic; streaming raw. Dealbreaker gate Phase 1. |
| Eden Treaty (`@aqsha/api` client) | workspace | — | reuse core Eden (fetch-based) | 2 | Wrapper token berubah (via `handleFetch`). |

## UI primitives / styling

| Lib (web) | Versi | #File | Target Svelte | Phase | Catatan |
|---|---|---:|---|---|---|
| `radix-ui` | ^1.4.3 | (via ui) | Bits UI (di bawah shadcn-svelte) | 3 | Salin variant/class Aqsha; jangan default theme. |
| `shadcn` (registry) | ^4.7.0 | — | shadcn-svelte CLI/registry | 1,3 | `bun x skills add huntabyte/shadcn-svelte`. |
| `cmdk` | ^1.1.1 | 1 | shadcn-svelte Command | 3 | Bits-backed. |
| `vaul` | ^1.1.2 | 1 | `vaul-svelte` / shadcn-svelte Drawer | 3 | Snap/overlay/Escape/focus. |
| `frimousse` | ^0.3.0 | 1 | shadcn-svelte Calendar/Date Picker | 3 | Verify locale/tz/keyboard. |
| `sonner` | ^2.0.7 | 19 | `svelte-sonner` (shadcn-svelte) | 3 | Copy/duration/action tetap. |
| `next-themes` | ^0.4.6 | 4 | `mode-watcher` | 3 | `.dark`, hydration-safe, anti-flash. |
| `class-variance-authority` `^0.7.1`, `clsx` `^2.1.1`, `tailwind-merge` `^3.5.0`, `tw-animate-css` `^1.4.0` | — | — | tetap dipakai | 3 | Framework-agnostic. |
| `@aqsha/ui` (+ `/icons`) | workspace | **118** | **local `components/ui` + `lib/icons` Svelte** | 3 | React-only; jangan bocorkan React bundle (§13). Icon → `@hugeicons/svelte`, no Lucide. |

## Chat renderer / streaming

| Lib (web) | Versi | #File | Target Svelte | Phase | Catatan |
|---|---|---:|---|---|---|
| `streamdown` | ^2.5.0 | 4 | `svelte-streamdown` | 6 | **Dealbreaker gate Phase 1** (parity + security). Fallback `@humanspeak/svelte-markdown`. |
| `@streamdown/{cjk,code,math,mermaid}` | 1.x | (via streamdown) | plugin/adaptasi Svelte Streamdown | 6 | CJK/Shiki/math/Mermaid parity fixture. |
| `mermaid` `^11.15.0`, `shiki` `^3.23.0` | — | (via renderer) | tetap (framework-agnostic) | 6 | Mount client-only. |
| `use-stick-to-bottom` | ^1.1.4 | 3 | `stick-to-bottom-svelte` / `@humanspeak/svelte-virtual-chat` | 6 | Pilih via long-thread spike; jangan tambah virtualization diam-diam. |
| `ai` (Vercel AI SDK) | 7.0.0-beta.178 | (chat) | AI SDK Svelte bila perlu | 6 | Cek pemakaian aktual saat Phase 6. |

## Editor / PDF / DnD / QR

| Lib (web) | Versi | #File | Target Svelte | Phase | Catatan |
|---|---|---:|---|---|---|
| `@blocknote/core` | 0.51.4 | 2 | `@blocknote/core` + Svelte UI adapter | 10 | **Fase terakhir.** Pin schema-compatible; no format upgrade; round-trip zero-loss. |
| `@blocknote/react` / `@blocknote/shadcn` / `@blocknote/xl-ai` | 0.51.4 | 2 | Svelte adapter (vanilla core) | 10 | Tak ada UI Svelte resmi BlockNote; pakai vanilla events. |
| `react-pdf` | ^10.4.1 | 1 | EmbedPDF Svelte | 9 | Custom UI/theme; preserve citation link/fallback. |
| `pdfjs-dist` | 5.4.296 | 1 | (engine via EmbedPDF/pdf.js) | 9 | Mount client-only. |
| `@dnd-kit/core` | ^6.3.1 | 2 | `svelte-dnd-action` | 9 | a11y/touch/auto-scroll/folder drop tests; marquee tetap model pure TS. |
| `qrcode.react` | ^4.2.0 | 1 | `@svelte-put/qr` | 5 | Visual snapshot QR 2FA. |

## Content / SEO / observability

| Lib (web) | Versi | #File | Target Svelte | Phase | Catatan |
|---|---|---:|---|---|---|
| `@content-collections/{core,cli,next,mdx}` | 0.x | 4 | `@content-collections/vite` + `mdsvex` | 4 | Schema/frontmatter/ordering/slug/Shiki/anchor sama. |
| `@sentry/nextjs` | ^10.65.0 | 6 | `@sentry/sveltekit` | 2 | hooks client/server, release, env, source maps, tunnel. |
| `remark-gfm`, `rehype-slug`, `rehype-autolink-headings`, `@shikijs/rehype` | — | (content) | padanan Svelte/mdsvex | 4 | GFM/anchor/Shiki parity. |
| `date-fns` `^4.1.0`, `zod` `4.4.3`, `nanoid` `^5.1.11`, `d3-force`/`d3-shape` | — | — | tetap dipakai | all | Framework-agnostic. |
| `agentation` | ^3.0.2 (dev) | 1 | `agentation-svelte` (dev-only) bila lolos audit | 3+ | Jangan ship ke prod; keputusan dicatat. |
| `motion` | ^12.38.0 | 23 (`motion/react`) | Svelte `transition`/`animate` + `motion` JS | 3–8 | Simpan duration/easing/spring constants. |

## Workspace (framework-agnostic — reuse, jangan bawa ke browser bila server-only)

| Lib | #File | Ketentuan |
|---|---:|---|
| `@aqsha/chat-core` | 42 | **Reuse langsung** (framework-agnostic timeline/chat primitives). |
| `@aqsha/services` | — | **DILARANG** di browser bundle (§4.1). Cek `for-you-section.tsx`/`structured-data.tsx` yang impor `@aqsha/services/plan` → ganti dengan shared pure-data/payload API. |
| `@aqsha/db` | — | **DILARANG** di browser bundle. |
