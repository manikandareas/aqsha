# Phase 8 decision record — Explore & discovery

> Bagian dari **Phase 8** (§10 [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md)).
> Tanggal: 2026-07-15. Melanjutkan Phase 1–7 (decision records + ledger). Bahasa Indonesia; nama
> package/API/simbol tetap English (AGENTS.md). Ledger: [`apps-svelte-parity-ledger.md`](apps-svelte-parity-ledger.md)
> EXP-1..6 = **done**.

Lapisan DISCOVERY di atas engine chat Phase 6/7: home explore bento + banner carousel (isi seam
Phase 7), feed dua-state (Jelajah↔Selidiki via `q`) + search/suggestion + URL state byte-equivalent,
kartu discovery kaya (variant per-tipe + cover generatif + PDF thumb) + house ads + record/hide, paper
reader (+ related OpenAlex + aside) + news reader + reader chat shell, "Ask Astra" (side panel compact
chat + ambient/selection context ke composer Phase 7 — EXACT payload), loading/error/not-found.
**BUKAN** workspaces/library/citations (Phase 9), **BUKAN** BlockNote (Phase 10).

---

## 1. Yang dibangun (peta file, di `apps/svelte/src`)

| Area | File | Sumber web |
|---|---|---|
| Model pure (EXP-2) | `lib/features/discovery/{types,model,format,house-ads,nav,ask-astra}.ts` (+`model.spec.ts`,`ask-astra.spec.ts`) | `features/discovery/{types,model,format,house-ads,nav,ask-astra}.ts` |
| Feed-blocks pure (EXP-1) | `lib/features/explore/feed-blocks.ts` (+spec) | `explore-findings.tsx` (`buildFeedBlocks` diekstrak) |
| URL codec (EXP-1) | `lib/features/explore/explore-url-model.ts` (+spec) | nuqs `q`/`topic` di `explore-page.tsx` |
| Data hooks | `lib/features/discovery/api.ts`, `lib/features/explore/api.ts` | idem web `api.ts` |
| Kartu (EXP-2) | `lib/features/discovery/components/{DiscoveryItemCard,CardMedia,PaperCover,PdfThumb,HouseAdBanner,SaveToWorkspaceButton}.svelte` | `discovery-item-card.tsx`, `house-ad-banner.tsx`, `pdf-thumb.tsx`, `generative-cover.tsx`, `save-to-workspace-button.tsx` |
| Explore surface (EXP-1) | `lib/features/explore/components/{ExplorePage,ExploreHero,ExploreAskBar,ExploreFindings,SectionHeader,ExploreFeedSkeleton}.svelte` | `features/explore/components/*` |
| Reader (EXP-3/4) | `lib/features/discovery/components/{PaperReader,PaperReaderRoute,PaperAside,NewsReader,NewsReaderRoute,ExploreReaderChatShell}.svelte`, `reader-ui/{ReaderShell,ReaderLoader,ReaderEmpty,Eyebrow,PillCta,AstraAgentAvatars,ExpandableText,ReaderSection}.svelte` (+`index.ts`) | `paper-reader.tsx`, `paper-aside.tsx`, `news-reader.tsx`, `explore-reader-chat-shell.tsx`, `reader-ui.tsx` |
| Ask Astra panel (EXP-5) | `lib/features/explore/components/{ExploreChatSidePanel,ExploreThreadChat,ThreadRecentSwitcher,ThreadActionsMenu,AccessDeniedState}.svelte` | `explore-chat-side-panel.tsx`, `compact-thread-chat-panel.tsx`+`chat-thread-surface.tsx`, `thread-recent-switcher.tsx`, `thread-actions-menu.tsx`, `access-denied-state.tsx` |
| Landing (isi seam Phase 7) | `lib/features/discovery/components/{HomeExploreBento,ExploreHandwrittenCue}.svelte`, `lib/components/HomeBannerCarousel.svelte`; wire di `MastraChatThreadSurface.svelte` | `home-explore-bento.tsx`, `explore-handwritten-cue.tsx`, `home-banner-carousel.tsx` |
| Route | `routes/app/(product)/explore/{+page.svelte,[paperRef]/+page.svelte,n/[id]/+page.svelte}` | `app/app/(product)/explore/**` |

