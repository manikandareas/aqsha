# Phase 9 decision record — Workspaces, library, artifacts, citations, PDF

> Bagian dari **Phase 9** (§10 [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md)).
> Tanggal: 2026-07-15. Melanjutkan Phase 1–8 (decision records + ledger). Bahasa Indonesia; nama
> package/API/simbol tetap English (AGENTS.md). Ledger: [`apps-svelte-parity-ledger.md`](apps-svelte-parity-ledger.md)
> WSP-1..10 + ART-1..6 = **done** (kecuali BlockNote editable = Phase 10, di-placeholder read-only).

Lapisan LIBRARY/CITATIONS di atas engine chat Phase 6/7 + explore Phase 8: workspace CRUD + board
folder-satu-level (grid + marquee + DnD + upload queue) + artifact reader read-only (Markdown/Mermaid/
PDF/URL/code) + Citation Manager penuh (list/filter/tags/CRUD/detail/import/export/provider/duplikat/
render) + workspace chat + citation panel (URL-state `?panel=chat|cite|cite:<id>`). Ditambah **wiring
`AppSidebar` PENUH** (addendum 2026-07-15): pohon workspace + grup thread pinned/recent/older +
`ThreadActionsMenu` + `CreateWorkspacePopover`. **BUKAN** BlockNote editor (Phase 10 — markdown =
placeholder read-only).

---

## 1. Yang dibangun (peta file, di `apps/svelte/src`)

| Area | File | Sumber web |
|---|---|---|
| Pure models (WSP-3/5/6/7/8, ART-4, editor) | `lib/features/workspaces/utils/{workspace-library-model,workspace-marquee-selection,workspace-file-upload,artifact-editor-model,paper-metadata-model,workspace-panel-model}.ts` (+ `.spec.ts`), `components/workspace-upload-toast-model.ts`, `emoji-choices.ts`, `utils/workspace-emoji.ts`, `lib/{context-selection,artifact-upload-limits,artifact-upload-policy,library-grid}.ts`; `lib/features/citations/export-model.ts` (+spec); `lib/features/artifacts/utils/citation.ts` (+spec) | idem web `utils/*`, `lib/*` |
| Data/API | `lib/features/workspaces/{api.ts,api/use-workspaces-data.ts}`, `lib/features/artifacts/api.ts`, `lib/features/citations/api.ts` | idem web `api.ts` |
| Types | `lib/features/{workspaces,artifacts,citations}/types.ts` | idem |
| Workspace CRUD (WSP-1) | `lib/features/workspaces/pages/WorkspacesIndexPage.svelte`, `components/{NameDialog,NameDialogContent,CreateWorkspacePopover,WorkspaceEmojiPickerContent}.svelte` | `pages/workspaces-index-page.tsx`, `components/{workspace-dialogs,create-workspace-popover,workspace-emoji-picker-content}.tsx` |
| Board + folders + search/sort (WSP-2/3) | `components/{WorkspaceDetailClient,WorkspaceLibrarySurface,WorkspaceLibraryBoard,WorkspaceBoardToolbar,WorkspaceLibraryControls,WorkspaceLibraryEmpty,WorkspaceLibraryFootnote}.svelte`, `components/{WorkspaceEmojiPopover,WorkspaceTitlePopover}.svelte`, `hooks/use-workspace-folder-nav.svelte.ts` | `components/{workspace-detail-client,workspace-library-surface,workspace-library-board,workspace-board-toolbar,workspace-library-controls,workspace-library-empty,workspace-library-footnote}.tsx`, `hooks/use-workspace-folder-nav.ts` |
| Selection/marquee/context-menu/DnD (WSP-4/5) | `components/WorkspaceLibraryGrid.svelte` (marquee + native DnD + tiles inline), `components/{FolderContextMenuContent,ArtifactContextMenuContent,MoveToWorkspaceContextSubmenu}.svelte`, `lib/components/{LibraryArtifactCard,LibraryCardFrame,LibraryDragOverlayCard,artifact-presentation}.{svelte,ts}`, `utils/workspace-marquee-selection.ts` | `components/{workspace-library-grid,workspace-library-context-menus,library-*}.tsx`, `hooks/use-library-item-click.ts` |
| Upload queue + toast (WSP-6/7) | `components/{WorkspaceUploadToast,WorkspaceUploadToastView,WorkspaceUploadToastRow,WorkspaceUploadToastStatusIcon}.svelte`, `hooks/use-file-dropzone.svelte.ts`, `utils/workspace-file-upload.ts` | `components/workspace-upload-toast*.tsx`, `hooks/use-file-dropzone.ts` |
| Dialog stack (WSP-4) | `components/{WorkspaceLibraryDialogsStack,AddItemDialog,AddItemDialogContent}.svelte`, `hooks/use-workspace-library-dialogs.svelte.ts` | `components/workspace-library-dialogs-stack.tsx`, `hooks/use-workspace-library-dialogs.ts` |
| Artifact reader read-only (WSP-9, ART-1/6) | `components/{ArtifactReaderPageShell,ArtifactDetailView,ArtifactDetailHeader,ArtifactDetailSidebar,ArtifactMetadataPopover,MarkdownArtifactInfo,MarkdownArtifactDetails,ArtifactRenderPanels,ArtifactHeaderActions,ArtifactMissingState,ArtifactPanelActions,ArtifactDeleteDialog,DocumentTitleEditor,MermaidArtifactViewer}.svelte`, `lib/features/threads/lib/artifact-download.ts` (extend) | `components/{artifact-reader-page-shell,artifact-detail-view,artifact-detail-header,artifact-detail-sidebar,artifact-render-panels,mermaid-artifact-viewer,artifact-delete-dialog,document-title-editor}.tsx` |
| PDF viewer (WSP-10) | `components/{PdfArtifactViewer,PdfPageCanvas}.svelte` | `components/pdf-artifact-viewer.tsx` (react-pdf → pdfjs-dist langsung) |
| Citation Manager (ART-2/3/4/5/6) | `lib/features/citations/components/{CitationsPanel,CitationDetailView,CitationFormDialog,CitationFormContent,CitationDoiDialog,CitationDoiContent,CitationDuplicatesDialog,CitationImportWizard,CitationImportWizardContent,CitationImportPreviewStep,ProviderSyncWizard,ProviderSyncWizardContent,ProviderSyncFlow,CitationExportMenu,CitationSettingsDialog,CitationEmptyState}.svelte`, `lib/components/citation/CopyCitationButton.svelte` | `features/citations/components/*`, `components/citation/copy-citation-button.tsx` |
| Workspace chat + citation panel (WSP-8, ART-2) | `components/{WorkspaceSidePanel,workspace-panel-context.svelte.ts}.svelte` (chat tab reuse Explore `ExploreThreadChat`) | `components/{workspace-side-panel,workspace-chat-side-panel,workspace-panel-context}.tsx` |
| AppSidebar PENUH (addendum) | `lib/components/layout/AppSidebar.svelte` (rewrite dari placeholder Phase-3), `lib/components/layout/sidebar/{SidebarSection,ThreadArchiveGroup,persistent-collapse.svelte.ts}.svelte`, `lib/features/thread-experience/components/ThreadActionsMenu.svelte` | `components/{app-sidebar,app-shell}.tsx`, `features/thread-experience/components/thread-actions-menu.tsx` |
| Route | `routes/app/(product)/workspaces/{+page.svelte,[workspaceId]/+page.svelte,[workspaceId]/artifacts/[artifactId]/+page.svelte}` | `app/app/(product)/workspaces/**` |

