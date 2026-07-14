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
| FND-1 | Eden Treaty API client | `lib/api-client.ts`, `lib/api.ts` | `lib/api/{client.ts,context.ts,index.ts}` | done | `createBrowserApiClient` + `apiClientContext`/`getApiClient` (padanan `useApi()`); base URL `publicEnv.PUBLIC_API_URL`. |
| FND-2 | API server helpers / unwrap | `lib/api-server.ts`, `lib/api-query.ts` | `lib/server/api.ts`, `lib/query/unwrap.ts` | done | `createServerApiClient(getToken)`; `unwrap()` (contract test). |
| FND-3 | QueryClient per-request | `lib/query-provider.tsx` | `lib/query/client.ts` | done | ★ No singleton (dibuat di `+layout.svelte`/request); isolation contract test. `networkMode:'always'`. `dehydrate`+HydrationBoundary tersedia utk SSR-first (Phase 4/7). |
| FND-4 | Query key registry + policies | `lib/api-query.ts` | `lib/query/keys.ts` | done | Port verbatim; contract test byte-equivalent (§11.2). |
| FND-5 | Error normalization | `lib/api-error.ts` | `lib/errors/{api-error.ts,svelte.ts}` | done | `readableApiErrorMessage`/`apiErrorCode`/`normalizeApiError`→`{message,code,severity,field}`; `failWithApiError`→`error()`; contract test. |
| FND-6 | Auth facade | `lib/auth-server.ts` | `lib/server/auth.ts`, `lib/auth/context.svelte.ts` | done | Server: `getAuth`/`requireUser`/`getServerToken`/`serverApiFor`. Client: `getAuthState`/`getAuthToken`/`getClerk`. Findings a/b baked. |
| FND-7 | Viewer identity + user sync | `lib/use-viewer-identity.ts`, `components/authenticated-user-sync.tsx` | `lib/auth/{viewer-identity.ts,viewer.svelte.ts,UserSync.svelte}` | done | ★ class `$state`+context per-request; pure helpers `.ts` (contract test); `UserSync` dedupe primitif `$derived`. |
| FND-8 | Session hook + protected `/app` + onboarding gate | `proxy.ts`, `components/onboarding-gate.tsx`, `app/app/layout.tsx` | `hooks.server.ts` | done | Gate SEMUA non-public (mirror `proxy.ts` allow-list); onboarding server gate (mirror `app/app/layout.tsx`, redirect pra-render). `/mastra-api` excluded. Verified: `/app`→303→`/sign-in`. |
| FND-9 | Clerk token via `handleFetch` | `lib/api-server.ts`, `proxy.ts` | `hooks.server.ts` | done | `handleFetch` inject bearer utk `PUBLIC_API_URL`; `getServerToken` utk Eden dari hooks. |
| FND-10 | Env mapping + boot validation | `.env.example`, config | `lib/env/{defaults.ts,schema.ts,public.ts}`, `lib/server/env.ts` | done | ★ `$env/dynamic/*` only (§3.7); zod SERVER-only, fail-fast boot (verified: bad env → ZodError, tak serve); public typed tanpa zod di client. Contract test. |
| FND-11 | Mastra streaming proxy | `app/mastra-api/[...path]/route.ts`, `proxy.ts` | `routes/mastra-api/[...path]/{+server.ts,proxy.ts}` | done | ★ `forwardToAgent` (env-free, testable); origin dari `serverEnv`. Integration test: header rules/first-byte/abort/large-payload. |
| FND-12 | Sentry SvelteKit | `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation*.ts`, `lib/sentry-config.ts` | `hooks.{client,server}.ts`, `lib/observability/`, `routes/sentry-tunnel/` | done | `initClient/ServerSentry` (env-driven, `sendDefaultPii:false`); tunnel `+server.ts` (SSRF-guard); source-map upload via vite plugin (kondisional trio env). Wiring code-complete (upload perlu token). |
| FND-13 | Browser-safe public plan catalog | `features/marketing/**` (impor `@aqsha/services/plan`) | `lib/plan/catalog.ts` | done | ★ §4.1: pure-data mirror (dist/plan.js tarik shared chunk → tak boundary-safe); contract test invariant. Consumer marketing = Phase 4. |
| FND-14 | `handleError` client+server | `app/error.tsx`, `global-error.tsx` | `hooks.{client,server}.ts`, `routes/+error.svelte` | done | `handleErrorWithSentry`→`{message,code}` (App.Error); `+error.svelte` render normalized. |

