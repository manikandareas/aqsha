# Parity ledger — `apps/web` → `apps/svelte`

> Checklist scope Markdown (§0 #2, Phase 0 #3). **Bukan** sistem klaim konkuren — eksekusi sequential, satu owner. Ledger = minimum scope; item hanya boleh `parity-complete` bila fungsional + terlihat benar (bukan pixel-identik, §3.2), dengan source/target module, test sesuai risiko, dan review `parity-complete` (§15).

Baseline: commit `ec04389` (lihat [baseline.md](baseline.md)). Peta sumber: [route-manifest](manifests/route-manifest.md), [feature-manifest](manifests/feature-manifest.md), [import-manifest](manifests/import-manifest.md), [env-manifest](manifests/env-manifest.md).

**Status:** `not-started` · `in-progress` · `parity-complete` · `not-applicable` (butuh approval owner, §11 #1).

Kolom **Target** diisi path aktual saat porting (placeholder `apps/svelte/…` sekarang). Setiap item wajib mencakup — kecuali disebut N/A — happy/empty/loading/error/forbidden/not-found/retry, pointer+keyboard+focus, deep-link+Back/Forward+refresh, light/dark+desktop/mobile (§3.1).

## Ringkasan coverage (gate Phase 0: 100%)

| Cakupan | Jumlah | Status |
|---|---|---|
| Route/handler Next.js (route-manifest) | 45 file (25 page/route + 6 layout + 6 loading + 3 error + 5 SEO) | ✅ semua terpetakan ke item ledger |
| Feature area (§8.1–8.9) | 13 `features/*` + shell + platform | ✅ semua terpetakan |
| Total item ledger | 95 | semua `not-started` |

Route→item: semua URL di [route-manifest](manifests/route-manifest.md) tercakup oleh item Phase 2 (proxy/API), Phase 3 (shell/layout/error/loading), Phase 4 (public/SEO), Phase 5 (onboarding/settings), Phase 7 (`/app`, threads), Phase 8 (explore), Phase 9 (workspaces/artifacts).

**Phase 1 (scaffold + compatibility spikes): gate teknis LULUS — GO/NO-GO produk pending owner.**
Scaffold `@aqsha/svelte` (SvelteKit `2.63` + adapter-node + shadcn-svelte `nova`/`iconLibrary hugeicons` + Tailwind v4 + Vitest `vitest-browser-svelte`) hijau: sync/typecheck/build/lint/test + adapter-node boot (HTTP 200) + contract rules anti-React/anti-Lucide terverifikasi. Dealbreaker produk (svelte-clerk SSR/2FA, Mastra streaming `FND-11`, svelte-streamdown) = **OWNER-RUN** connected slice. Detail: [decision record](apps-svelte-phase1-decision-record.md) + [spike log](apps-svelte-phase1-spikes.md).

---

## Phase 2 — Platform foundation (API, auth, env, observability, proxy)

| ID | Scope | Source (`apps/web/`) | Target | Status | Notes |
|---|---|---|---|---|---|
| FND-1 | Eden Treaty API client | `lib/api-client.ts`, `lib/api.ts` | `apps/svelte/lib/api/` | not-started | Reuse Eden core; base URL `PUBLIC_API_URL`. |
| FND-2 | API server helpers / unwrap | `lib/api-server.ts` | `apps/svelte/lib/api/` | not-started | Server fetch via `handleFetch`. |
| FND-3 | QueryClient per-request | `lib/query-provider.tsx` | `apps/svelte/lib/query/` | not-started | ★ No singleton; `dehydrate`+`<HydrationBoundary>` (§3.5). |
| FND-4 | Query key registry + policies | `lib/api-query.ts` | `apps/svelte/lib/query/` | not-started | Keys/stale/invalidation identik (contract test). |
| FND-5 | Error normalization | `lib/api-error.ts` | `apps/svelte/lib/errors/` | not-started | `readableApiErrorMessage`; payload `{message,code,severity,field}`. |
| FND-6 | Auth facade | `lib/auth-server.ts` | `apps/svelte/lib/auth/` | not-started | `getAuth`/`requireUser`/`getToken`; `svelte-clerk`. |
| FND-7 | Viewer identity | `lib/use-viewer-identity.ts` | `apps/svelte/lib/auth/` | not-started | ★ No global session cache. |
| FND-8 | Session hook + protected `/app` + onboarding gate | `proxy.ts`, `components/onboarding-gate.tsx` | `apps/svelte/hooks.server.ts` | not-started | Server gate; `/changelog(.*)` public. |
| FND-9 | Clerk token via `handleFetch` | `lib/api-server.ts`, `proxy.ts` | `apps/svelte/hooks.server.ts` | not-started | Sekali di boundary `lib/auth`. |
| FND-10 | Env mapping + boot validation | `.env.example`, config | `apps/svelte/lib/env` | not-started | ★ `$env/dynamic/*` only (§3.7); lihat env-manifest. |
| FND-11 | Mastra streaming proxy | `app/mastra-api/[...path]/route.ts`, `proxy.ts` | `apps/svelte/routes/mastra-api/[...path]/+server.ts` | not-started | ★ No buffer/compression/idle-timeout; abort propagation. Dealbreaker Phase 1. |
| FND-12 | Sentry SvelteKit | `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation*.ts`, `lib/sentry-config.ts` | `apps/svelte/hooks.{client,server}.ts` | not-started | Release/env/redaction/source maps/tunnel. |
| FND-13 | Browser-safe public plan catalog | `features/marketing/**` (impor `@aqsha/services/plan`) | shared pure-data/API | not-started | ★ §4.1 no services/db di bundle. |
| FND-14 | `handleError` client+server | `app/error.tsx`, `global-error.tsx` | `apps/svelte/hooks.{client,server}.ts` | not-started | → Sentry capture. |

## Phase 3 — Design system, theme, shell, layout

| ID | Scope | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| CSS-1 | Golden CSS globals | `app/globals.css` | `apps/svelte/styles/globals.css` | not-started | ★ Jangan bersihkan token; ganti hanya selector framework-specific (§9.1). |
| CSS-2 | BlockNote skin (copy only) | `app/styles/blocknote-aqsha.css` | `apps/svelte/styles/blocknote-aqsha.css` | not-started | Wiring editor = Phase 10. |
| UIP-1 | Primitives batch 1 | `components/ui/{button,badge,card,input,textarea,separator,skeleton,spinner,avatar}.tsx` | `apps/svelte/components/ui/` | not-started | Salin variant/class Aqsha (§9.2). |
| UIP-2 | Overlay primitives | `components/ui/{tooltip,popover,hover-card*,collapsible}.tsx` | `apps/svelte/components/ui/` | not-started | Portal/z-index/focus/Escape. |
| UIP-3 | Menu/dialog primitives | `components/ui/{dialog,sheet,drawer,dropdown-menu,context-menu,select,command}.tsx` | `apps/svelte/components/ui/` | not-started | `vaul-svelte`/Bits; snap/overlay/outside-click. |
| UIP-4 | Layout primitives | `components/ui/{tabs,scroll-area,sidebar,input-group*,link-preview}.tsx` | `apps/svelte/components/ui/` | not-started | — |
| UIP-5 | Misc primitives | `components/ui/{announcement,flicker-spinner}.tsx`, `components/confirm-dialog.tsx` | `apps/svelte/components/ui/` | not-started | — |
| SHL-1 | Root layout + provider order | `app/layout.tsx` | `apps/svelte/routes/+layout.svelte` | not-started | theme/query/clerk/toaster/motion order. |
| SHL-2 | App shell + protected `/app` + redirects | `components/app-shell.tsx`, `app/app/layout.tsx`, `app/app/(product)/layout.tsx` | `apps/svelte/routes/app/+layout.svelte` | not-started | — |
| SHL-3 | Sidebar (desktop/mobile, collapsed cookie) | `components/app-sidebar.tsx`, `components/ui/sidebar.tsx` | `apps/svelte/components/layout/` | not-started | Cookie persistence. |
| SHL-4 | Nav user menu | `components/nav-user.tsx` | `apps/svelte/components/layout/` | not-started | — |
| SHL-5 | Detail split + side-panel + responsive drawer | `components/detail/**`, `components/layout/**` | `apps/svelte/components/layout/` | not-started | Container queries `@2xl:`; expand/collapse. |
| SHL-6 | Theme (anti-flash) | `components/theme-provider.tsx`, `theme-toggle.tsx` | `apps/svelte/lib/…` + `app.html` inline | not-started | `mode-watcher`; `.dark` before paint. |
| SHL-7 | Toaster | `components/app-toaster.tsx` | `apps/svelte/components/` | not-started | `svelte-sonner`; copy/duration/action. |
| SHL-8 | Loading/error/not-found surfaces | `components/app-loading-overlay.tsx`, `error-state-page.tsx`, `app/**/loading.tsx`, `not-found.tsx` | `+error.svelte`/skeleton | not-started | Semua loading.tsx (route-manifest). |
| SHL-9 | Onboarding gate + user sync | `components/onboarding-gate.tsx`, `authenticated-user-sync.tsx` | `apps/svelte/…` | not-started | Server gate FND-8 + client sync. |
| SHL-10 | Icons adapter | `@aqsha/ui/icons` (118 konsumen) | `apps/svelte/lib/icons/` | not-started | ★ `@hugeicons/svelte`; no Lucide; rewrite tiap shadcn `add`. |
| SHL-11 | Motion provider + reduced-motion | `components/motion-provider.tsx`, `lib/motion.ts` | `apps/svelte/…` | not-started | Simpan duration/easing/spring. |

## Phase 4 — Public routes, auth screens, blog/changelog, SEO

| ID | Scope | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| MKT-1 | Landing (semua section/interaksi/copy) | `app/page.tsx`, `features/marketing/**` | `routes/(public)/+page.svelte` | not-started | 13 komponen; `for-you-section`/`structured-data` → browser-safe (FND-13). |
| MKT-2 | Auth screens | `app/sign-in/[[...rest]]/`, `app/sign-up/[[...rest]]/` | `routes/(auth)/{sign-in,sign-up}/[...rest]/` | not-started | Clerk appearance; catch-all `[...rest]`. |
| MKT-3 | Blog list + detail | `app/blog/**`, `features/blog/**`, `components/mdx-components.tsx` | `routes/(content)/blog/**` | not-started | prose/code/anchor/date/category. |
| MKT-4 | Changelog list + detail | `app/changelog/**`, `features/changelog/**` | `routes/(content)/changelog/**` | not-started | `allChangelogs` plural gotcha. |
| MKT-5 | Content Collections schema | `content-collections.ts` | `apps/svelte/content-collections config` | not-started | `@content-collections/vite` + `mdsvex`; frontmatter/ordering/slug sama. |
| MKT-6 | Metadata/OG/Twitter/JSON-LD | `lib/metadata.ts`, `lib/seo-config.ts`, `app/{opengraph,twitter}-image.tsx` | `apps/svelte/…` | not-started | canonical/OG/JSON-LD snapshot identik. |
| MKT-7 | robots/sitemap/manifest/icons | `app/{robots,sitemap,manifest}.ts` | `routes/{robots.txt,sitemap.xml,manifest.webmanifest}/+server.ts` | not-started | Output snapshot identik. |

## Phase 5 — Onboarding & Settings

| ID | Scope | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| ONB-1 | Onboarding state machine | `app/onboarding/page.tsx`, `features/onboarding/**` | `routes/onboarding/+page.svelte` | not-started | steps background/interests/source/finish; min 3 interest; validation/progress/back-next. |
| ONB-2 | Resume + auth redirect + completion | `features/onboarding/lib/use-onboarding-flow.ts` | `apps/svelte/features/onboarding/` | not-started | Server gate; completion route. |
| SET-1 | Overview | `features/settings/components/overview-page.tsx` | equivalent | not-started | — |
| SET-2 | Account (name/interests/prefs, sign-out/delete) | `features/settings/components/account-page.tsx` | equivalent | not-started | Delete/sign-out. |
| SET-3 | Appearance | `features/settings/appearance-page.tsx` | equivalent | not-started | Theme selection. |
| SET-4 | Personalization | `features/settings/components/personalization-page.tsx` | equivalent | not-started | — |
| SET-5 | Usage & billing | `features/settings/components/usage-billing-page.tsx`, `lib/billing-derived.ts` | equivalent | not-started | usage/plan/checkout/portal/change/cancel. |
| SET-6 | Security (password/2FA/reverification/sessions) | `features/settings/security/**`, `security-page.tsx` | equivalent | not-started | QR via `@svelte-put/qr`; Clerk test-instance E2E. |
| SET-7 | Integrations (Mendeley/Zotero) | `features/settings/components/integrations-page.tsx`, `lib/integrations.ts` | equivalent | not-started | connect/callback/status/refresh/disconnect. |
| SET-8 | Settings rail/mobile/dialog/toast | `features/settings/lib/settings-menu.ts` | equivalent | not-started | Additive-only (memory: no Settings refactor). |

## Phase 6 — Thread model, streaming renderer, chat core (pure-first)

| ID | Scope | Source (`features/threads/lib/` unless noted) | Target | Status | Notes |
|---|---|---|---|---|---|
| THC-1 | Timeline reducer + types | `mastra-timeline.ts`, `timeline-types.ts` | `apps/svelte/features/threads/lib/` | not-started | ★ Pure; port test dulu. Fixture: timeline. |
| THC-2 | Citation markdown transform | `citation-markdown.ts` | equivalent | not-started | ★ Fixture: citation. |
| THC-3 | Stats markdown transform | `stats-markdown.ts`, `stats-next-steps.ts`, `stats-run-detail.ts` | equivalent | not-started | ★ stats-viz. |
| THC-4 | Viz markdown transform | `viz-markdown.ts`, `components/deep-viz/labels.ts`, `components/stats-viz/verdict-meta.ts` | equivalent | not-started | ★ deep-viz. |
| THC-5 | Mastra client + agent integration | `mastra-client.ts`, `use-mastra-agent.ts` | equivalent | not-started | ★ Event ordering/idempotency; abort/reconnect/revive. |
| THC-6 | Svelte Streamdown adapter + viz components + sanitize | `components/ai-elements/response.tsx`, `inline-citation.tsx`, `table-block.tsx`, `code-block.tsx`, `reasoning.tsx` | `apps/svelte/components/ai-elements/` | not-started | ★ Dealbreaker Phase 1; XSS tests; no loosening. |
| THC-7 | Conversation viewport/anchoring | `components/ai-elements/conversation*.tsx`, `lib/scroll-to-message.ts` | equivalent | not-started | `use-stick-to-bottom` winner (Phase 1 spike). |
| THC-8 | Composer/attachment pure models | `attachment-buckets.ts`, `token-pill.ts`, `source-card.ts`, `composer-inline-editor.ts` | equivalent | not-started | Pure; port with tests. |
| THC-9 | chat-core reuse verification | `@aqsha/chat-core` (42 konsumen) | reuse | not-started | Framework-agnostic; no rewrite. |

## Phase 7 — Thread experience UI & full Astra flows

| ID | Scope | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| THX-1 | Thread recent/pinned/create/rename/pin/delete | `features/thread-experience/**`, `features/threads/api.ts` | equivalent | not-started | `pinnedAt` soft-cap 10. |
| THX-2 | Thread shell + Lite/Pro selector | `components/thread-shell.tsx`, `features/thread-experience/components/**` | equivalent | not-started | Agent tier selector. |
| THX-3 | Composer contenteditable + chips/slash/mentions/context/attachments | `features/threads/components/**`, `lib/context-selection.ts` | equivalent | not-started | ★ contenteditable+caret/IME/CJK = tersulit (Phase 1 spike). |
| THX-4 | Messages/tools/sources/artifacts/export + reasoning/plan/HITL | `components/ai-elements/**`, `features/threads/components/**` | equivalent | not-started | reference download; analysis export bytes. |
| THX-5 | `/deep` durable lifecycle | `features/threads/lib/use-mastra-agent.ts`, deep components | equivalent | not-started | subscribe/observe/abort/reconnect/revive/settle/regenerate/failure/notices. |
| THX-6 | Panels + URL serialization + responsive drawer | `features/thread-experience/utils/thread-panel-model.ts`, `lib/panel-surface.ts` | equivalent | not-started | ★ URL byte-equivalent (nuqs→runed). |
| THX-7 | Send status/cooldown/rate/billing gates | `features/threads/api.ts` | equivalent | not-started | Return unions (rate-limit/billing), bukan throw. |
| THX-8 | History seed + scroll anchoring/long thread | `thread-experience-model.ts`, `lib/scroll-to-message.ts` | equivalent | not-started | ★ 400-message seed; follow-bottom; reduced motion. |

## Phase 8 — Explore & discovery

| ID | Scope | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| EXP-1 | Explore home bento + feed/search/suggestion + URL state | `features/explore/**`, `app/app/(product)/explore/page.tsx` | equivalent | not-started | ★ URL state; feed fixture. |
| EXP-2 | Card variants + house ads + record/hide | `features/discovery/house-ads.ts`, `model.ts` | equivalent | not-started | — |
| EXP-3 | Paper reader + related + PDF thumb | `app/.../explore/[paperRef]/**`, `features/discovery/**` | equivalent | not-started | ID/reference resolution. |
| EXP-4 | News reader | `app/.../explore/n/[id]/**` | equivalent | not-started | — |
| EXP-5 | Ask Astra context/side panel | `features/discovery/ask-astra.ts` | equivalent | not-started | ★ Exact Ask Astra payload. |
| EXP-6 | Loading/error/not-found | `explore/[paperRef]/loading.tsx`, `explore/n/[id]/loading.tsx` | equivalent | not-started | Back/Forward/refresh. |

## Phase 9 — Workspaces, library, artifacts, citations, PDF (exclude editable BlockNote)

| ID | Scope | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| WSP-1 | Workspace list/create/update/archive | `features/workspaces/api.ts`, `pages/workspaces-index-page.tsx` | equivalent | not-started | — |
| WSP-2 | Root/folder board + breadcrumb (one-level) | `features/workspaces/components/**` | equivalent | not-started | — |
| WSP-3 | Search/filter/sort/group | `lib/library-grid.ts`, `utils/workspace-library-model.ts` | equivalent | not-started | ★ Test ada. |
| WSP-4 | Folder/artifact create/rename/move/delete | `features/workspaces/hooks/**` | equivalent | not-started | — |
| WSP-5 | Grid/card/context menu/multi-select/marquee/keyboard/DnD | `utils/workspace-marquee-selection.ts`, `components/library-*` | equivalent | not-started | ★ Marquee pure model + test; `svelte-dnd-action`. |
| WSP-6 | Upload queue (max 20/conc 3/progress/continue-on-fail/retry/MIME) | `utils/workspace-file-upload.ts`, `lib/artifact-upload-{limits,policy}.ts` | equivalent | not-started | ★ State machine + test; fixture upload. |
| WSP-7 | Upload toast + enrichment/extraction status | `components/workspace-upload-toast-model.ts` | equivalent | not-started | ★ Test-worthy. |
| WSP-8 | Panel URL state (`chat`/`cite`/`cite:<id>`) | `utils/workspace-panel-model.ts`, `lib/panel-surface.ts` | equivalent | not-started | ★ Codec test ada. |
| WSP-9 | Artifact reader page/panel | `features/artifacts/components/**`, `app/.../artifacts/[artifactId]/page.tsx` | equivalent | not-started | title/metadata/Markdown/document/Mermaid/PDF/delete. |
| WSP-10 | EmbedPDF + citation links | `components/*pdf*`, `lib/pdf-worker.ts` | equivalent | not-started | zoom/search/link/theme parity; EmbedPDF Svelte. |
| ART-1 | Artifacts CRUD/render/save/upload/link/save-to-workspace | `features/artifacts/**`, `utils/citation.ts` | equivalent | not-started | ★ citation.test.ts. |
| ART-2 | Citation Manager list/filter/tags/detail/CRUD/restore | `features/citations/**`, `components/citation/**` | equivalent | not-started | — |
| ART-3 | DOI/artifact create, copy, bulk, duplicates/merge | `features/citations/**` | equivalent | not-started | — |
| ART-4 | Import `.bib`/`.ris` preview→commit; export BibTeX/RIS/CSL JSON | `features/citations/export-model.ts` | equivalent | not-started | ★ Byte-exact; export-model.test.ts; fixture citation-export. |
| ART-5 | Provider folders/sync + style/document render/provenance/linked artifact | `features/citations/**` | equivalent | not-started | Mendeley/Zotero sync preview→commit. |
| ART-6 | Empty/missing/deleted states + panel deep links | `features/citations/**`, `features/artifacts/**` | equivalent | not-started | — |

## Phase 10 — BlockNote Svelte adapter & document editing

| ID | Scope | Source (`features/workspaces/`) | Target | Status | Notes |
|---|---|---|---|---|---|
| BLK-1 | `@blocknote/core` mount/unmount browser-only | `components/blocknote-editor-loader.tsx`, `blocknote-document-editor.tsx` | equivalent | not-started | Pin schema-compatible; cleanup subs; no format upgrade. |
| BLK-2 | Svelte UI via vanilla events | `blocknote-document-editor.tsx` | equivalent | not-started | formatting/link/file/side/suggestion/table UI dipakai. |
| BLK-3 | Inline citation + block bibliography schema | `components/blocknote-citation-schema.tsx` | equivalent | not-started | ★ props/node ID unchanged. |
| BLK-4 | Per-editor citation store + picker | `components/blocknote-citation-store.ts`, `citation-picker-dialog.tsx` | equivalent | not-started | Bukan global store. |
| BLK-5 | Autosave/debounce/flush/error + edit bus | `utils/artifact-editor-model.ts`, `lib/document-edit-bus.ts` | equivalent | not-started | ★ artifact-editor-model.test.ts; flush on unmount/close. |
| BLK-6 | XL AI transport + Ask Astra + accept/reject | `blocknote-document-editor.tsx` (xl-ai) | equivalent | not-started | Svelte accept/reject bila React UI tak reusable. |
| BLK-7 | Keyboard/paste/undo/redo/mobile/dark/export + round-trip | all above | equivalent | not-started | ★ React↔Svelte round-trip zero-loss (both directions). |

---

## Parity bugs & follow-ups (dua-app)

Catat di sini bug existing yang ditemukan saat porting — **jangan perbaiki diam-diam di web** (§15 #9).

| Tanggal | Item | Deskripsi | Ditemukan di | Tindakan |
|---|---|---|---|---|
| — | — | — | — | — |