## 2. Keputusan terkunci

### 2.1 DnD library — **native HTML5, BUKAN `svelte-dnd-action`** (divergence terdokumentasi)

Plan §2/§6 menyebut `svelte-dnd-action` untuk library DnD. TAPI interaksi web = **drag kartu artifact ke
TILE folder** (dnd-kit `useDraggable` kartu + `useDroppable` folder), bukan reorder/transfer list
(model natif `svelte-dnd-action`). `svelte-dnd-action` = zona-list; "drop ke tile folder non-list" tak
cocok. Diputuskan: **native HTML5 drag** — kartu `draggable`, `dragstart` lapor `grabbedId` ke board
(board me-resolve set drag multi-seleksi + `dragImage` default browser), tile folder = drop target
(`dragover.preventDefault` + `drop`). Board pegang `dragArtifactIds`/`overFolderId` `$state` →
`getFolderDropState(folderId)` = highlight (`active`=ada drag, `isOver`=folder ini). **Konsekuensi
(dicatat):** overlay drag "fan cascade" kustom (`LibraryDragOverlayCard`) + drag touch/keyboard TIDAK
dibawa (native HTML5 = mouse + gambar drag default). Mouse drag-ke-folder + marquee = parity. Grid dari
subagent me-nyediakan seam `getFolderDropState`/`draggingArtifactIds`/`data-*-tile-id`; DnD di-wire di
grid tiles langsung (bukan attachment). `svelte-dnd-action` tetap di lockfile (diinstall) tapi TAK
dipakai — bisa dihapus atau dipakai untuk reorder masa depan.