## 2. Keputusan terkunci

### 2.1 URL codec q/topic — pure + `page.url`/`goto`, byte-equivalent (TIRU THX-6)

Plan §6 menyarankan `runed`/nuqs, tapi kontrak SEBENARNYA = **codec byte-equivalent** (§11.2). Diputuskan:
`explore-url-model.ts` PURE (`readExploreUrl`/`applyExploreUrl`/`parseTopicParam`/`serializeExploreUrl`),
di-wire via `page.url.searchParams` reaktif + `goto(url, { replaceState, noScroll, keepFocus })` di
`ExplorePage`. Parity nuqs: default `q=""` + `topic=null` **OMIT** param; topic invalid → `null` (strict
literal); `q` di-trim saat write; param lain dipertahankan. `history: replace` (nuqs default) → ganti
topik/query tidak menumpuk history. Contract test `explore-url-model.spec.ts` (omit-default, invalid→null,
preserve, round-trip). Tak perlu dep baru.

### 2.2 Ask Astra — `ComposerMentions` SHARED per-tree (publisher isi seam Phase 7)

Channel `ComposerMentions` (Phase 7) menunggu publisher. Di-set SEKALI di level halaman
(`ExplorePage`/`ExploreReaderChatShell` via `setComposerMentions(new ComposerMentions())`) → dibagi ke
feed cards (publisher: `setAmbientContextRefs`) DAN composer panel (consumer, via `getComposerMentions()`).
Propagasi lintas snippet: komponen di dalam snippet `main`/`side` DetailSplitLayout tetap keturunan
konteks halaman (scope leksikal snippet) — pola yang SAMA sudah dipakai `ThreadDetailShell` Phase 7, jadi
`getComposerMentions()`/`getThreadPanel()` di dalam snippet menemukan instance halaman. Reader page token
di-sync via `syncAmbientFromPage` (guard signature). **EXACT payload** `discoveryItemToContextRef` +
reader route refs contract-tested (`ask-astra.spec.ts`).

### 2.3 Chat panel = `MastraChatThreadSurface` compact + `bindUrlOnSend={false}` (BUKAN reuse ThreadDetailShell)

`ThreadDetailShell` membuat `ComposerMentions` + `ThreadPanelController` + `DetailSplitLayout` SENDIRI —
tak cocok untuk panel (mentions harus SHARED, tak butuh sub-panel/split bersarang). Diputuskan: komponen
lean **`ExploreThreadChat`** (agent owner: `ThreadAgent` + history seed 400 seperti shell, TAPI tanpa
`setComposerMentions`/`ThreadPanelController`/split) → render `MastraChatThreadSurface` compact. Ditambah
prop **`bindUrlOnSend`** (default `true`) di `MastraChatThreadSurface`: panel pass `false` supaya kirim
pertama TIDAK menimpa URL `?q=&topic=` Explore. **Divergence disengaja** dari web (web bump ke
`/threads/<id>` sambil PRESERVE search via `window.location.search`; menyalin itu lewat SvelteKit shallow
routing rapuh → pilih suppress = lebih aman, konteks Explore utuh; thread tetap tercipta di server & muncul
di daftar/switcher). `ExploreChatSidePanel` menyusun header (SidePanelFrame + recent switcher + hapus +
chat baru) + body keyed `{#key activeThreadId ?? 'new'}` (remount = agent segar; new-thread id di-generate
`ExploreThreadChat` per mount) + `AccessDeniedState` bila thread bukan milik akun.

### 2.4 PdfThumb — `pdfjs-dist` LANGSUNG (bukan react-pdf), page-1→canvas, client-only