## Phase 3 — Design system, theme, shell, layout

| ID | Scope | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| CSS-1 | Golden CSS globals | `app/globals.css` | `src/styles/globals.css` + `src/app.css` | done | ★ Port 1:1 (token/prose/panel/composer/viz/shimmer/keycap/scrollbar/reduced-motion). Fonts self-host woff2 + `@font-face` (Inter/Instrument Serif/JetBrains Mono/Caveat). Dropped React-only imports (shadcn-react, `@blocknote/*`, blocknote-aqsha). react-pdf/streamdown selectors kept verbatim. FlickerSpinner keyframes global here. |
| CSS-2 | BlockNote skin (copy only) | `app/styles/blocknote-aqsha.css` | `src/styles/blocknote-aqsha.css` | not-started | Deferred — copied + wired with the BlockNote editor in Phase 10 (references `@blocknote/*` classes). |
| UIP-1 | Primitives batch 1 | `components/ui/{button,badge,card,input,textarea,separator,skeleton,spinner,avatar}.tsx` | `src/lib/components/ui/` | done | shadcn-svelte + Aqsha-align: button keycap + `data-variant/size`; badge `rounded-4xl` + ghost/link + `data-variant`; card `font-heading` title; Spinner→brand FlickerSpinner. Contract test `button-variants.spec.ts`. |
| UIP-2 | Overlay primitives | `components/ui/{tooltip,popover,hover-card*,collapsible}.tsx` | `src/lib/components/ui/` | done | tooltip/hover-card/collapsible = stock nova = web; popover aligned (align/sideOffset/class); portal/z-index/focus via bits-ui. |
| UIP-3 | Menu/dialog primitives | `components/ui/{dialog,sheet,drawer,dropdown-menu,context-menu,select,command}.tsx` | `src/lib/components/ui/` | done | dialog/sheet title `font-heading`; drawer `vaul-svelte@1.0.0-next.7` (Svelte 5); dropdown/context/select/command/tabs default→nova rewrite + icon-glyph fixes (Tick02→Check, UnfoldMore→ChevronDown, radio→filled CircleIcon) + `data-[state=active]` bug fix. |
| UIP-4 | Layout primitives | `components/ui/{tabs,scroll-area,sidebar,input-group*}.tsx` | `src/lib/components/ui/` | done | tabs (nova + `data-[state=active]` fix), scroll-area (vignette + viewportClassName), sidebar (+`flush`/`transparent` variants, `sidebar_state` cookie), input-group (button `sm` + addon focus-guard). **link-preview** deferred to Phase 6 (HoverCard composite; needs citation-pill consumer + `child`-snippet trigger API). |
| UIP-5 | Misc primitives | `components/ui/{announcement,flicker-spinner}.tsx` | `src/lib/components/ui/` | done | flicker-spinner (brand dot-grid, global keyframes); announcement (Badge + `themed` context). **confirm-dialog** = N/A (no standalone web source; deletions use Dialog). |
| SHL-1 | Root layout + provider order | `app/layout.tsx` | `src/routes/+layout.svelte` | done | Clerk > Query > AppProviders > Theme > OnboardingGate > Motion > Tooltip > page; AppToaster sibling inside Theme. Verified boot: `/` 200. |
| SHL-2 | App shell + protected `/app` + redirects | `components/app-shell.tsx`, `app/app/(product)/layout.tsx` | `src/routes/app/+layout.{svelte,server.ts}`, `src/lib/components/layout/AppShell.svelte` | done | SidebarProvider + Inset; `sidebar_state` cookie read server-side (contract test). Verified `/app`→303→`/sign-in`. |
| SHL-3 | Sidebar (desktop/mobile, collapsed cookie) | `components/app-sidebar.tsx`, `components/ui/sidebar.tsx` | `src/lib/components/layout/AppSidebar.svelte` | done | ★ Phase-3 CHROME (header nav Home/Jelajahi, ⌘K command palette, collapse, mobile Sheet, NavUser). Thread/workspace SECTIONS + row menus = Phase 7/9 (empty-state placeholder for now). |
| SHL-4 | Nav user menu | `components/nav-user.tsx` | `src/lib/components/layout/NavUser.svelte` | done | Avatar trigger → dropdown (profile/Settings/theme submenu/sign-out); viewer via Phase-2 `viewerContext`; `--bits-floating-anchor-width`. |
| SHL-5 | Detail split + side-panel + responsive drawer | `components/layout/**`, `lib/panel-surface.ts`, `hooks/use-mobile.ts` | `src/lib/components/layout/{DetailSplitLayout,ResponsiveSidePanel,SidePanelFrame,Panel*}.svelte`, `src/lib/panel-surface.ts`, `src/lib/hooks/panel-inline.svelte.ts` | done | Container queries `@2xl:`; expand/collapse seam (context); vaul-svelte bottom drawer. Consumer-validated in Phase 6/7 (no thread/workspace surface yet); ResponsiveSidePanel freeze-while-closing simplified to presence pending consumer. |
| SHL-6 | Theme (anti-flash) | `components/theme-provider.tsx`, `theme-toggle.tsx` | `src/lib/theme/`, `src/lib/components/layout/{ThemeProvider,ThemeMenuSub}.svelte` | done | ★ `mode-watcher`; ModeWatcher SSR-injects the pre-paint `setInitialMode` script into `<head>` (verified in served HTML) = the app.html inline-script equivalent, auto-synced to `mode-watcher-mode` key. Theme seam via context. |
| SHL-7 | Toaster | `components/app-toaster.tsx` | `src/lib/components/layout/AppToaster.svelte` | done | `svelte-sonner`; same copy/duration/action knobs (closeButton/expand/gap 10/offset 20/bottom-right/visibleToasts 4) + `shadow-aqsha` card; theme follows mode-watcher. |
| SHL-8 | Loading/error surfaces | `components/app-loading-overlay.tsx`, `onboarding-gate.tsx` (client half) | `src/lib/components/layout/{AppLoadingOverlay,OnboardingGate}.svelte`, `routes/+error.svelte` | done | AppLoadingOverlay (FlickerSpinner + rotating hints + reduced-motion) + client OnboardingGate overlay; `+error.svelte` = Phase 2. Per-route `loading` skeletons are per-consuming-phase. |
| SHL-9 | Onboarding gate + user sync | `components/onboarding-gate.tsx`, `authenticated-user-sync.tsx` | `src/lib/components/layout/OnboardingGate.svelte` | done | Client overlay (createQuery status → overlay + redirect); authoritative server gate = FND-8; UserSync = FND-7 (Phase 2). |
| SHL-10 | Icons adapter | `@aqsha/ui/icons` (~130 exports) | `src/lib/icons/index.ts` | done | ★ Full mirror (Lucide-name → Hugeicons glyph); `Icon` = `HugeiconsIcon`, glyph re-exports, `getArtifactTypeIcon`. Completeness contract test parses the React SoT (icons.completeness.spec.ts). No Lucide. |
| SHL-11 | Motion provider + reduced-motion | `components/motion-provider.tsx` | `src/lib/motion/`, `src/lib/components/layout/MotionProvider.svelte` | done | Svelte transitions replace framer-motion `LazyMotion`; MotionProvider publishes reduced-motion seam (svelte/motion `prefersReducedMotion`), preserves provider order. |