### 2.2 PDF — **`pdfjs-dist` langsung, BUKAN EmbedPDF** (fallback §13 risk register)

Plan §2/§6 menyarankan `@embedpdf/svelte-pdf-viewer`. Web pakai `react-pdf` (= wrapper pdfjs). EmbedPDF =
dep baru + potensi UI berbeda (flagged dealbreaker). Diputuskan: **pdfjs-dist langsung** (konsisten
`PdfThumb` Phase 8, versi SAMA `5.4.296`, nol dep baru, kontrol penuh toolbar shadcn-svelte) — canvas
per halaman (lazy IntersectionObserver + eager 2 pertama), zoom (re-render skala), page nav (scroll),
fullscreen, search full-dokumen (ekstrak `getTextContent` → scroll ke halaman match). Browser-only
(dynamic import di `$effect` + guard `browser`, worker `new URL(..., import.meta.url)`). **Divergence
(dicatat):** layer teks-seleksi react-pdf + annotation-link natif + highlight in-text sitasi/search TAK
di-port (butuh pdf.js `TextLayer`/`AnnotationLayer` + CSS-nya). Search MENEMUKAN + scroll ke halaman;
seleksi/link overlay ditunda. Parity untuk zoom/page/find/fullscreen/theme (inti WSP-10). Ini fallback
"direct PDF.js adapter" yang disebut risk register §13.

### 2.3 Panel URL codec — pure + `page.url`/`goto`, byte-equivalent (TIRU THX-6/EXP-1)

`workspace-panel-model.ts` PURE (`serialize/parseWorkspacePanelMode`/`workspacePanelTabOf`) di-wire lewat
`WorkspacePanelController` (class `$state`-less, `mode` getter baca `page.url.searchParams.get('panel')`
reaktif + `goto(url, {replaceState})`). Parser `nuqs` web (`parseAsWorkspacePanelMode`) DIHAPUS. Codec:
`chat`→tab Chat, `cite`→tab Sitasi (list), `cite:<id>`→detail (split `:` PERTAMA → id ber-`:` utuh),
param absen→tertutup. `setOpen(true)` restore mode terakhir (default chat, `#lastOpen`). Contract test
`workspace-panel-model.spec.ts` (round-trip + edge). **Verified browser:** `?panel=cite` buka list,
klik sitasi → `?panel=cite:<uuid>` (`%3A`) buka detail + render IEEE — deep-link byte-equivalent.

### 2.4 Composite data hook → **getter-object reaktif** (bukan snapshot)

Web `use-workspaces-data.ts` = React hooks yang recompute per-render. Svelte: fungsi mengembalikan
objek dengan **getter properties** (`get workspaces()`/`get threads()`/`get artifacts()`) yang membaca
ulang state svelte-query reaktif (§3.5/§3.6) — akses `.workspaces` di scope reaktif re-evaluasi. Mutasi =
fungsi async biasa (`.mutateAsync`). Reactive scalar input (`workspaceId`/`artifactId`) mengalir sebagai
**getter** `() => id` ke leaf hooks (idiom svelte-query, TIRU threads/api.ts THX-1). Argumen `create*`
WAJIB fungsi (`createQuery(() => ({...}))`) — gotcha porting utama.

### 2.5 AppSidebar PENUH (addendum) — fetch DI SIDEBAR, bukan prop-threading

Web `AppShell` fetch `useWorkspaceIndexData()` lalu oper `workspaces`+`threads` ke `<AppSidebar>`.
Svelte: `AppSidebar` panggil `useWorkspaceIndexData()` LANGSUNG (getter reaktif) + turunkan selection dari
`page.params.{threadId,workspaceId}` — hindari prop-threading yang mematikan reaktivitas getter. Grup
thread: pinned (`pinnedAt` DESC) + recent (`bucket !== 'older'`) + `ThreadArchiveGroup` "More" (older,
default collapsed, paksa buka bila thread aktif). `SidebarSection` collapsible via
`createPersistentCollapse` (localStorage + custom event, mirror `useSyncExternalStore` web). Per-row
`ThreadActionsMenu` (variant `sidebar-row`: pin/delete) + `CreateWorkspacePopover` (hover-open,
`customAnchor` bits-ui). **Verified browser:** pohon workspace (E2E Citation Test/Indonesia Negara Maju/
School/Research + emoji) + grup Disematkan/recent/More-25 + NavUser.

### 2.6 Markdown/dokumen = placeholder read-only (BlockNote = Phase 10)