Web pakai `react-pdf` (Document/Page). Svelte: **`pdfjs-dist` langsung** (§6.1 di bawah) — render page 1
ke `<canvas>`. Browser-only: `pdfjs-dist` menyentuh `DOMMatrix`/`OffscreenCanvas` → `await import('pdfjs-dist')`
di dalam `$effect` (guard `browser`), worker via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`
→ `GlobalWorkerOptions.workerSrc` (Vite emit asset; tak dieval SSR). `render({canvasContext,viewport,canvas})`
(pdfjs 5.x butuh `canvas`). Lazy in-view (IntersectionObserver rootMargin 500px) + ResizeObserver width +
timeout 12s + dev-only probe (`import.meta.env.PROD` skip) via `/papers/pdf-proxy`. Gagal/timeout → `onFail`
→ `PaperCover` jatuh ke `GenerativeCover`. `{#key pdfUrl}` di parent = remount bersih per URL (padanan
`key={pdfUrl}` web). EmbedPDF (viewer penuh Phase 9) masih DEFERRED — thumb tak butuh viewer.

### 2.5 Navigasi/lint — override per-glob discovery/explore (precedent Phase 7 source-cards)

Explore/discovery merender URL EKSTERNAL (paper/publisher/DOI/OpenAlex, house-ad, sumber berita) + deep
link internal dinamis/query (`/app/explore?topic=`, `/app/explore/<encoded key>`) + `goto(url)` same-page
(codec q/topic) yang tak bisa `resolve()`. Ditambah blok override `svelte/no-navigation-without-resolve`
`off` untuk `features/discovery/**`+`features/explore/**`+`HomeBannerCarousel.svelte` (precedent sama
`ui/**`+`marketing/**`+`settings/**`+thread source-cards). Internal reader href = string byte-identik web
(`encodeURIComponent`), BUKAN resolve() (hindari ambiguitas encoding `/` di DOI key). Link Jelajahi di
reader shell tetap `resolve('/app/(product)/explore')` (internal murni).

### 2.6 SaveToWorkspaceButton = seam Phase 9

Save-to-Workspace butuh WorkspacePicker + `useSaveUrl` (workspaces/artifacts = Phase 9). `SaveToWorkspaceButton.svelte`
= stub: render tombol + ikon + label + aria identik, klik → toast "hadir di fase berikutnya"; prop `onSaved`
(interest +1) tetap di-wire tapi dorman sampai Phase 9. record(research)/hide (EXP-2) LIVE penuh via overflow
menu.

## 3. Gotcha & temuan reusable

- **`@typescript-eslint/no-unused-expressions`**: baca reactive dep sebagai statement telanjang
  (`sessionKey;` di `$effect` reset budget) → error. Fix = `// eslint-disable-next-line ... -- reactive dep read only`
  (bukan `void x`, yang juga di-flag).
- **`svelte/prefer-svelte-reactivity`**: `new Set()`/`new URL()` LOKAL transient (dedupe di `.svelte`,
  URL builder di `goto`) → error. Fix = `eslint-disable-next-line` + alasan (padanan Phase 6/7). Reactive
  set (hidden ids, seen dedupe di `$derived`) pakai **`SvelteSet`** (`svelte/reactivity`).
- **pdfjs 5.x `RenderParameters`**: `page.render()` WAJIB `canvas` (bukan cuma `canvasContext`+`viewport`)
  di v5 — TS error kalau kurang.
- **Snippet + context**: komponen di dalam snippet (`main`/`side`) mewarisi konteks komponen PENDEFINISI
  snippet (scope leksikal), bukan perender — kunci Ask Astra sharing (§2.2).
- **`bindUrlOnSend`** (§2.3): `MastraChatThreadSurface.bumpUrl` bare `resolve()` MENJATUHKAN search Explore
  (`?q=&topic=`) → panel WAJIB suppress.