## Phase 4 — Public routes, auth screens, blog/changelog, SEO

| ID | Scope | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| MKT-1 | Landing (semua section/interaksi/copy) | `app/page.tsx`, `features/marketing/**` | `src/routes/(marketing)/{+layout,+page}.svelte` + `+page.server.ts`, `src/lib/features/marketing/components/**` (15 komponen) | done | ★ 6 section unik + FeatureFrame; scroll-theatre DIHAPUS. Motion Svelte primitives `$lib/motion` (reveal IO + scroll-progress + magnetic + CountUp + PriceOdometer) + reduced-motion. `for-you`/`structured-data` browser-safe via `$lib/plan` (FND-13). **Route group `(marketing)` = chrome bersama (header/footer) landing+blog+changelog** (DRY; header/footer dihapus dari LandingPage). Verified boot `/` 200 + section id + header/footer sekali. |
| MKT-2 | Auth screens | `app/sign-in/[[...rest]]/`, `app/sign-up/[[...rest]]/` | `src/routes/{sign-in,sign-up}/[...rest]/+page.{svelte,server.ts}` | done | svelte-clerk SignIn/SignUp; `appearance={{theme: shadcn}}` (@clerk/themes 2.4.57) di root ClerkProvider. sign-up→`/onboarding` (forceRedirect), sign-in→`/app`. Server redirect if authed. Catch-all `[...rest]`. Verified 200. |
| MKT-3 | Blog list + detail | `app/blog/**` (+`layout.tsx`), `features/blog/**`, `components/mdx-components.tsx` | `src/routes/(marketing)/blog/**`, `src/lib/features/blog/**` | done | SSR via `+page.server.ts` (§3.6). Chrome header/footer via group `(marketing)/+layout`. prose `.aqsha-prose .blog-prose`, Shiki, heading anchor, BlogPosting JSON-LD, article OG (cover override). 404 chrome-less (parity web). |
| MKT-4 | Changelog list + detail | `app/changelog/**` (+`layout.tsx`), `features/changelog/**` | `src/routes/(marketing)/changelog/**`, `src/lib/features/changelog/**` | done | `allChangelogs` PLURAL. Chrome via group `(marketing)`. CategoryBadge (icon glyph), GenerativeCover fallback, `.changelog-prose`. `/changelog(.*)` public di hooks gate (Phase 2). |
| MKT-5 | Content Collections schema | `content-collections.ts` | `apps/svelte/content-collections.ts` + `@content-collections/vite` + `kit.alias` | done | ★ SPIKE: `@content-collections/vite@0.3.0` (generate) + `kit.alias content-collections` (type SvelteKit) + `compileMarkdown`@0.1.4 (HTML string, BUKAN mdsvex — konten pure markdown → reuse pipeline rehype web = byte-parity, tanpa runtime MDX/React). Schema/slug/ordering/`_meta.path` identik. Plugin di-skip di vitest (watcher). |
| MKT-6 | Metadata/OG/Twitter/JSON-LD | `lib/metadata.ts`, `lib/seo-config.ts`, `app/{opengraph,twitter}-image.tsx` | `src/lib/seo/**` (config/metadata/SeoHead/structured-data) + `static/og.png` | done | `createPageMetadata`→`PageSeo`→`SeoHead.svelte` (svelte:head). title template `%s | Aqsha`, canonical/OG/Twitter/verification/JSON-LD graph. OG image STATIS `og.png` (satori+resvg one-off, nol runtime dep) 1200×630. Contract test values (byte-equiv). Verified served head. |
| MKT-7 | robots/sitemap/manifest/icons | `app/{robots,sitemap,manifest}.ts` | `src/routes/{robots.txt,sitemap.xml,manifest.webmanifest}/+server.ts` + `$lib/seo/handlers.ts` | done | Pure builders (contract test byte-equiv). Preview-noindex gate (`PUBLIC_SEO_ALLOW_INDEXING`, default false → disallow-all + `<meta robots noindex>` + `X-Robots-Tag`). Runtime-rendered (siteUrl env, no prerender). manifest.webmanifest ditambah PUBLIC_PATTERNS. Icons + `<link manifest>` di root layout. |

