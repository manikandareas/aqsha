# Feature manifest — `apps/web/features/**` (baseline `ec04389`)

Inventaris per feature area. Kolom **Pure logic** = modul `.ts` (non-`.tsx`) yang diport **sebelum** view (§15 #7); ★ = correctness-critical (punya/butuh fixture + contract test). `use-*.ts` = React hook (bukan pure; port bersama view layer). Nama folder target mengikuti web (§5.1) agar diff source→target mudah.

Jumlah file (baseline): `ts`=modul non-test, `tsx`=komponen React, `tests`=`*.test.ts`.

| Feature | Phase | ts/tsx/tests | §8 ledger |
|---|---|---|---|
| marketing | 4 | 1/13/0 | §8.2 |
| blog | 4 | 4/4/0 | §8.2 |
| changelog | 4 | 4/5/0 | §8.2 |
| onboarding | 5 | 2/5/0 | §8.3 |
| settings | 5 | 6/15/0 | §8.4 |
| thread-experience | 7 | 6/27/1 | §8.5 |
| threads | 6–7 | 19/39/0 | §8.5 |
| explore | 8 | 2/7/0 | §8.6 |
| discovery | 8 | 7/10/0 | §8.6 |
| workspaces | 9–10 | 18/38/6 | §8.7 |
| artifacts | 9 | 3/1/1 | §8.8 |
| citations | 9 | 3/10/1 | §8.8 |

Shared di luar `features/` — lihat [import-manifest](import-manifest.md) & [route-manifest](route-manifest.md): `apps/web/lib/**` (Phase 2 platform + pure utils), `apps/web/components/**` (Phase 3 shell + `ui/` + `ai-elements/`).

---

## marketing (Phase 4)
- **Page anchor:** `components/landing-page.tsx`
- **Pure logic:** `faq-data.ts`
- **Boundary (§4.1):** `components/for-you-section.tsx`, `components/structured-data.tsx` impor `@aqsha/services/plan` → **DILARANG** di bundle Svelte; ganti shared pure-data/payload API.

## blog (Phase 4)
- **Pure logic:** `lib/format.ts`, `lib/layout.ts`, `lib/posts.ts`, `types.ts`
- Sumber konten: `apps/web/content-collections.ts` → `@content-collections/vite` + `mdsvex`.

## changelog (Phase 4)
- **Pure logic:** `lib/categories.ts`, `lib/entries.ts`, `lib/layout.ts`, `types.ts`
- Gotcha (memory): export `allChangelogs` (plural); `/changelog(.*)` wajib public.

## onboarding (Phase 5)
- **Page anchor:** `pages/onboarding-page.tsx`
- **Pure logic:** `lib/onboarding-options.ts`, `lib/use-onboarding-flow.ts` (hook — state machine steps).

## settings (Phase 5)
- **Page anchors:** `components/overview-page.tsx`, `components/account-page.tsx`, `appearance-page.tsx`, `components/personalization-page.tsx`, `components/integrations-page.tsx`, `security-page.tsx`, `components/usage-billing-page.tsx`
- **Pure logic:** `api.ts`, `lib/billing-derived.ts` ★, `lib/integrations.ts`, `lib/settings-menu.ts`, `lib/types.ts`, `security/clerk-error.ts`
- Dependensi: QR 2FA (`qrcode.react`→`@svelte-put/qr`), Clerk password/2FA/reverification/sessions, Mendeley/Zotero connect.

## thread-experience (Phase 7)
- **Pure logic:** `utils/thread-experience-model.ts` ★ (test ada), `utils/thread-panel-model.ts` ★, `api/use-thread-experience-data.ts` (hook), `components/component-types.ts`, `types/index.ts`, `index.ts`
- **Test:** `utils/thread-experience-model.test.ts`

## threads (Phase 6 pure + 7 UI)
- **Pure logic (correctness-critical, port dulu):**
  - `lib/mastra-timeline.ts` ★ (timeline reducer), `lib/timeline-types.ts`, `lib/mastra-client.ts`
  - `lib/citation-markdown.ts` ★, `lib/stats-markdown.ts` ★, `lib/viz-markdown.ts` ★ (renderer transforms)
  - `lib/attachment-buckets.ts`, `lib/token-pill.ts`, `lib/composer-inline-editor.ts`, `lib/source-card.ts`, `lib/scroll-to-message.ts`
  - `lib/stats-next-steps.ts`, `lib/stats-run-detail.ts`, `lib/thread-panel-data.ts`
  - `components/deep-viz/labels.ts`, `components/stats-viz/verdict-meta.ts`, `api.ts`, `types.ts`
  - hooks: `lib/use-mastra-agent.ts`
- **Viz komponen:** `components/deep-viz/**`, `components/stats-viz/**`
- Reuse: `@aqsha/chat-core` (framework-agnostic). Streaming raw Mastra = dealbreaker gate Phase 1.

## explore (Phase 8)
- **Page anchor:** `components/explore-page.tsx`
- **Pure logic:** `api.ts`, `types.ts`

## discovery (Phase 8)
- **Pure logic:** `api.ts`, `ask-astra.ts` ★, `format.ts`, `house-ads.ts`, `model.ts` ★, `nav.ts`, `types.ts`
- Paper/news reader + related + PDF thumb + Ask Astra context.

## workspaces (Phase 9 lib/UI + Phase 10 BlockNote)
- **Page anchor:** `pages/workspaces-index-page.tsx`
- **Pure logic (correctness-critical):**
  - `utils/workspace-file-upload.ts` ★ (upload state machine, test ada), `components/workspace-upload-toast-model.ts` ★
  - `utils/workspace-marquee-selection.ts` ★ (test ada), `utils/workspace-library-model.ts` ★ (test ada), `utils/workspace-panel-model.ts` ★ (test ada)
  - `utils/artifact-editor-model.ts` ★ (BlockNote round-trip, test ada — Phase 10), `utils/paper-metadata-model.ts` ★ (test ada)
  - `components/blocknote-citation-store.ts` (Phase 10), `utils/workspace-emoji.ts`, `emoji-choices.ts`, `types.ts`, `api.ts`
  - hooks: `hooks/use-file-dropzone.ts`, `hooks/use-workspace-folder-nav.ts`, `hooks/use-workspace-library-dialogs.ts`, `hooks/use-library-item-click.ts`, `use-library-item-click.ts`, `api/use-workspaces-data.ts`
- **Tests (6):** `workspace-file-upload.test.ts`, `workspace-marquee-selection.test.ts`, `workspace-library-model.test.ts`, `utils/workspace-panel-model.test.ts`, `artifact-editor-model.test.ts`, `paper-metadata-model.test.ts`
- DnD: `@dnd-kit/core`→`svelte-dnd-action`. PDF: EmbedPDF. BlockNote = Phase 10 terakhir.
- Shared helpers di `lib/`: `library-grid.ts`, `artifact-upload-limits.ts`, `artifact-upload-policy.ts`, `panel-surface.ts`, `artifact-download.ts`.

## artifacts (Phase 9)
- **Pure logic:** `api.ts`, `types.ts`, `utils/citation.ts` ★ (test ada)
- **Test:** `utils/citation.test.ts`

## citations (Phase 9)
- **Pure logic:** `api.ts`, `export-model.ts` ★ (byte export sitasi, test ada), `types.ts`
- **Test:** `export-model.test.ts`
- Citation Manager: BibTeX/RIS/CSL JSON export byte-exact; `.bib`/`.ris` preview→commit; provider sync.