`artifact-editor-model.ts` (autosave reducer/plainText) di-port + tested (dipakai Phase 10). Artifact
tipe `markdown` di reader: page variant = kartu placeholder ("editor dokumen hadir di fase berikutnya") +
doc read-only via `Response` (svelte-streamdown); panel variant = prose read-only. Editor BlockNote
(loader/citation-schema/xl-ai/autosave-live) TIDAK di-port (Phase 10, BLK-1..7). Code artifact = fenced
`Response` (native Shiki + copy, supersede React `CodeBlock` — library-first §3.3).

### 2.7 Paralelisasi port leaf via 3 subagent (precedent Phase 7 §2.5)

3 cluster display-leaf di-port paralel oleh subagent (Citation Manager 17 file; artifact renderers 17
file; library cards+toolbar+controls+context-menu+upload-toast 22 file), dengan brief konvensi (runes,
`$lib/icons` glyph, shadcn-svelte, getter-hook API, gotcha DR). Spine coupled (board DnD/marquee,
surface, detail-client, panel controller, sidebar, PDF viewer) di-port manual. Integrasi: typecheck 0/0
saat disatukan (setelah 4 fix tipe API + narrowing). Grid subagent menyediakan seam DnD bersih
(`getFolderDropState`/`draggingArtifactIds`/`data-*-tile-id`) → native DnD di-wire di atasnya (§2.1).

## 3. Gotcha & temuan reusable

- **svelte-query `onSuccess` input annotation = TIPE PENUH mutationFn**: anotasi `onSuccess: (_d, input:
  {id})` parsial → svelte-query infer `TVariables = {id}` → konflik `mutationFn` (`{id, name}`). Anotasi
  HARUS tipe penuh input (atau lepas anotasi). Beda React Query (mutationFn drive tipe).
- **Infinite query page type**: `unwrap(...)` Eden bisa infer longgar → `data.pages` element type salah
  → flatten gagal. Cast queryFn `as WorkspaceListPage`/`ArtifactListPage` + `getNextPageParam(last:
  PageType)` (TIRU threads/api.ts).
- **Getter-object narrowing di template**: `{:else if data.workspace}` lalu `data.workspace.name` → TS
  "possibly null" (getter re-baca). Pakai `const workspace = $derived(data.workspace)` lalu `{:else if
  workspace}` → `workspace.name` narrow.
- **`svelte-ignore` TAK dukung `-- reason`** (beda eslint-disable): `<!-- svelte-ignore rule -- alasan
  -->` → svelte parse tiap KATA alasan sebagai rule tambahan → `no-unused-svelte-ignore` error massal.
  Reason = comment TERPISAH di atas svelte-ignore.
- **`a11y_autofocus` TIDAK fire di komponen** (`<Input autofocus>`) — hanya elemen mentah (`<input
  autofocus>`) → svelte-ignore di komponen = unused. PDF search `<input autofocus>` mentah = svelte-ignore
  VALID.
- **eslint override glob mematikan disable inline**: subagent tambah `no-navigation-without-resolve: off`
  utk `features/workspaces/**`+`features/citations/**` → `eslint-disable-next-line
  svelte/no-navigation-without-resolve` inline jadi UNUSED (auto-fix `--fix`).
- **Mount-on-open reset draft**: dialog form (`NameDialog`/`AddItemDialog`/`CitationFormDialog`) → child
  content di dalam `{#if open}` (+ `{#key initialName}`) supaya draft `$state` seed segar tiap buka
  (padanan web `key=` remount). `$state(untrack(() => initialName))` = seed sekali per mount.
- **Native DnD `draggable` di tile**: event delegation via attachment tak cukup (native `dragstart`
  butuh atribut `draggable` di sumber) → set `draggable` + handler LANGSUNG di snippet tile.
- **`WorkspaceUploadToast` = komponen (bukan hook)**: expose `enqueue(files, folderId)` via `bind:this`
  + `isUploadActive` `$bindable` (render `toast.custom` persisten sonner id tetap).
- **Clerk token cold-load — FIXED**: hard-reload rute authed dalam (mis. `/artifacts/[id]`) memicu query
  workspace SEBELUM clerk-js load → 401 tokenless → data kosong sesaat (temuan a Phase 1/2). Threads/api
  sudah gate `enabled: () => clerkLoaded && userId`; hook workspace/artifact BELUM. **Fix:** tambah param
  `enabled` getter di `useWorkspacesList`/`useWorkspace`/`useFolders`/`useArtifacts`/`useArtifact`/
  `useArtifactRender`; composite hooks (`useWorkspaceIndexData`/`useWorkspaceLibraryData`/
  `useArtifactDetailData`) pass `() => auth.isSignedIn` (= isLoaded && userId). **Browser-verified:** hard-
  reload `/artifacts/[id]` kini load penuh (sidebar + doc render), tak lagi kosong-sesaat.