## Phase 5 — Onboarding & Settings

| ID | Scope | Source | Target | Status | Notes |
|---|---|---|---|---|---|
| ONB-1 | Onboarding state machine | `app/onboarding/page.tsx`, `features/onboarding/**` | `routes/onboarding/+page.svelte` + `$lib/features/onboarding/**` | done | Pure machine `onboarding-machine.ts` (STEPS/QUESTION_STEPS/BACK_TARGET/ADVANCE_TARGET/labels/isStepValid/buildCompletePayload) + contract test (10 cases). Steps welcome/background/interests/source/finish; min-3-interest; progress `01/03` counter; back/next; `{#key}`+fly motion (reduced-safe). Sources shuffled once/module-load (immutable const, never SSR'd). Wired the FEATURE version (`app/onboarding/onboarding-wizard.tsx` = dead code in web). |
| ONB-2 | Resume + auth redirect + completion | `features/onboarding/lib/use-onboarding-flow.ts` | `$lib/features/onboarding/state.svelte.ts` | done | `createOnboardingFlow()` (runes `$state` + `createMutation`); onSuccess sets `onboarding.status` cache `{completed:true}` (no bounce). Mount-only redirect if already completed → `/app/explore`. Server gate = FND-8 (hooks); client overlay = SHL-9; both untouched. Completion → `/app/explore` (mirror web `HOME_AFTER_ONBOARDING`, NOT `/app`). |
| SET-1 | Overview | `features/settings/components/overview-page.tsx` | `$lib/features/settings/pages/OverviewPage.svelte` | done | Paket aktif (CreditMeter) + Penggunaan (UsageChart 365d) + Percakapan placeholder. |
| SET-2 | Account (name/interests/prefs, sign-out/delete) | `features/settings/components/account-page.tsx` | `pages/AccountPage.svelte` | done | Name form (dirty tracking, derived value) + email/photo rows + delete dialog (type "HAPUS") → `users.me.delete` + `getSignOut()` seam → `/`. |
| SET-3 | Appearance | `features/settings/appearance-page.tsx` | `pages/AppearancePage.svelte` | done | Theme segmented (light/dark/system) via Phase-3 `ThemeState` seam (`preference`/`mode`/`setMode`); `mounted` guard (onMount) = padanan web `useSyncExternalStore` anti-flash. |
| SET-4 | Personalization | `features/settings/components/personalization-page.tsx` | `pages/PersonalizationPage.svelte` | done | Astra prefs (language/citation Select, style segmented, custom Textarea) + interests chips (min 3). `PreferenceSelect` = bits-ui `type="single"` (no `<SelectValue>`, trigger renders label). Draft-null-shows-server pattern. |
| SET-5 | Usage & billing | `features/settings/components/usage-billing-page.tsx`, `lib/billing-derived.ts` | `pages/UsageBillingPage.svelte`, `lib/billing-derived.ts` (+ contract test) | done | current/plan-list/checkout/portal/change/cancel via API; window toggle 30/90/365 (reactive queryKey via `days: () => number`). `billing-derived` (isCreditsLow/deepRunsQuota) ported + tested. |
| SET-6 | Security (password/2FA/reverification/sessions) | `features/settings/security/**`, `security-page.tsx` | `security/{PasswordPanel,ActiveDevicesPanel,TwoFactorPanel,clerk-error}.svelte(ts)`, `pages/SecurityPage.svelte` | done | Reverification seam `runWithReverification` + `getReverification()` (`clerk.__internal_openReverification`) — svelte-clerk ships no `useReverification`. `getClerkUser()` = padanan `useUser`. PasswordPanel + ActiveDevicesPanel WIRED; TwoFactorPanel ported (TOTP enroll frontend SDK + QR `@svelte-put/qr@2.1.3` + backup codes) but COMMENTED OUT in SecurityPage = web parity (web disables it too). Owner E2E on Clerk test-instance. |
| SET-7 | Integrations (Mendeley/Zotero) | `features/settings/components/integrations-page.tsx`, `lib/integrations.ts` | `pages/{IntegrationsPage,ProviderCard,ApiKeyConnectDialog}.svelte`, `lib/integrations.ts` | done | connect (OAuth url redirect) / API-key (Zotero, ApiKeyConnectDialog) / refresh / disconnect (ConfirmDialog). Callback `?connected`/`?error` toast then strip query (`goto replaceState`). Secrets never in client state. |
| SET-8 | Settings rail/mobile/dialog/toast | `features/settings/lib/settings-menu.ts`, `components/settings-{shell,rail,card,header}.tsx` | `components/{SettingsShell,SettingsRail,SettingsHeader,settings-card,*}.svelte`, `lib/settings-menu.ts` (+ contract test) | done | SettingsShell = own `Sidebar.Provider` + `variant="flush"` rail (distinct from product AppShell) + mobile trigger header. Routing: introduced `routes/app/(product)/` group (§7) so settings escapes AppShell; `routes/app/settings/+layout.svelte` = SettingsShell; `+page.server.ts` redirect → overview. NavUser/AppSidebar links → `/app/settings/overview`. Additive-only (no Settings redesign). |

## Phase 6 — Thread model, streaming renderer, chat core (pure-first)

| ID | Scope | Source (`features/threads/lib/` unless noted) | Target | Status | Notes |
|---|---|---|---|---|---|
| THC-1 | Timeline reducer + types | `mastra-timeline.ts`, `timeline-types.ts` | `$lib/features/threads/lib/` | done | **Verbatim** port (1574 baris, import identik, prettier-normalized) + `timeline-types.ts`. Contract test `mastra-timeline.spec.ts`: chat vocab (text/reasoning/tool/artifact/tool-call-delta), terminal (abort/error-truncation/error-full/tripwire), ask-gate, regenerate/dropLastTurn, workflow (start/plan-gate/synthesize/settle-by-runId), seedWorkflowProgress idempoten, rehydrate signal-user. |
| THC-2 | Citation markdown transform | `citation-markdown.ts` | equivalent | done | Pure `buildCitationMap`/`parseCitationNumbers`/`resolveCitationCards`/`citationMarkersInText` (tested). Rehype→marked: render pakai native `markedCitations` + snippet (§1 phase6-DR). |
| THC-3 | Stats markdown transform | `stats-markdown.ts`, `stats-next-steps.ts`, `stats-run-detail.ts` | equivalent | done | `stats-run-detail.ts`/`stats-next-steps.ts` verbatim; `stats-markdown.ts` = pure `statsMarkersInText` + marked ext. Tested. |
| THC-4 | Viz markdown transform | `viz-markdown.ts`, `components/deep-viz/labels.ts`, `components/stats-viz/verdict-meta.ts` | equivalent | done | `viz-markdown.ts` pure `isVizFence`/`vizPayloadFromCode` (tested); labels/verdict-meta port (icon=glyph data). Fence→marked block ext. |
| THC-5 | Mastra client + agent integration | `mastra-client.ts`, `use-mastra-agent.ts` (spine) | `state/thread-agent.svelte.ts` + `lib/{mastra-client,chunk-replay}.ts` | done | `ThreadAgent` class ($state timeline, getter `committedAgentKind`). Subscription+replay (`chunk-replay.spec.ts` idempotency)+reconnect+degraded+delta-batch+send+queue+stop+regenerate+HITL-tool. Deep imperatif orkestrasi = Phase 7 (reducer siap). |
| THC-6 | Svelte Streamdown adapter + viz components + sanitize | `components/ai-elements/{response,message,reasoning,inline-citation}.tsx`, viz/stats-block+context | `$lib/components/ai-elements/` | done | ★ `Response`/`Reasoning`/`InlineCitation`/`DeepVizFigure`/`StatsVizFigure` + marked-extensions. Sanitize `renderHtml`-off + allowlist (TIDAK dilonggarkan). Anti-forgery gate = reactive snippet props. Table/code chrome = native lib. `Response.svelte.spec.ts` 14 Chromium hijau. |
| THC-7 | Conversation viewport/anchoring | `components/ai-elements/conversation*.tsx`, `lib/scroll-to-message.ts` | `$lib/components/ai-elements/` | done | Hand-roll `StickToBottom` (`{@attach}` + context, nol virtualization) + Conversation/Content/ScrollButton/EmptyState. `conversation-state.svelte.spec.ts` 2 Chromium hijau. `scroll-to-message.ts` verbatim. |
| THC-8 | Composer/attachment pure models | `attachment-buckets.ts`, `token-pill.ts`, `source-card.ts`, `composer-inline-editor.ts` | equivalent | done | Semua pure port + tested (`attachment-buckets`/`token-pill`/`source-card`). `composer-inline-editor.ts` DOM murni (no runes; contenteditable wiring = Phase 7). |
| THC-9 | chat-core reuse verification | `@aqsha/chat-core` | reuse | done | Ditambah workspace dep `@aqsha/svelte`; browser-safe (hanya `zod`; nol db/services/node). Dipakai apa adanya (stats-viz/deep-viz/index) — no rewrite. |

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
