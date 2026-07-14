# Phase 3 decision record — design system, theme, shell, layout

> Bagian dari **Phase 3** (§10 [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md)).
> Tanggal: 2026-07-14. Melanjutkan [`apps-svelte-phase2-decision-record.md`](apps-svelte-phase2-decision-record.md).
> Bahasa Indonesia; nama package/API/simbol tetap English (AGENTS.md).

Membangun kontrak visual + chrome yang diwarisi Phase 4+. **Bukan** fitur (marketing/blog = Phase 4;
onboarding/settings = Phase 5; thread/chat = Phase 6/7). Ledger: [`apps-svelte-parity-ledger.md`](apps-svelte-parity-ledger.md)
CSS-1, UIP-1..5, SHL-1..11 = **done** (kecuali CSS-2/link-preview/confirm-dialog — lihat §5).

---

## 1. Struktur yang dibangun (§5.1)

| Area | File | Catatan |
|---|---|---|
| Golden CSS | `src/styles/globals.css`, `src/app.css`, `static/fonts/*.woff2` | Port 1:1 `app/globals.css` + `@font-face`. app.css = Tailwind entry (`@import 'tailwindcss' + tw-animate + ./styles/globals.css`). |
| Icons | `src/lib/icons/index.ts` (+ `icons.completeness.spec.ts`) | Mirror penuh `@aqsha/ui/icons`. |
| Theme | `src/lib/theme/{context.svelte.ts,index.ts}`, `src/lib/components/layout/{ThemeProvider,ThemeMenuSub}.svelte` | mode-watcher seam. |
| Motion | `src/lib/motion/{context.svelte.ts,index.ts}`, `.../MotionProvider.svelte` | reduced-motion seam. |
| Panel layout | `src/lib/panel-surface.ts`, `src/lib/hooks/panel-inline.svelte.ts`, `.../{DetailSplitLayout,ResponsiveSidePanel,SidePanelFrame,PanelHeaderBar,PanelTabsHeader,PanelCardToolbar,PanelExpandButton,PanelOpenButton,PanelBarContent,PanelTitleLabel}.svelte`, `panel-expand.svelte.ts` | Shared chrome (§8.1); consumer-validated Phase 6/7. |
| Shell | `.../{AppShell,AppSidebar,NavUser,AppToaster,AppLoadingOverlay,OnboardingGate}.svelte`, `src/routes/app/+layout.{svelte,server.ts}`, `src/lib/sidebar-state.ts` (+spec) | — |
| Primitives ui/ | `src/lib/components/ui/**` (~30 komponen) | shadcn-svelte nova + Aqsha-align. |
| Root wiring | `src/routes/+layout.svelte` | Provider chain penuh. |
| Route stub | `src/routes/{onboarding,app/explore,app/settings}/+page.svelte` | Phase-3 scaffolding (target resolve untuk nav; diisi Phase 5/8). |

## 2. Keputusan terkunci

1. **Golden CSS = port 1:1 + font self-host, delta minimal terdokumentasi.** Semua token/prose/panel/composer/viz/
   shimmer/keycap/scrollbar/reduced-motion verbatim dari web. Delta SENGAJA: (a) `@import 'tailwindcss'`+tw-animate pindah
   ke `app.css` (globals = file kontrak murni); (b) import React-only DIBUANG (`shadcn/tailwind.css`, `@blocknote/react|shadcn`,
   `blocknote-aqsha.css` = Phase 10); (c) `@source` React node_modules DIBUANG (Svelte auto-scan `src/**`); (d) fonts self-host
   `@font-face` (variable woff2 dari `@fontsource(-variable)` devDeps, latin subset) — nama var `--font-*` + fallback DIPERTAHANKAN,
   `font-display:swap`. Selector `react-pdf`/`[data-streamdown]` DITAHAN verbatim (inert sampai Phase 6/9).
2. **Icon adapter = mirror penuh + completeness test parse SoT.** `$lib/icons` re-export ~130 nama Aqsha (Lucide-compat) → glyph
   Hugeicons IDENTIK web (`icons.completeness.spec.ts` mem-PARSE `packages/ui/src/icons.tsx` → auto-track SoT, bukan hard-copy).
   API Svelte: glyph = DATA, render `<Icon icon={CheckIcon} />` (`Icon` = `HugeiconsIcon`) — beda dari React `<CheckIcon/>` tapi idiom
   Hugeicons Svelte + dipakai komponen vendored. `getArtifactTypeIcon` (pure) dibawa; `ArtifactTypeIcon` component = Phase 9.