## 4. Library gate (§6.1)

| Package | Versi (pin exact) | License | Svelte 5 / SSR | Catatan |
|---|---|---|---|---|
| `mermaid` | `11.16.0` (dipin `^11.15.0`) | MIT | Framework-agnostik; **browser-only** → `await import('mermaid')` di `{@attach}` + guard `browser`; `mermaid.render(id, source)` → innerHTML | Dipakai `MermaidArtifactViewer` (artifact tipe `mermaid`). SUDAH transitif via svelte-streamdown; dipin langsung utk viewer standalone. `securityLevel:'strict'`. |
| `svelte-dnd-action` | `0.9.74` (dipin `^0.9.61`) | MIT | Svelte 5 native | **DIINSTALL tapi TAK DIPAKAI** (§2.1) — native HTML5 DnD dipilih utk drag-kartu-ke-folder. Simpan utk reorder masa depan / hapus. |
| `pdfjs-dist` | `5.4.296` | Apache-2.0 | Browser-only (DOMMatrix) → dynamic import + guard | Versi = SAMA `PdfThumb` Phase 8 + `apps/web` react-pdf → nol desync worker. Viewer penuh (§2.2). EmbedPDF TIDAK dipakai. |

Assets baru di `static/`: `whimsical-floating-paper.png` (CreateWorkspacePopover; disalin dari `apps/web/public`).

## 5. Gate Phase 9 (§10) — HIJAU + browser-verified

| Cek | Perintah / bukti | Hasil |
|---|---|---|
| Typecheck | `bun run check` (svelte-check) | **0 errors / 0 warnings** (7338 files) |
| Lint | `bun run lint` (prettier + eslint) | Prettier clean + ESLint 0 |
| Test | `bun run test` (server + client Chromium) | **294 passed / 46 files** (+50 Phase-9 pure/kontrak) |
| Build | `bun run build` | OK (adapter-node; pdf.worker + mermaid chunk di-emit) |
| Contract: citation export bytes | `export-model.spec.ts` | bibtex/ris string + csl-json stringify (regresi unduh) + filename/mime per-format |
| Contract: marquee | `workspace-marquee-selection.spec.ts` | normalize/intersect/add/toggle/cap MAX_CONTEXT_ARTIFACTS |
| Contract: library model | `workspace-library-model.spec.ts` | group/folder-view/move-target/filter/sort/search |
| Contract: upload state machine | `workspace-file-upload.spec.ts` | max-20/conc-3/processing→complete/continue-on-fail/retry-failed/MIME |
| Contract: panel URL codec | `workspace-panel-model.spec.ts` | round-trip chat/cite/cite:id + first-colon + closed |
| Contract: artifact-editor + paper-metadata + citation format | `.spec.ts` | autosave reducer + metadata-view + bibtex/markdown/plain |
| No React/Radix/Lucide/db | grep client bundle | nol (client bundle bersih; nol `@aqsha/db`/services) |
| **Browser (owner-session, localhost:5173)** | screenshot | **AppSidebar pohon workspace+thread pinned/recent/More; `/app/workspaces` 4 aktif; board empty+content (kartu+footnote); `?panel=cite` list 16 sitasi (author/venue/status-dot/tag); `?panel=cite:<id>` detail + render IEEE + metadata; `/artifacts/[id]` reader penuh (breadcrumb + markdown read-only placeholder + doc render `[1]` + bibliography); Clerk cold-load gate verified** |

## 6. Yang TIDAK dikerjakan (di luar Phase 9) + follow-up

- **BlockNote editor (Phase 10, BLK-1..7)**: markdown/dokumen = placeholder read-only (§2.6). Model
  `artifact-editor-model` + `DocumentTitleEditor` di-port dorman.
- **PDF text-layer + annotation-link + highlight in-text** (§2.2): pdfjs `TextLayer`/`AnnotationLayer`
  + CSS ditunda; search scroll-ke-halaman jalan.
- **DnD touch/keyboard + fan-cascade overlay** (§2.1): native HTML5 = mouse only.
- **Owner E2E live penuh**: create-workspace flow, upload file (butuh MinIO), DnD move, artifact PDF
  render (butuh artifact PDF), provider sync (Mendeley/Zotero), workspace chat send (butuh agent :4111).
  Backend :3001 UP (workspace/citation terverifikasi live); agent :4111 DOWN sesi ini (chat/streaming =
  owner E2E, konsisten Phase 7/8).
- **`svelte-dnd-action` cleanup**: diinstall tak dipakai — hapus atau pakai untuk reorder.