- **SvelteKit route param decoded**: `[paperRef]`/`[id]` sudah di-decode (`page.params`) → TIDAK perlu
  `decodeURIComponent` (beda web Next yang decode manual). Keyed `{#key param}` = remount reader per navigasi
  paper terkait (padanan re-instantiate segmen dinamis web).
- **`n/[id]` vs `[paperRef]`**: segmen statis `n` menang atas dinamis → `/app/explore/n/x`=berita,
  `/app/explore/doi:x`=paper.
- **EXP-6 tanpa `loading.tsx`**: SvelteKit client-render tak punya masalah nav-freeze RSC Next → loading =
  skeleton/loader internal + `ReaderEmpty`/`AccessDeniedState`; root `+error.svelte` (Phase 4) untuk error
  rute. Tak perlu file loading/error per-segmen.

## 4. Library gate (§6.1)

| Package | Versi (pin exact) | License | Svelte 5 / SSR | Catatan |
|---|---|---|---|---|
| `pdfjs-dist` | `5.4.296` | Apache-2.0 | Framework-agnostik; **browser-only** (DOMMatrix) → dynamic import di `$effect` + guard `browser`; worker via `new URL(..., import.meta.url)` (Vite emit `pdf.worker.min.*.mjs`, tak dieval SSR) | Versi = SAMA dengan `apps/web` (react-pdf → pdfjs-dist 5.4.296) → tak ada desync worker. Fallback bila berhenti terawat: PdfThumb dekoratif (jatuh ke GenerativeCover) → bisa dinonaktifkan tanpa kehilangan fungsi. Viewer penuh (EmbedPDF) = Phase 9. |

Assets baru di `static/`: `package-service.svg`, `javascript-illustration.svg`, `video-call.svg`, `pro-card.png`
(banner carousel; disalin dari `apps/web/public`).

## 5. Gate Phase 8 (§10) — HIJAU

| Cek | Perintah / bukti | Hasil |
|---|---|---|
| Typecheck | `bun run typecheck` (svelte-check) | **0 errors / 0 warnings** (7229 files) |
| Lint | `bun run lint` | Prettier clean + ESLint 0 |
| Test | `bun run test` | **244 passed / 38 files** (+24 Phase-8 kontrak) |
| Build | `bun run build` | OK (adapter-node; `pdf.worker.min.*.mjs` di-emit) |
| Contract: feed fixture | `model.spec.ts` + `feed-blocks.spec.ts` | paperToDiscoveryItem shape byte-identik + grid/feature/ad cadence |
| Contract: URL codec | `explore-url-model.spec.ts` | omit-default/invalid→null/preserve/round-trip |
| Contract: Ask Astra payload | `ask-astra.spec.ts` | explore-paper/news ContextRef byte-for-byte |
| No React/Radix/Lucide/db | grep `.svelte-kit/output/client` | nol (client bundle bersih; nol `@aqsha/db`/services) |

Critical E2E #5 (explore → reader → Ask Astra), feed pagination, record/hide, Back/Forward URL = **owner
E2E** (butuh backend :3001 + agent :4111 + sesi Clerk live; server-server DOWN saat sesi ini). Kode ter-port
faithful + gate hijau.

## 6. Yang TIDAK dikerjakan (di luar Phase 8)

- **Owner E2E live**: explore → reader → Ask Astra; feed pagination; record/hide; Back/Forward URL.
- **SaveToWorkspace penuh** (§2.6) = Phase 9 (WorkspacePicker + `useSaveUrl`).
- **EmbedPDF viewer penuh** (artifact reader) = Phase 9; PdfThumb (thumbnail) sudah live.
- **Dedup `deep-viz/SourceCardList` vs `components/SourceCardList`** (Phase 7 follow-up): DIEVALUASI —
  keduanya BERBEDA perilaku (deep-viz = outbound-link mandiri utk `ResultsTimeline`; components = preview
  di `ScrollDetailTrigger`) → dedup naif TAK aman (regresi timeline) → ditunda (bukan dead-code).