3. **Theme anti-flash = ModeWatcher SSR head-inject (bukan app.html manual).** `<ModeWatcher>` (default `disableHeadScriptInjection=false`)
   meng-SSR script `setInitialMode` ke `<svelte:head>` yang set `.dark`+`color-scheme` sebelum paint dari key `mode-watcher-mode`
   — PADANAN PERSIS script inline app.html next-themes, tapi auto-sync ke storage key mode-watcher (pilih mekanisme library agar tak
   desync). Terverifikasi: HTML `/` memuat `setInitialMode`. Seam `ThemeState` (mode/preference/setMode/toggle/reset) via context untuk
   toggle appearance Phase 5. mode-watcher module-state = browser-local (localStorage), BUKAN request-scoped → tak bocor SSR (pengecualian §3.5 tersanksi).
4. **Primitives = shadcn-svelte nova + Aqsha-align, bukan tulis-ulang.** Web & svelte sama-sama nova → banyak class sudah cocok;
   port = fix delta nyata + samakan `data-*`/ARIA/portal. Batch 1 (base) + 2 (overlay) + 3 (menu) + 4 (structural) + 5 (misc).
   Delta besar: button keycap `[--btn-face]` + `data-variant/size`; badge `rounded-4xl`+ghost/link; card `font-heading` title;
   dialog/sheet title `font-heading`; sidebar +`transparent`/`flush` variant; dropdown/context/select/command/tabs generated =
   DEFAULT bukan nova → rewrite + fix glyph ikon; **tabs `data-active`→`data-[state=active]` (bug: active tak apply)**. Spinner→FlickerSpinner.
5. **Shell = CHROME Phase 3; data-list = Phase 7/9.** `AppSidebar` port header (nav Home/Jelajahi, ⌘K palette, collapse, mobile Sheet)
   + footer NavUser; section thread/workspace + row menu (`ThreadActionsMenu`/`CreateWorkspacePopover`) DITUNDA (empty-state placeholder).
   Provider chain `+layout.svelte` = urut web PERSIS. Cookie `sidebar_state` dibaca `+layout.server.ts` (pure codec `isSidebarOpenFromCookie` + contract test).
6. **Motion = transition Svelte, bukan framer.** Tak ada `LazyMotion` runtime; `MotionProvider` cuma publish seam reduced-motion
   (`svelte/motion` `prefersReducedMotion`) + jaga urutan provider. AppLoadingOverlay pakai `{#key}`+`fly` (padanan AnimatePresence mode=wait).

## 3. Gotcha & temuan reusable (untuk fase berikut)

- **`**/*` (glob) di block comment = penutup `*/` dini** (bake ulang temuan Phase 2). `src/**/*.svelte` di komentar CSS menutup
  `/* */` di `**/` → sisanya di-parse CSS → CssSyntaxError. Hindari `*/` (termasuk `**/`) di komentar `.css`/`.ts`.
- **Svelte `<style>` + `@keyframes -global-NAME` yang HANYA direferensi inline `style="animation:…"` → parse error `<script> was left open`.**
  Solusi: taruh CSS FlickerSpinner (rules + 20 keyframes) GLOBAL di golden CSS (unscoped), komponen render SVG saja. (Web = `<style>` anak SVG.)
- **`IconSvgElement`/`HugeiconsProps` di-export `@hugeicons/svelte`, BUKAN `@hugeicons/core-free-icons`.**
- **Trigger-width var bits-ui = `--bits-floating-anchor-width`** (bukan radix `--radix-dropdown-menu-trigger-width`). Padanan `w-(--radix-*-trigger-width)` web.
- **shadcn-svelte `add` bisa menaruh varian DEFAULT (bukan style `components.json`).** dropdown/context/select/command/tabs ter-generate
  default → butuh align manual ke nova. Selalu diff generated vs web.
- **`vaul-svelte` stable `0.3.2` = Svelte 4 (RootProps/ref hilang).** Drawer shadcn-svelte butuh **`1.0.0-next.7`** (Svelte 5). Pin exact.
- **TanStack `createQuery` v6 = objek reaktif runes** (`status.data`/`status.isLoading` LANGSUNG, tanpa `$store`). Argumen WAJIB fungsi (§3.6).
- **`resolve()` (`$app/paths`) type-safe ke route yang ADA.** Link ke route masa depan (`/app/explore` P8, `/app/settings` P5, `/onboarding` P5)
  butuh route stub agar `resolve` compile + lint `no-navigation-without-resolve` lolos. Dibuat stub minimal (diganti fase pemiliknya).
- **`no-navigation-without-resolve` flag href VARIABEL** (bukan cuma literal) → `resolve()` harus INLINE di `href=`/`goto()`, bukan lewat variabel/helper.
- **SidebarProvider shadcn-svelte sudah bungkus `Tooltip.Provider`** (delayDuration 0) + tulis cookie `sidebar_state` + Cmd+B. Konstanta
  (cookie/width/shortcut) kebetulan IDENTIK web.
- **svelte-sonner `toastOptions.classes` (bukan `classNames`)**; support `gap`/`offset`/`visibleToasts`/`expand`/`closeButton` = padanan sonner.

## 4. Gate Phase 3 (§10) — HIJAU

| Cek | Perintah / bukti | Hasil |
|---|---|---|
| Typecheck | `bun run --filter @aqsha/svelte typecheck` | **0 errors / 0 warnings** |
| Lint | `bun run --filter @aqsha/svelte lint` | Prettier clean + ESLint 0 |
| Test | `bun run --filter @aqsha/svelte test` | **16 files / 84 tests pass** |
| Build | `bun run --filter @aqsha/svelte build` | OK (adapter-node) |
| adapter-node boot | `node build` + curl | `/` **200**; `/app`→**303**→`/sign-in` |
| Anti-flash | grep HTML `/` | **`setInitialMode` + `.dark` di `<head>`** (pre-paint) |
| Boundary client | grep `src/` + `.svelte-kit/output/client` | **no `@lucide/svelte`/React/Radix-React di src; no lucide-react/@radix-ui/react di client bundle** |
| Fonts | `build/client/fonts/` | 4 woff2 ter-emit (Inter/Instrument Serif/JetBrains Mono/Caveat) |

Contract tests baru correctness-critical: `icons.completeness.spec.ts` (icon-map mirror SoT, >120 glyph identik),
`sidebar-state.spec.ts` (cookie codec round-trip), `button-variants.spec.ts` (keycap/press-choreography mapping). `cn` = Phase 1 (`utils.spec.ts`).

## 5. Yang TIDAK dikerjakan / ditunda (di luar Phase 3 penuh)

- **CSS-2 `blocknote-aqsha.css`** — disalin + di-wire dengan editor BlockNote di **Phase 10** (mereferensi class `@blocknote/*`).
- **`link-preview`** (UIP-4) → **Phase 6**: komposit HoverCard, butuh consumer pill sitasi + API trigger `child`-snippet (bukan shell-critical).
- **`confirm-dialog`** (UIP-5) = **N/A**: tak ada source ui/ berdiri sendiri di web (penghapusan pakai Dialog).
- **Panel layout containers** (`DetailSplitLayout`/`ResponsiveSidePanel`) di-port sebagai chrome, **consumer-validated Phase 6/7** (belum ada
  surface thread/workspace). `ResponsiveSidePanel` freeze-while-closing disederhanakan ke presence sampai consumer-nya ada.
- **Section thread/workspace sidebar** (rows/collapse/ThreadActionsMenu/CreateWorkspacePopover) = **Phase 7/9** (empty-state placeholder sekarang).
- **Screenshot visual shell** = **owner-manual** (§9.3 eyeball, non-blocking): shell `/app` auth-gated → butuh sesi login yang tak tersedia
  di context otomatis. Verifikasi fungsional (boot/routing/CSS-serve/anti-flash) HIJAU; eyeball 390/768/1280/1536 + light/dark + panel expanded/collapsed = OWNER.
- **NavUser "Pengaturan"** sementara → `/app/settings` (stub); Phase 5 kembalikan `/app/settings/overview` web.
- **Upload source-map Sentry** = OPS (Phase 2).
