# Rencana detail: Workspace Citation Manager + Integrasi (Mendeley/Zotero)

> Status: **FASE 0–4 IMPLEMENTED** (2026-07-11, branch `feat/citation-manager`, uncommitted) — Fase 5–6 (integrasi provider) masih plan. Feature flag `workspace_citations` **DIHAPUS** (Citation Manager kini default aktif untuk semua user). Revisi 2026-07-11 (menggantikan draft 2026-07-10).
> Bahasa: Indonesia (istilah teknis tetap English), sesuai `AGENTS.md`.

## Progress implementasi (2026-07-11)

| Fase | Status | Catatan |
|---|---|---|
| 0 — Spike + ADR | ✅ selesai | ADR di `docs/adr-citation-csl-engine.md`; fixture Mendeley+Zotero di `packages/services/test/fixtures/citations/`; render 4 style jadi snapshot test. |
| 1 — Core library + tab Sitasi | ✅ selesai | Migration `0031_workspace_citations` applied DEV; lint/typecheck/test/build hijau. Follow-up 2026-07-11: feature flag `workspace_citations` DIPASANG, mode seleksi + bulk bar (tag/export/gabung/hapus), dialog "Kelola duplikat" (endpoint groups + mergeMany) selesai. |
| 2 — Artifact bridge | ✅ selesai | 2026-07-11. `createFromArtifact` (idempotent + dedupe-adopt) + `resolveFromDoi`; endpoint `from-artifact`/`:id/resolve`; "Tambahkan ke Sitasi" di kartu board (context menu, gate `scholarly_paper`) + header artifact detail; provenance detail (linked artifact buka reader + lepas tautan). lint/typecheck/test (db 27 · services 301 · api 98, 0 fail)/build hijau. |
| 3 — BlockNote | ✅ selesai | 2026-07-11. Migration `0032_big_corsair` (`document_citation_usages`) applied DEV. Inline node `citation` + block `bibliography` (schema `aqshaBlockNoteSchema`), picker `/sitasi` + `/daftar pustaka`, render dokumen reaktif (in-text cluster + bibliography used-in-doc via citeproc `rebuildProcessorState`/`makeBibliography`), rekonsiliasi usage transaksional di `updateDocument` (diverifikasi DB langsung). |
| 4 — Astra | ✅ selesai | 2026-07-11. `ContextRef` kind `workspace-citation` (chat-core) + hydration `ContextService` + lane `workspaceCitations` di `/threads/context/hydrate`; tool read-only `search_workspace_citations`/`get_workspace_citation` (subpath `@aqsha/services/citations`); chip "Tambahkan ke chat" dari detail sitasi via channel `selectionRefs`. Suggestion card + suggest-tool insert-ke-dokumen DITUNDA (insert tetap aksi user via /sitasi). |
| 5 — Settings → Integrasi + Mendeley | ⬜ belum | |
| 6 — Zotero | ⬜ belum | |

**Feature flag `workspace_citations` DIHAPUS (2026-07-11):** default aktif untuk semua user, tanpa gate. Dihapus: `apps/web/lib/feature-flags.ts`, `features/citations/feature.ts` (`useWorkspaceCitationsEnabled`), gate di `workspace-side-panel.tsx`/`workspace-library-surface.tsx`/`artifact-detail-view.tsx`, entri `.env.example`.

**Gotcha implementasi Fase 3–4 (untuk fase berikutnya):**

- Render dokumen pakai citeproc engine langsung via `plugins.config.get("@csl").engine(items, style, "en-US", "text")` → `rebuildProcessorState(clusters)` (in-text, numbering IEEE/Vancouver konsisten karena diproses berurutan) + `makeBibliography()` (used-in-document, urutan per-style). BUKAN `Cite.format("citation")` per-cluster (O(n²) + tak sinkron numbering).
- Store render sitasi DILEKATKAN ke instance editor (`Symbol.for` + `props.editor`), BUKAN React context — komponen node BlockNote di-render lewat portal node-view yang tak selalu menembus context; `useSyncExternalStore` WAJIB kirim `getServerSnapshot` (exporter markdown me-render node statis).
- `createReactBlockSpec` (0.51.4) mengembalikan CREATOR → pakai `bibliography: bibliographyBlockSpec()` (dipanggil); `createReactInlineContentSpec` mengembalikan spec langsung → `citation: citationInlineSpec` (tanpa dipanggil). `BlockNoteSchema.create` TIDAK auto-merge default → wajib spread `...defaultBlockSpecs`/`...defaultInlineContentSpecs`.
- Hook di prop `render` spec melanggar rules-of-hooks (nama `render` lowercase) → ekstrak komponen bernama Uppercase (`CitationInlineView`/`BibliographyBlockView`).
- Tool agent butuh subpath `@aqsha/services/citations` (exports + entri tsup ditambah) + `bun run build:dist` sebelum runtime (agent = node condition → dist). `workspaceId` bukan konteks ambient tool → jadi param input (dari catatan konteks hydrate).
- Reconciliation `document_citation_usages` jalan di SETIAP save `updateDocument` (delete-all + insert per dokumen); citationId yang tak ada di workspace di-skip (FK aman), missing ditampilkan editor dari `renderDocument.missingIds`.

**Keputusan ADR Fase 0 (mengunci open question #1, #2, #5):**

- Parser: `@citation-js/core` + `plugin-bibtex` + `plugin-ris` v0.8.1 (MIT). RIS TIDAK ditulis sendiri.
- CSL engine: `citeproc` via `@citation-js/plugin-csl`, dual-license → **dielek CPAL-1.0** (bukan AGPL); server-side only; kewajiban attribution notice saat rilis publik.
- **`vancouver.csl` sudah tidak ada di repo resmi CSL** — kanonisnya `nlm-citation-sequence.csl`; itu yang di-vendor sebagai style id `vancouver`. Empat style + locale en-US di-vendor sebagai modul TS string di `packages/services/src/citations/styles/` (aman untuk tsup dist).
- Style id internal: `apa-7` / `ieee` / `vancouver` / `chicago-author-date` (bukan `apa-7th-edition` seperti draft).
- EndNote XML: di luar scope v1.

**Deviasi/penyederhanaan Fase 1 yang disengaja (follow-up):**

1. Web 1a + 1b dikerjakan sekaligus (bukan dua PR) — tab Sitasi langsung aktif, tanpa fase `disabled hint:"segera"`.
2. ✅ (RESOLVED 2026-07-11) Feature flag `workspace_citations` DIPASANG: `apps/web/lib/feature-flags.ts` (env `NEXT_PUBLIC_FEATURE_WORKSPACE_CITATIONS`) OR `isAdmin`, hook `useWorkspaceCitationsEnabled` di `features/citations/feature.ts`; gate TABS di `workspace-side-panel.tsx` (off → strip kolaps ke "Chat", deep-link `?panel=cite` jatuh ke chat).
3. ✅ (RESOLVED 2026-07-11) UI dibuat: **mode seleksi + bulk bar** (tag/export terpilih/gabung/hapus massal), item **"Kelola duplikat"** di menu More (dialog grup canonical-key + `mergeMany`). Endpoint baru: `GET duplicates`, `POST merge` (mergeMany), `POST bulk-tag`, `POST bulk-delete`. `duplicates/merge` pairwise lama tetap ada.
4. Badge document type di baris list diganti dot status + kolom source (density `@3xl:` tetap sesuai plan); provenance batch import di detail belum menampilkan nama file batch.
5. `workspace-chat-side-panel.tsx` **tidak dihapus** (draft §11 bilang "gantikan") — masih dipakai `artifact-reader-page-shell.tsx` dengan `chrome="frame"`; workspace detail memakainya via `workspace-side-panel.tsx` dengan `chrome="content"`.
6. Migration PROD `0031` belum dijalankan (menunggu keputusan rilis).

**Gotcha implementasi (untuk fase berikutnya):**

- `@citation-js/*` tanpa `.d.ts` → ambient decl `packages/services/src/citations/citation-js.d.ts` + triple-slash reference di file pengimpor (tsc `apps/api` tidak menyertakan ambient services otomatis).
- Config `plugin-csl` 0.8.x = `styles`/`locales` (BUKAN `templates`).
- Split BibTeX per-entry pakai regex awal-baris `@type{` — depth-scan brace ditolak karena entry ber-brace tak seimbang menelan entry berikutnya.
- `POST imports/preview` = **multipart `t.File` pertama di repo** (preseden lain presigned S3; file teks ≤10 MB tidak butuh presign). Route export mengembalikan `Response` + `content-disposition` — di Eden, `data` bisa string ATAU `Response` (handle keduanya di FE).
- Staging preview→commit hidup di `citation_import_batches.records_json`, dikosongkan saat commit (raw file tidak dipertahankan).

**Perubahan besar dari draft v1:**

1. **UI Citation Manager pindah dari segmented view di main area ke tab pada panel kanan workspace detail** (`Chat · Sitasi`), mengikuti pola tabbed side-panel yang sudah live di thread shell home (`PanelTabsHeader` + nuqs `panel`). Board library tetap satu-satunya isi main area — konsisten dengan filosofi board "unified, bukan tab" yang tertulis di `workspace-library-board.tsx`.
2. **Koneksi provider (OAuth/API key) pindah ke halaman Settings → Integrasi** (route baru di `SettingsRail`, additive-only). Arsitektur koneksi dibuat **generik multi-provider**: Mendeley (OAuth2) dan Zotero (API key) dari awal skema, bukan tabel khusus Mendeley.
3. **Semua fase integrasi provider ditaruh paling akhir** (Fase 5–6), setelah core library, artifact bridge, BlockNote, dan Astra stabil. Import-first `.bib`/`.ris` tetap jalur utama v1 — dan ini otomatis melayani pengguna Zotero juga karena Zotero mengekspor BibTeX/RIS/CSL-JSON.

## 1. Tujuan

Menambahkan **Citation Manager** workspace-scoped pada Aqsha agar pengguna dapat:

1. Mengimpor koleksi referensi hasil ekspor Mendeley/Zotero (`.bib`, `.ris`).
2. Menyimpan, memeriksa, mencari, memberi tag, dan menghapus duplikat referensi pada scope workspace — langsung dari panel kanan halaman workspace detail.
3. Menyisipkan sitasi stabil ke dokumen BlockNote dan menghasilkan daftar pustaka dari sitasi yang dipakai.
4. Mengekspor koleksi atau bibliography ke BibTeX/RIS/CSL-JSON.
5. Pada fase akhir, menghubungkan akun Mendeley (OAuth) atau Zotero (API key) melalui **Settings → Integrasi** untuk sinkronisasi metadata satu arah yang terkontrol.

**Bukan tujuan:** mengganti Mendeley/Zotero, menjadikannya provider login Aqsha, mirror dua arah, atau mengunduh semua PDF otomatis.

## 2. Keputusan produk yang dikunci

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Login Aqsha tetap Clerk. | Koneksi provider adalah integrasi data, bukan identitas. |
| 2 | V1 adalah **import-first** (`.bib` dan `.ris`), tanpa OAuth. | Onboarding cepat, tanpa token eksternal; didukung alur ekspor Mendeley DAN Zotero. |
| 3 | Integrasi provider (OAuth/key) menjadi fase paling akhir, opt-in. | Perlu app registration, token encryption, UX consent, sync cursor, conflict handling. |
| 4 | Aqsha menyimpan salinan bibliografi workspace sendiri. | Citation dan bibliography tetap bekerja saat koneksi provider putus. |
| 5 | PDF provider tidak diimpor otomatis. | Metadata lebih aman dan ringan; file punya isu lisensi + ukuran. |
| 6 | Citation Library adalah entitas baru, bukan `artifact_paper_metadata` atau `research_sources`. | Referensi bisa tanpa file, satu referensi dipakai banyak dokumen, sumber chat thread/turn-scoped. |
| 7 | Style default per workspace; citation di dokumen menyimpan `citationId`, bukan teks hasil format. | Ganti style me-render ulang seluruh citation/bibliography dengan aman. |
| 8 | V1: APA 7, IEEE, Vancouver, Chicago Author-Date via CSL engine. | Empat style mencakup kebutuhan awal. |
| 9 | **Citation Manager hidup di tab panel kanan workspace detail, bukan view main area.** | Main area board sengaja unified; panel kanan sudah punya pola tab + expand 30:70 untuk kebutuhan tabel padat; konsisten dengan thread shell home. |
| 10 | **Koneksi provider = account-level di Settings → Integrasi; penarikan data = per-workspace dari tab Sitasi.** | Token/key milik akun (satu koneksi dipakai banyak workspace); pemilihan folder/collection dan commit tetap keputusan per-workspace. |
| 11 | **Skema koneksi generik multi-provider** (`integration_connections` dengan kolom `provider`). | Mendeley dan Zotero berbagi lifecycle yang sama (connect/status/sync/disconnect); menghindari tabel per-provider. |
| 12 | Sync provider = **satu arah** (provider → Aqsha), preview sebelum commit, reuse UI import batch. | Menghindari overwrite dua arah; satu jalur commit untuk import file dan sync provider. |

## 3. Kondisi repo saat plan ditulis (terverifikasi 2026-07-11, SEBELUM implementasi)

> Bagian ini snapshot pra-implementasi. Yang sudah berubah oleh Fase 1: panel kanan workspace detail kini **bertab** (`workspace-side-panel.tsx` + `WorkspacePanelProvider`, nuqs `panel`), `chatPanelOpen` lokal dihapus, `CompactThreadChatPanel` punya prop `chrome`, migration terakhir kini `0031`.

### 3.1 Halaman workspace detail

- Route: `apps/web/app/app/(product)/workspaces/[workspaceId]/page.tsx` → `WorkspaceDetailClient` → `WorkspaceDetailMain` (`apps/web/features/workspaces/components/workspace-detail-client.tsx`).
- Split main/panel via `DetailSplitLayout` (`apps/web/components/layout/detail-split-layout.tsx`): grid dua track permanen, tween `grid-template-columns` (`PANEL_TRANSITION_MS` 300ms), inline ≥1100px (`PANEL_INLINE_MEDIA_QUERY`), di bawahnya jadi bottom drawer (vaul) via `ResponsiveSidePanel`. Expand 30:70 via `PanelExpandContext`/`PanelExpandButton`.
- **Panel kanan saat ini TIDAK bertab**: `WorkspaceChatSidePanel` → `CompactThreadChatPanel`, dibungkus `SidePanelFrame` dengan `PanelHeaderBar` berjudul "Chat" + `PanelExpandButton` + `PanelCloseButton`; toolbar in-card `PanelCardToolbar` berisi `ThreadRecentSwitcher` + `ThreadActionsMenu` + new-chat.
- Open/close panel = **state lokal React** (`chatPanelOpen`), bukan URL.
- `ComposerMentionsProvider` + `usePanelContextSelection` sudah ter-mount di halaman ini (channel `selectionRefs` untuk chip konteks composer).
- Main column dan panel column masing-masing unnamed `@container` (`detailSplitMainSurfaceClass`, `sidePanelColumnClass`) — layout internal WAJIB pakai varian `@2xl:/@3xl:/@5xl:`, bukan `sm:/md:/lg:`.

### 3.2 Pola tab panel yang akan direuse (dari thread shell home)

- `PanelTabsHeader` + `type PanelTab = { key; label; disabled?; hint? }` di `apps/web/components/layout/side-panel-frame.tsx` — tab strip flush glass bar, roving tabindex, dukung tab `disabled + hint:"segera"`, kolaps ke `PanelTitleLabel` bila ≤1 tab usable. **Sudah ada, belum dipakai workspace detail.**
- Referensi orkestrasi: `apps/web/features/thread-experience/components/thread-detail-shell.tsx` (deklarasi `tabs[]` inline, `selectTab`, actions = expand+close), `thread-panel-context.tsx` (provider nuqs), `utils/thread-panel-model.ts` (union mode + encode/decode param `panel`, `history: "replace"`).
- Per-tab content dibungkus `DetailPanelShell` (`detail-panel-chrome.tsx`): `PanelCardToolbar` (title/eyebrow/actions, TANPA border) + body scrollable `panelBodyPaddingClass`.

### 3.3 Board dan toolbar

- `WorkspaceLibrarySurface` mengelola query nuqs `q` / `type` / `sort` (`history: "replace"`); toolbar `WorkspaceBoardToolbar` (create dropdown, `WorkspaceLibraryControls` search/filter/sort, `PanelOpenButton` chat, menu opsi workspace). Tidak ada segmented view — dan tidak akan ditambah.
- Empty state pattern: `WorkspaceLibraryEmpty` (badge pill → title+desc → hairline connector → stacked pill actions).
- Dialog stack: `WorkspaceLibraryDialogsStack` (`NameDialog`, `AddItemDialog`, `ConfirmDialog`) via `useWorkspaceLibraryDialogState`.

### 3.4 Citation yang telah ada

- `packages/services/src/research/references.ts` memformat `research_sources` **per thread** ke APA 7/BibTeX/RIS — author ter-cap 3 by design, hanya APA 7. **Tidak boleh jadi engine Citation Manager**; yang direuse: `normalizeDoi` (`packages/services/src/papers/identifiers.ts`) dan pola export.
- `apps/web/components/ai-elements/inline-citation.tsx` (pill `[n]` jawaban Astra) dan `apps/web/features/artifacts/utils/citation.ts` (helper format satu paper) tetap terpisah lifecycle-nya.
- `artifact_paper_metadata` (workspace-scoped, `workspaceId` NOT NULL) siap jadi sumber `createFromArtifact` di Fase 2.

### 3.5 Editor dokumen

- BlockNote 0.51.4 (semua paket `@blocknote/*` dipinned versi sama) via `blocknote-document-editor.tsx`; persist ke `artifact_contents.blocksJson/markdown/plainText`. `artifactId` + block ID stabil → siap jadi anchor usage citation. Belum ada inline citation node/bibliography block.

### 3.6 Settings

- Semua route di `apps/web/app/app/settings/*`; nav dideklarasikan di array `settingsMenu` (`apps/web/features/settings/lib/settings-menu.ts`) dengan `{ key, href, label, description, group: "Pribadi" | "Riset", icon }`; rail `settings-rail.tsx`. **Aturan tetap: no redesign — route Integrasi = addition only** (pola sama seperti penambahan "Personalisasi").
- Anatomi halaman: `SettingsHeader section=...` + primitives `SettingsPanel/PanelHeader/PanelBody/Row/Pill` (`settings-card.tsx`), hooks di `features/settings/api.ts` (`useApi` + `unwrap` + `queryKeys` + toast sonner + `readableApiErrorMessage`).
- Belum ada UI integrations/OAuth apa pun di `apps/web`.

### 3.7 API

- Pola route: file per domain di `apps/api/src/routes/`, `new Elysia({ prefix }).use(authMacro)`, handler opt-in `{ auth: true }`, optional `rateLimitMacro`, body via `t.Object`, delegasi ke service `@aqsha/services` dengan `getDb()`. Mount = satu baris `.use(...)` di `apps/api/src/index.ts`.
- Migration ada di **`packages/db/migrations/`** (bukan `packages/db/drizzle/` seperti tertulis di draft v1); terakhir `0030`. Nomor migration ditentukan saat implementasi.

## 4. Desain UX detail

### 4.1 Panel kanan workspace detail menjadi tab: `Chat · Sitasi`

```text
┌ main (board library, tak berubah) ┐┌ panel ──────────────────────────┐
│                                   ││  Chat   Sitasi        ⤢  ⨯      │ ← PanelTabsHeader (flush)
│                                   ││ ┌─────────────────────────────┐ │
│                                   ││ │ PanelCardToolbar tab aktif  │ │ ← in-card, TANPA border
│                                   ││ │ ...konten tab...            │ │
│                                   ││ └─────────────────────────────┘ │
└───────────────────────────────────┘└─────────────────────────────────┘
```

**State model** — file baru `apps/web/features/workspaces/utils/workspace-panel-model.ts` (analog `thread-panel-model.ts`):

- Satu nuqs param `panel` pada route workspace detail, `history: "replace"`, absen = tertutup.
- Encoding mode: `chat` → tab Chat; `cite` → tab Sitasi (list); `cite:<citationId>` → sub-view detail sitasi (deep-linkable).
- URL shareable: `/app/workspaces/:workspaceId?panel=cite` (menggantikan rencana lama `?view=citations`).
- State lokal `chatPanelOpen` **dihapus** — open/close diturunkan dari param `panel` (rapikan: `WorkspaceChatSidePanel` lama disuperseded).

**Provider** — `WorkspacePanelProvider` ringan di `workspace-detail-client.tsx` (atau file sendiri): expose `mode`, `openChat()`, `openCitations()`, `openCitationDetail(id)`, `closePanel()`. Tidak perlu `previewMode`/lookups seperti thread shell — jauh lebih sederhana.

**Deklarasi tab** (inline, pola thread shell):

```ts
const tabs: PanelTab[] = [
  { key: "chat", label: "Chat" },
  { key: "citations", label: "Sitasi" },
];
```

- Actions header = `<PanelExpandButton /> + <PanelCloseButton />` (identik thread shell).
- `PanelOpenButton` di `WorkspaceBoardToolbar` tetap satu tombol; membuka mode terakhir yang diingat dalam mount, default `chat`. Tetap hidden saat panel terbuka.
- Entry lain ke tab Sitasi: deep link `?panel=cite`, aksi "Tambahkan ke Sitasi" pada artifact (Fase 2, membuka panel `cite` setelah sukses), dan footnote empty-state.

**Refactor chrome chat (wajib, kecil):** `CompactThreadChatPanel` saat ini membungkus diri dengan `SidePanelFrame` + `PanelHeaderBar "Chat"`. Tambah prop `chrome?: "frame" | "content"` — mode `content` hanya me-render `PanelCardToolbar` (switcher/menu/new-chat) + surface chat tanpa frame, karena frame + tabs kini dimiliki shell workspace. Pemakaian di thread-experience tidak berubah (`chrome="frame"` default). Jangan duplikasi komponen.

### 4.2 Tab Sitasi — konten

Dibungkus pola `DetailPanelShell`: `PanelCardToolbar` + body scroll `panelBodyPaddingClass`. Semua responsivitas internal pakai container variants (`@2xl:` dst.) karena kolom panel adalah `@container` — lebar panel berubah antara normal (`clamp(26rem,32vw,32rem)`) dan expanded (70%).

**PanelCardToolbar (list mode):**

- Kiri: title "Sitasi" + count muted (`Sitasi · 42`) — count dari query list, jangan blocking render.
- Kanan (compact icon buttons, pola `WorkspaceLibraryControls`):
  - `+ Tambah` (DropdownMenu): **Import file (.bib/.ris)** → wizard dialog; **Dari DOI** → dialog kecil input DOI; **Manual** → dialog form.
  - **Export** (DropdownMenu): BibTeX / RIS / CSL-JSON — semua, atau yang terseleksi bila ada seleksi.
  - **More** (DropdownMenu) ✅: Pilih beberapa (masuk mode seleksi); Kelola duplikat (dialog grup canonical-key — bukan list terfilter — tombol Gabungkan per grup); Gaya sitasi & urutan bibliography (dialog settings workspace).

**Baris kontrol di bawah toolbar:** search input compact (state lokal React, BUKAN nuqs — jangan bentrok dengan `q` milik board) + filter chips: status (`verified / needs-review / incomplete`), tag, source (`import / artifact / manual / sync`).

**List (lebar normal ~26–32rem):** baris ringkas —

- Judul (clamp 2 baris) + badge document type kecil.
- Baris meta muted: first author + tahun · venue.
- Chip tag (maks 2 + `+n`), dot status metadata (warna + tooltip), badge source.
- Hover/focus actions: **Salin sitasi** (render style default workspace, copy ke clipboard), menu ⋯ (Detail, Edit, Buka DOI/URL, Hapus).
- Klik baris → sub-view detail (`cite:<id>`).
- ✅ Checkbox seleksi muncul saat mode seleksi aktif (via menu More "Pilih beberapa") → bulk bar melayang di bawah list: beri tag (popover), export terpilih, gabungkan (≥2), hapus terpilih.

**Expanded (70%):** DOM sama, container variants menaikkan densitas: `@3xl:` baris berubah jadi grid multi-kolom (judul/author+tahun/venue/DOI/tags/status) dengan header kolom — inilah alasan tabel padat tetap layak meski hidup di panel. Tidak ada tabel terpisah; satu komponen, dua density.

**Sub-view detail (`cite:<id>`):** `PanelCardToolbar` berganti jadi tombol back ("← Sitasi") + actions (Edit, Salin sitasi per-style submenu, ⋯). Body: metadata lengkap (semua field CSL yang terisi), preview terformat pada style default, provenance (source + batch import + tanggal), linked artifact (buka reader) atau tombol "Tautkan artifact", tags editable inline, status + tombol "Tandai sudah direview". Edit metadata = dialog form (bukan inline besar-besaran), konsisten pola `NameDialog`/`AddItemDialog`.

**Missing/deleted state:** citation soft-deleted yang masih dipakai dokumen tampil di list dengan badge `missing` + aksi restore/remap — tidak pernah hilang diam-diam.

### 4.3 Empty state tab Sitasi

Mengikuti anatomi `WorkspaceLibraryEmpty` (badge pill → title + deskripsi → hairline connector → stacked pill actions):

- Badge: ikon quote/book lavender + label "Sitasi".
- Title: "Belum ada referensi" — deskripsi singkat manfaat.
- Tiga pill action: **Import dari Mendeley/Zotero (.bib/.ris)**, **Tambah dari DOI**, **Tambah manual**.
- Footnote muted: "Hubungkan akun Mendeley atau Zotero di Pengaturan → Integrasi" — sebelum Fase 5 ditampilkan dengan chip "segera" tanpa link mati; setelah Fase 5 jadi link ke `/app/settings/integrations`. Jangan menawarkan alur yang belum berfungsi.
- Copy sentence case, tanpa uppercase (konvensi copywriting produk).

### 4.4 Flow import file (v1)

```text
Ekspor Mendeley/Zotero (.bib/.ris)
  → dialog wizard: upload → preview → commit
  → Citation Library workspace (tab Sitasi)
```

Wizard = Dialog multi-step (bukan di dalam panel — butuh lebar dan fokus):

1. **Upload**: dropzone accept `.bib`/`.ris`, maks 10 MB, satu file; kirim multipart ke endpoint preview.
2. **Preview**: chip ringkasan (valid / incomplete / duplikat / error), tabel record dengan checkbox (default: valid+incomplete tercentang; duplikat mengikuti policy), radio policy duplikat: `skip` (default) / `merge missing fields` / `import anyway`, expander error per baris. Parser error per-entry, bukan gagal total.
3. **Commit + summary**: created/merged/skipped, tombol "Lihat di Sitasi" (panel `cite`). Kebijakan undo batch (open question #4) DITUTUP: tanpa undo otomatis — koreksi via hapus per-citation.

### 4.5 Citation di BlockNote (Fase 3)

1. `/citation` atau tombol **Cite** di editor membuka citation picker (popover/dialog) yang mencari Citation Library workspace aktif — keyboard search + multi-select.
2. Inline citation node hanya menyimpan `citationIds` + optional locator (`page`, `prefix`, `suffix`); render preview sesuai style workspace.
3. `/bibliography` menambahkan bibliography block, mode `used-in-document` (default), tombol **Update bibliography** manual pada versi pertama.
4. Reference terhapus → node berstatus `missing`; user restore/remap/remove eksplisit.
5. Serializer: `blocksJson` = canonical; markdown export = representasi kompatibel (mis. Pandoc citekey); plainText = fallback readable.
6. Autosave merekonsiliasi `document_citation_usages` dari block tree dalam transaksi.

### 4.6 Settings → Integrasi (Fase 5–6)

**Nav (addition-only):** tambah entri ke `settingsMenu` —

```ts
{
  key: "integrations",
  href: "/app/settings/integrations",
  label: "Integrasi",
  description: "Hubungkan aplikasi referensi seperti Mendeley dan Zotero",
  group: "Riset",
  icon: <ikon plug/link dari @aqsha/ui/icons>,
}
```

`SettingsKey` union bertambah satu; bila ikon plug/link belum ada di `@aqsha/ui/icons`, tambah export Lucide-compatible backed Hugeicons di `packages/ui/src/icons.tsx` (aturan ikon repo).

**Halaman** — `apps/web/app/app/settings/integrations/page.tsx` → `IntegrationsPage` (`features/settings/components/integrations-page.tsx`), memakai primitives existing:

- `SettingsHeader section="integrations"`.
- Satu `SettingsPanel` per provider (Mendeley, Zotero):
  - Header: nama + deskripsi singkat + `SettingsPill` status: `Tidak terhubung` / `Terhubung` / `Kedaluwarsa` / `Error` / `Segera` (sebelum fasenya rilis, tombol disabled).
  - Body `SettingsRow`s: akun terhubung (nama/email profil provider), scope ("metadata saja"), sinkron terakhir + tombol "Sinkronkan sekarang", jumlah record tersinkron.
  - Footer actions: **Hubungkan** (Mendeley: redirect ke endpoint connect OAuth; Zotero: dialog input API key + user ID dengan link bantuan ke zotero.org/settings/keys) / **Putuskan** (ConfirmDialog; jelaskan data citation Aqsha TIDAK ikut terhapus).
- Callback OAuth kembali ke halaman ini dengan toast hasil.

**Pembagian tanggung jawab:** Settings = lifecycle koneksi (connect/status/disconnect/sync manual). **Penarikan data per-workspace** tetap di tab Sitasi: bila koneksi aktif, menu `+ Tambah` mendapat item "Tarik dari Mendeley/Zotero" → pilih folder/collection → **preview → commit memakai UI wizard import yang sama** (source `mendeley_sync`/`zotero_sync`). Satu jalur commit untuk file dan provider.

### 4.7 Integrasi Astra (Fase 4)

- Reference dari tab Sitasi bisa dijadikan context chip composer — reuse channel `selectionRefs` yang sudah ter-mount di halaman ini, dengan `ContextRef` kind baru `workspace-citation` di `@aqsha/chat-core`.
- Astra menerima metadata terstruktur saja (bukan token provider/full PDF).
- Agent tools read-only `search_workspace_citations` / `get_workspace_citation`; tool write hanya **suggest** — insert ke dokumen tetap aksi user.
- Suggestion card deterministik di chat dengan tombol insert/open document.

## 5. Kontrak data

### 5.1 Canonical record

CSL-JSON sebagai payload canonical (`cslJson`) — cukup untuk render CSL, tidak mengikat ke bentuk BibTeX/RIS/provider.

```ts
type CitationRecord = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  artifactId: string | null;
  source: "import" | "provider_sync" | "artifact" | "doi" | "manual";
  provider: "mendeley" | "zotero" | null; // terisi untuk import (asal file, best-effort) & sync
  externalId: string | null;              // document/item id provider pada fase sync
  documentType: string;
  title: string;
  authors: Array<{ family?: string; given?: string; literal?: string }>;
  publishedYear: number | null;
  venue: string | null;
  publisher: string | null;
  doi: string | null;
  url: string | null;
  tags: string[];
  cslJson: unknown;
  canonicalKey: string;
  metadataStatus: "verified" | "needs_review" | "incomplete";
  createdAt: number;
  updatedAt: number;
};
```

`canonicalKey`: prioritas `doi:<normalized>` → `isbn:<normalized>` → hash normalisasi `title + year + first-author`. Dipakai sebagai **kandidat** duplicate, bukan hard-unique pada fallback title.

### 5.2 Tabel dan migration

Migration baru di **`packages/db/migrations/`** — **terealisasi sebagai `0031_workspace_citations.sql`** (applied DEV 2026-07-11; PROD menunggu rilis). Semua tabel mengikuti konvensi schema repo: `owner_user_id` FK `users`, index owner-first, timestamps `bigint` ms.

#### `workspace_citations`

| Kolom | Catatan |
|---|---|
| `id`, `owner_user_id`, `workspace_id` | PK + owner/workspace scope wajib |
| `artifact_id` nullable | FK artifact; dua arah opsional |
| `source`, `provider`, `external_id` | provenance; `provider`+`external_id` terisi pada fase sync |
| `document_type`, `title`, `authors_json`, `published_year`, `venue`, `publisher`, `doi`, `url`, `tags` | read/query model terindeks |
| `csl_json` | canonical complete record |
| `canonical_key` | dedupe candidate |
| `metadata_status`, `reviewed_at` | quality workflow |
| `created_at`, `updated_at`, `deleted_at` | soft delete agar usage dokumen tetap terdiagnosis |

Index minimum: `(owner_user_id, workspace_id, updated_at)` keyset list; `(owner_user_id, workspace_id, doi)`; `(owner_user_id, workspace_id, canonical_key)`; `(owner_user_id, artifact_id)`; unique partial `(owner_user_id, workspace_id, provider, external_id)` saat `external_id is not null`.

#### `workspace_citation_settings`

One-to-one workspace (PK-is-FK `workspace_id`, pola `user_agent_preferences`): `workspace_id`, `owner_user_id`, `default_style_id` (default **`apa-7`** — id final, bukan `apa-7th-edition`), `bibliography_sort` (`author` = urutan style / `year` / `title`), timestamps.

#### `citation_import_batches`

Audit batch (bukan source of truth): id, owner/workspace, `source_kind` (`file` | `provider_sync`), format/provider, original filename, counts (total/valid/duplicate/error), `summary_json`, `committed_at`, timestamps. Raw file tidak dipertahankan setelah commit.

#### `document_citation_usages` (Fase 3) — ✅ IMPLEMENTED (mig `0032_big_corsair`, applied DEV 2026-07-11)

`owner_user_id`, `workspace_id`, `document_artifact_id` (FK artifacts, cascade), `citation_id` (FK workspace_citations), `inline_node_id`, `occurrence_order`, `locator_json`, timestamps. Index `(owner, document, occurrence_order)` + `(owner, citation)`. Index/diagnostic; `blocksJson` tetap menyimpan node agar dokumen portable. Rekonsiliasi (delete-all + insert) saat save di `updateDocument`; `usageCount` disurface di `CitationService.get`.

#### `integration_connections` (Fase 5)

| Kolom | Catatan |
|---|---|
| `id`, `owner_user_id` | account-level, bukan per-workspace |
| `provider` | `'mendeley' \| 'zotero'`; unique `(owner_user_id, provider)` |
| `credentials_encrypted` | OAuth access+refresh token (Mendeley) atau API key (Zotero), AES-GCM at-rest dengan secret deployment; TIDAK PERNAH dikirim ke `apps/web` |
| `token_expires_at` nullable | Mendeley |
| `external_profile_json` | id/nama/email profil provider untuk ditampilkan di Settings |
| `selected_folders_json` | folder/collection pilihan default |
| `last_sync_at`, `sync_cursor` | incremental sync |
| `status`, `last_error` | `connected / expired / error / revoked` |
| timestamps | |

### 5.3 Metadata dari artifact (Fase 2) — ✅ IMPLEMENTED (2026-07-11)

`CitationService.createFromArtifact`: baca `artifact_paper_metadata` + ownership (row sudah owner-scoped + membawa `workspace_id`, jadi TAK perlu load artifact untuk auth); butuh `title` (bukan title/DOI — DOI-only diarahkan ke "Dari DOI"); link `artifactId` tanpa memindahkan file; idempotent via `findActiveByArtifact`; dedupe canonical key = **adopsi** row duplikat yang belum punya artifact (`created=false, linkedExisting=true`). `artifact_paper_metadata` TIDAK diubah menjadi canonical citation row. Peta CSL via `buildCslFromPaperMetadata` (author `PaperAuthor.name` → `authorFromName`).

## 6. API dan service boundary

`apps/web` hanya memanggil Eden Treaty (`@aqsha/api`); tidak mengimpor `@aqsha/db`/`@aqsha/services`.

### 6.1 Endpoint citations (Fase 1–3) — ✅ LIVE Fase 1–3 (`apps/api/src/routes/citations.ts`)

Tambahan di luar draft: `GET /workspaces/:id/citations/tags` (daftar tag distinct untuk filter chips). List response menyertakan `total` (count toolbar). Rate limit terpasang: `citations:create` (20/menit), `citations:import` (5/menit, preview + commit).

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/workspaces/:id/citations` | keyset list + search/filter/status/tag |
| `GET` | `/workspaces/:id/citations/tags` | tag distinct workspace (filter chips) |
| `GET` | `/workspaces/:id/citations/:citationId` | detail |
| `POST` | `/workspaces/:id/citations` | create manual / create-by-DOI |
| `PATCH` | `/workspaces/:id/citations/:citationId` | edit metadata/tag/link artifact |
| `DELETE` | `/workspaces/:id/citations/:citationId` | soft delete + guard usage |
| `POST` | `/workspaces/:id/citations/imports/preview` | multipart `.bib`/`.ris` → preview batch |
| `POST` | `/workspaces/:id/citations/imports/:batchId/commit` | commit selected + duplicate policy |
| `POST` | `/workspaces/:id/citations/duplicates/merge` | merge explicit source/target (pairwise) |
| `GET` | `/workspaces/:id/citations/duplicates` | grup kandidat duplikat (Fase 1 follow-up) |
| `POST` | `/workspaces/:id/citations/merge` | mergeMany `{ids, targetId?}` (bulk/kelola duplikat) |
| `POST` | `/workspaces/:id/citations/bulk-tag` | tag massal `{ids, tags}` |
| `POST` | `/workspaces/:id/citations/bulk-delete` | soft delete massal `{ids}` |
| `POST` | `/workspaces/:id/citations/from-artifact` | createFromArtifact `{artifactId, tags?}` (Fase 2) |
| `POST` | `/workspaces/:id/citations/:citationId/resolve` | perbarui metadata dari DOI (Fase 2) |
| `GET` | `/workspaces/:id/citations/export` | `bibtex` / `ris` / `csl-json` |
| `POST` | `/workspaces/:id/citations/render` | preview citation/bibliography per style (library) |
| `POST` | `/workspaces/:id/citations/render-document` | render sitasi in-text per cluster + bibliography used-in-doc (Fase 3) |
| `GET/PATCH` | `/workspaces/:id/citation-settings` | default style + sort bibliography |

Route module `apps/api/src/routes/citations.ts`, mount satu baris di `index.ts`. Setiap handler `{ auth: true }` + `WorkspaceService.assertWorkspaceOwner` di service. Error via `appError` terstruktur; frontend `readableApiErrorMessage`. Rate limit import/commit/create-by-DOI via `rateLimitMacro`.

### 6.2 Endpoint integrations (Fase 5–6)

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/integrations` | status semua provider milik owner (tanpa credential) |
| `GET` | `/integrations/mendeley/connect` | buat OAuth `state` signed + redirect |
| `GET` | `/integrations/mendeley/callback` | verifikasi state, tukar code backend-only, enkripsi token, redirect ke Settings |
| `POST` | `/integrations/zotero/key` | simpan API key + user ID; validasi via Zotero `/keys/current` |
| `DELETE` | `/integrations/:provider` | disconnect: revoke (bila didukung) + hapus credential lokal + stop job |
| `GET` | `/integrations/:provider/folders` | daftar folder/collection untuk picker |
| `POST` | `/integrations/:provider/sync/preview` | pull → normalisasi → preview batch (reuse pipeline import) |
| `POST` | `/integrations/:provider/sync/:batchId/commit` | commit ke workspace target |

### 6.3 Modul `packages/services`

Terimplementasi (Fase 1) di `packages/services/src/citations/` — nama file final:

- `citation.service.ts` — CRUD, authorization, dedupe (409 `citation_duplicate` + `allowDuplicate`), merge, quality status, export, render, settings; create-by-DOI reuse `classifyPaperText` + `resolvePaper`. ✅ **Fase 2 + follow-up (2026-07-11):** `createFromArtifact`, `resolveFromDoi`, `listDuplicateGroups`, `mergeMany` (`pickMergeTarget` by completeness), `bulkAddTag`, `bulkSoftDelete`; helper CSL bersama `buildCslFromResolvedPaper`/`buildCslFromPaperMetadata`. Repo baru `WorkspaceCitationRepo.softDeleteMany`. ✅
- `citation-import.service.ts` — preview (staging `records_json`) + commit (policy skip/merge/import, re-check duplikat dalam transaksi), limits, diagnostics; dipakai import file DAN provider sync nanti (satu pipeline). ✅
- `citation-format.ts` (bukan `.service.ts`) — CSL rendering (register style vendored sekali) + export bibtex/ris/csl-json. ✅ **Fase 3:** `renderDocumentCitations` (citeproc engine langsung: `rebuildProcessorState` in-text per cluster + `makeBibliography` used-in-doc) + types `DocumentCluster`/`DocumentCiteItem`/`DocumentRenderResult`. ✅
- `citation-usages.ts` — **Fase 3 baru:** `extractCitationClusters(blocksJson)` (walk BlockNote tree) + `CitationUsageService.reconcileDocument` (dipakai `ArtifactService.updateDocument`, transaksional). ✅
- `citation-parse.ts` — split per-entry `.bib`/`.ris` + sniff format + diagnostic per-entry. ✅
- `citation-normalize.ts` — DOI (reuse `normalizeDoi`), ISBN, title key, author, canonical key; pure + unit-testable. ✅
- `styles/*.ts` — 4 style CSL + locale en-US vendored sebagai modul TS string; `citation-js.d.ts` ambient decl. ✅
- **Fase 4:** subpath `@aqsha/services/citations` ditambah (`package.json` exports + entri `tsup.config.ts`) agar tool agent (node→dist) bisa import `CitationService`. `ContextService.hydrate` (`./context`) menerima lane `workspaceCitations`. Tool `apps/agent/src/mastra/tools/{search,get}-workspace-citation.ts` + registrasi di `tools/index.ts` (`readTools`). ✅

Belum ada (Fase 5–6):

- `integrations/integration.service.ts` — lifecycle koneksi, enkripsi credential, status.
- `integrations/providers/mendeley.adapter.ts`, `zotero.adapter.ts` — adapter HTTP per provider (pagination, retry/backoff 429, token refresh untuk Mendeley) di balik satu interface `IntegrationProvider` (listFolders, pullDocuments(cursor), profile).
- BullMQ worker `integration-sync` (apps/api) — sync periodik opt-in, idempotent via `externalId` + `sourceHash`.

**Technical spike Fase 0 (✅ selesai — hasil di ADR `docs/adr-citation-csl-engine.md`):**

1. Parse BibTeX dan RIS hasil ekspor nyata Mendeley DAN Zotero.
2. Convert ke CSL-JSON tanpa kehilangan author, DOI, type, container, date.
3. Render APA 7, IEEE, Vancouver, Chicago deterministik (snapshot test).
4. Engine hanya berjalan server-side (API/services) — jangan masuk bundle `apps/web`.
5. **ADR lisensi wajib**: kandidat CSL engine praktis = citeproc-js (dipakai `@citation-js/plugin-csl`), dual-license **CPAL-1.0/AGPL-3.0** — keputusan eksplisit sebelum coding (preseden repo: drop GPL). Kandidat parser: `@citation-js/plugin-bibtex`/`plugin-ris` atau `@retorquere/bibtex-parser`; RIS sederhana sehingga parser tulis-sendiri di `citation-normalize` adalah opsi sah. File style CSL (apa/ieee/vancouver/chicago-author-date) + locale di-vendor dari repo resmi CSL.

Jangan melanjutkan formatter APA manual `research/references.ts` sebagai engine multi-style (author cap 3, asumsi source chat).

### 6.4 Input safety dan limits

- v1 hanya `.bib`/`.ris`; content-type tidak dipercaya sendirian (sniff isi).
- Maks 10 MB / 5.000 records per batch; parser server-side dengan timeout; error per-entry.
- Tidak fetch URL arbitrary saat parse; enrichment DOI eksplisit/queued dengan SSRF guard existing.
- Rate limit import/commit/create-by-DOI/sync.
- Log summary batch tanpa credential atau raw bibliografi lengkap di level info.

## 7. Fase implementasi

Urutan: **Fase 0 → 1 → 2 → 3 → 4 (opsional, bisa paralel 3) → evaluasi penggunaan → 5 → 6.**

### Fase 0 — Spike dan kontrak final — ✅ SELESAI (2026-07-11)

**Hasil:** parser/CSL tervalidasi terhadap fixture nyata, type CSL-JSON final, ADR lisensi diputuskan — lihat `docs/adr-citation-csl-engine.md` dan ringkasan di bagian "Progress implementasi". Acceptance terpenuhi dan diabadikan sebagai regression test (`packages/services/test/citations-parse-format.test.ts`).

1. Fixture anonymized `.bib`/`.ris` dari ekspor **Mendeley dan Zotero**: journal article, book, thesis, web page, multi-author, DOI kosong, non-ASCII.
2. Test spike di `packages/services` untuk parser candidate + render 4 style.
3. Putuskan EndNote XML = v1.1 atau di luar scope.
4. Policy author names, date range, editor, page, edition, publisher place, URL normalization.
5. ADR: pilihan parser + sikap terhadap lisensi citeproc-js (CPAL attribution vs alternatif).

**Acceptance:** semua fixture → CSL-JSON valid atau diagnostic terstruktur; tidak ada formatter mengarang data hilang.

### Fase 1 — Core Citation Library + tab panel Sitasi — ✅ SELESAI (2026-07-11)

**Hasil:** panel workspace detail bertab `Chat · Sitasi`; user bisa import `.bib`/`.ris`, melihat/mengedit/dedupe/export referensi. Semua butir 1–5 di bawah terimplementasi (web 1a+1b digabung satu PR; deviasi yang disengaja + follow-up tercatat di bagian "Progress implementasi"). Testing: unit db 6 (itest DEV), services 30 (normalize/parse/format/import), api itest 11 (CRUD owner, 404 intruder, preview→commit multipart, anti double-commit, export, settings, soft delete), model test web `workspace-panel-model.test.ts`.

1. `packages/db` — schema + repository `workspaceCitations`, `workspaceCitationSettings`, `citationImportBatches`; migration; test scoping owner/workspace.
2. `packages/services` — `citation-normalize`, parser adapter, `CitationImportService`, `CitationService`, renderer/exporter; resolver create-by-DOI reuse provider metadata existing (crossref/openalex/arxiv) setelah dipetakan ke CSL-JSON; dedupe preview + policy commit + merge audit.
3. `apps/api` — `routes/citations.ts` + mount; multipart validation, limits, ownership, rate limit.
4. `apps/web` — dua PR terpisah disarankan:
   - **1a (panel tabs):** `workspace-panel-model.ts` + `WorkspacePanelProvider` (nuqs `panel`), shell panel baru `workspace-side-panel.tsx` dengan `PanelTabsHeader`, prop `chrome` pada `CompactThreadChatPanel`, hapus `chatPanelOpen` lokal. Tab Sitasi sementara `disabled hint:"segera"` bila 1b belum merge.
   - **1b (fitur Sitasi):** `features/citations/` (api.ts + `queryKeys.citations` di `lib/api-query.ts`, types, components: list, row, filter, empty state, import wizard dialog, add-by-DOI dialog, manual form dialog, detail sub-view, export menu, settings gaya dialog).
5. Testing — unit normalisasi/format/dedupe/parser fixtures; API itest (owner CRUD/import; user lain 403/404; malformed tidak commit); web test filter/preview/error readable/`?panel=cite` deep link.

**Acceptance:** import 100 reference BibTeX/RIS (Mendeley/Zotero), skip/merge duplikat, cari DOI, ubah tag, download BibTeX/RIS konsisten — semua dari tab Sitasi; expand 30:70 menampilkan density tabel; chat tetap berfungsi persis seperti sebelumnya.

### Fase 2 — Artifact bridge dan quality workflow — ✅ SELESAI (2026-07-11)

**Hasil:** paper PDF/URL Aqsha bisa jadi citation tanpa duplikasi; metadata lemah terlihat dan bisa diperbaiki. Testing: api itest +6 (`from-artifact` idempotent/intruder-404/no-metadata-404, duplicates+merge, bulk-tag/delete). lint/typecheck/test (db 27 · services 301 · api 98, 0 fail)/build hijau.

1. ✅ Action **Tambahkan ke Sitasi** pada kartu artifact (context menu board, gate `detectedDocumentKind === "scholarly_paper"`) + header artifact detail (`ArtifactHeaderActions`, prop opsional). Sukses → toast; di workspace detail juga buka panel `cite:<id>` (via prop `onCitationAdded` → `openCitationDetail`, karena `WorkspaceLibrarySurface` juga dipakai thread-shell yang tanpa `WorkspacePanelProvider`).
2. ✅ API `createFromArtifact` (`POST from-artifact`); **link/unlink** memakai `PATCH artifactId` existing (link dari kartu; unlink = tombol "Lepas tautan" di detail). Artifact picker "Tautkan artifact" dari sisi citation DITUNDA (belum ada; entry utama = dari sisi artifact).
3. ✅ `metadataStatus` (sudah ada `metadataStatusFor`): artifact source → `needs_review`/`incomplete`; `resolveFromDoi`/markReviewed → `verified`.
4. ✅ Detail sitasi: provenance (source pill) + baris "Artifact" (buka reader + lepas tautan). Nama file batch import di detail masih belum (butuh kolom link citation→batch — ditunda).
5. ⚠️ DEVIASI: bukan BullMQ queue — dibuat **`POST :id/resolve` sinkron** (tombol "Perbarui dari DOI" di detail saat status ≠ verified & ada DOI): re-resolve `resolvePaper`, fill-missing (jangan clobber edit user), status→verified. Queue batch-resolve untuk banyak record sekaligus bisa menyusul bila perlu.

**Acceptance:** ✅ satu artifact masuk library sekali saja (idempotent + dedupe-adopt); link kembali bisa dibuka (reader); hapus citation tidak menghapus file (soft delete citation, artifact utuh).

### Fase 3 — BlockNote citation dan bibliography — ✅ SELESAI (2026-07-11)

**Hasil:** dokumen memakai identifier stabil, re-render saat style berubah. Testing: services unit +8 (`citations-document-render.test.ts` — in-text APA/IEEE, bibliography used-in-doc, cluster kosong, ekstraksi cluster), api itest +2 (render-document owner + intruder 404), rekonsiliasi diverifikasi langsung ke DB (urutan/locator/skip-missing/idempotent replace). lint/typecheck (7 workspace)/build hijau. File web baru: `blocknote-citation-schema.tsx`, `blocknote-citation-store.ts`, `citation-picker-dialog.tsx`.

1. ✅ Custom inline content `citation` (`citationIds` csv, `nodeId` stabil, locator/label/prefix/suffix) + custom block `bibliography` (used-in-document). Schema `aqshaBlockNoteSchema` = default + 2 node; di-pass ke `useCreateBlockNote`.
2. ✅ Citation picker (search + multi-select) via perintah `/sitasi`; `/daftar pustaka` menyisipkan block bibliography. (Nama perintah Indonesia, bukan `/citation`/`/bibliography`.)
3. ⚠️ Serializer: `blocksJson` canonical (via `JSON.stringify(editor.document)` existing). Markdown/plainText = HTML-first `blocksToMarkdownLossy` merender node (belum ada citekey Pandoc khusus — fallback readable via komponen render). Cukup untuk v1; citekey Pandoc bisa menyusul.
4. ✅ Autosave rekonsiliasi `document_citation_usages` transaksional di `ArtifactService.updateDocument` (delete-all + insert per dokumen; id non-workspace di-skip FK-safe).
5. ✅ Editor render reaktif dengan style default workspace + missing state (chip "⚠ sitasi hilang" dari `renderDocument.missingIds`). Panel reader read-only tetap markdown prose (belum render node sitasi — surface sekunder).
6. ⚠️ DEVIASI (dari §12.3): bibliography = **LIVE** (auto re-render dari store tiap sitasi/style berubah), BUKAN tombol "Update bibliography" manual — lebih ergonomis + lebih sedikit kode (tak perlu snapshot di blocksJson).

**Acceptance:** ✅ citation bertahan setelah refresh (blocksJson canonical); APA→IEEE mengubah render tanpa ganti ID (node simpan `citationIds`, marker dari render service); bibliography hanya memuat yang dipakai (`makeBibliography` used-in-doc); missing tidak silently hilang (chip missing). Runtime E2E editor = owner (risk: xl-ai AIExtension vs custom schema).

### Fase 4 — Astra integration — ✅ SELESAI (2026-07-11)

1. ✅ `ContextRef` kind `workspace-citation` di `@aqsha/chat-core` (union + `contextRefKey`/`splitContextRefs` lane `workspaceCitations`/`countContextRefs`/`buildWorkspaceCitationMentionLabel`); hydration `ContextService.hydrate` validasi owner+workspace via `CitationService.get` (best-effort drop foreign) + section catatan `get_workspace_citation`; lane baru di `/threads/context/hydrate` + `useHydrateContext` + composer.
2. ✅ Chip konteks "Tambahkan ke chat" di detail sitasi via channel `selectionRefs` existing (`useComposerSelection().addSelectionRef`, lalu pindah ke tab Chat).
3. ✅ Agent tools read-only `search_workspace_citations` / `get_workspace_citation` (subpath baru `@aqsha/services/citations`; `workspaceId` = input param dari catatan konteks). ⚠️ DITUNDA: suggestion card deterministik + tool "suggest insert ke dokumen" — insert tetap aksi user via `/sitasi`; tools sudah membuat sitasi tersedia untuk Astra.

### Fase 5 — Settings → Integrasi + Mendeley OAuth

**Hasil:** halaman Integrasi live; user menghubungkan Mendeley dan menarik metadata folder terpilih ke workspace.

1. Registrasi aplikasi di Mendeley Developer Portal; redirect URI production/staging/local.
2. `packages/db` — `integration_connections` + migration; crypto helper AES-GCM (secret via env/KMS).
3. `apps/api` — `routes/integrations.ts` (connect/callback/status/disconnect/folders/sync) + BullMQ `integration-sync`.
4. `packages/services` — `integration.service.ts` + `mendeley.adapter.ts` di balik interface `IntegrationProvider`.
5. `apps/web` — entri `settingsMenu` "Integrasi" + `IntegrationsPage` (kartu provider, status pill, connect/disconnect, sync manual); tab Sitasi mendapat item "Tarik dari Mendeley" (folder picker → preview → commit, reuse wizard).
6. Conflict policy: one-way; record yang pernah diedit lokal dan berubah di provider → tanda `conflict`, user pilih keep Aqsha / accept provider.

**Acceptance:** connect → pilih folder → sync metadata → disconnect; token tidak pernah muncul di log/response/browser; sync ulang tidak menduplikasi (idempotent via `externalId`).

### Fase 6 — Zotero

1. `zotero.adapter.ts` (API v3, header `Zotero-API-Key`; koleksi + items + versioning `Last-Modified-Version` sebagai cursor).
2. Connect flow = dialog API key + user ID (validasi `/keys/current`); tanpa OAuth dance → fase ini jauh lebih ringan dari Mendeley.
3. Kartu Zotero di Settings → Integrasi berubah dari "Segera" menjadi aktif; tab Sitasi mendapat "Tarik dari Zotero".

**Acceptance:** paritas alur dengan Mendeley (folders/preview/commit/disconnect/idempotent), key terenkripsi at-rest.

## 8. Keamanan integrasi provider

- OAuth (Mendeley): `state` signed mengikat owner, intent, nonce, expiry, return URL allowlisted; exchange code backend-only; PKCE bila didukung saat registrasi.
- Credential (token/API key) dienkripsi at-rest; tidak di-serialize ke client, analytics, pino log, error body, atau BullMQ payload plaintext.
- Endpoint sync selalu cek koneksi milik `ownerUserId`; `externalId` tidak pernah jadi authorization bypass.
- Download file provider hanya on-demand + user-initiated + lewat storage/AV/size policy Aqsha; default sync tidak menyentuh endpoint file.
- Disconnect menghapus credential lokal, job tertunda, cache; data citation Aqsha tidak ikut terhapus kecuali user memilih action terpisah.

## 9. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Data BibTeX/RIS kotor/tidak lengkap | preview per-record, quality status, manual edit, fixture test |
| False-positive duplicate berbasis judul | DOI/ISBN diutamakan; fallback hanya suggestion yang di-approve |
| Style tidak konsisten | CSL-JSON canonical + satu renderer service + snapshot test per style |
| Citation di dokumen jadi teks mati | node menyimpan `citationIds`, bukan rendered text |
| Reference dihapus tapi dipakai dokumen | soft delete + missing state + remap/restore |
| Panel tab merusak UX chat existing | refactor chrome via prop (`chrome="content"`), thread-experience tak tersentuh; test regresi chat panel |
| Lebar panel tidak cukup untuk manajemen massal | expand 30:70 + container-variant density; wizard/form di dialog |
| Token/key provider bocor | backend-only exchange, enkripsi, redacted logging, state validation |
| Sync overwrite edit lokal | one-way + conflict review eksplisit |
| Lisensi CSL engine | ADR Fase 0 (citeproc-js CPAL/AGPL), engine server-side only |
| Scope membengkak jadi clone Mendeley/Zotero | fase dikunci: import/reference/cite/export dulu; annotation/groups/collab ditunda |

## 10. Verifikasi dan rollout

### Test matrix minimum

- Parser: BibTeX/RIS Mendeley + Zotero, Unicode, many authors, missing DOI/year/title, malformed entry.
- Service: normalize DOI, canonical key, candidate duplicate, merge, owner/workspace isolation, export snapshot.
- API: preview tidak membuat record; commit idempotent; user lain tidak bisa akses batch/citation/koneksi.
- Web: empty state, wizard preview/policy, readable error, deep link `?panel=cite` dan `?panel=cite:<id>`, regresi chat tab, expand density.
- BlockNote: insert multi-citation, reload, remove/remap missing, style switch, bibliography update.
- Integrasi: invalid/expired state, denied consent, token refresh, disconnect, repeated sync idempotent, 429 retry, Zotero key invalid.

### Command verifikasi

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

Perubahan schema/service: `bun run db:generate` → review migration → `bun run db:migrate` pada environment yang tepat; build `@aqsha/db`/`@aqsha/services` ke `dist/` sebelum smoke runtime bila kontrak shared berubah.

### Rollout

1. ⚠️ **Status (2026-07-11): feature flag `workspace_citations` DIHAPUS** — Citation Manager (tab Sitasi + "Tambahkan ke Sitasi" + editor sitasi + Astra) kini **default aktif untuk semua user**, tanpa gate. (Sebelumnya flag env OR `isAdmin`.) Tidak perlu set env untuk GA.
2. Monitor import error rate, records/batch, duplicate decision, render failure, export success, render-document latency.
3. ✅ Fase 3 (BlockNote) + Fase 4 (Astra) selesai; dokumen lama tanpa citation node tidak dimigrate paksa (reconcile hanya menulis usage saat save berikutnya).
4. Fase 5 sebagai beta terpisah (`provider_sync_beta`) setelah security review + app registration siap; Fase 6 menyusul di flag yang sama.
5. **OWNER sebelum rilis:** PROD migrate `0031` + `0032`; resolve kolisi migration `0031` dgn branch admin-role saat merge; restore `admin_entitlements` di DEV bila menjalankan itest artifacts/billing/workspaces (didrop branch sibling → 14 itest gagal, PRE-EXISTING, bukan dari citation work); E2E editor sitasi.

## 11. Ringkasan file yang diperkirakan disentuh

| Area | File/direktori |
|---|---|
| DB ✅ (F1) | `packages/db/src/schema/workspaceCitations.ts`, `workspaceCitationSettings.ts`, `citationImportBatches.ts` + repos + mig `0031` + `test/citations.test.ts`; sisa: `documentCitationUsages.ts` (F3), `integrationConnections.ts` (F5) |
| Services ✅ (F1) | `packages/services/src/citations/*` + export di `index.ts` + rate-limit rules `citations:*` di `quota/rate-limits.ts` + tests/fixtures; sisa: `packages/services/src/integrations/*` (F5–6) |
| API ✅ (F1) | `apps/api/src/routes/citations.ts` + mount di `index.ts` + `test/citations.test.ts`; sisa: `routes/integrations.ts` + worker `integration-sync` (F5) |
| Web panel ✅ | `apps/web/features/workspaces/utils/workspace-panel-model.ts` (+ test), `workspace-panel-context.tsx` (baru), `workspace-detail-client.tsx`, `workspace-side-panel.tsx` (baru; `workspace-chat-side-panel.tsx` TIDAK dihapus — masih dipakai artifact reader dgn `chrome="frame"`), prop `chrome` pada `CompactThreadChatPanel`, `workspace-board-toolbar.tsx` (aria PanelOpenButton) |
| Web citations ✅ | `apps/web/features/citations/{api.ts,types.ts,feature.ts,components/*}` (panel + bulk bar seleksi, list+row+filter, empty state, wizard import, dialog DOI/manual-edit/gaya/**duplikat**, detail sub-view + provenance, export menu), `apps/web/lib/{api-query.ts,feature-flags.ts}` |
| Web feature flag ❌ DIHAPUS (2026-07-11) | `apps/web/lib/feature-flags.ts` + `features/citations/feature.ts` DIHAPUS; gate dilepas dari `workspace-side-panel.tsx`/`workspace-library-surface.tsx`/`artifact-detail-view.tsx`; entri `.env.example` dihapus. Citation Manager default aktif. |
| Web settings | `apps/web/features/settings/lib/settings-menu.ts`, `apps/web/app/app/settings/integrations/page.tsx`, `features/settings/components/integrations-page.tsx` (F5) |
| Artifact bridge ✅ (F2) | `citation.service.ts` `createFromArtifact`/`resolveFromDoi`, `routes/citations.ts` `from-artifact`/`:id/resolve`; web threading `onAddToCitations` (`workspace-library-{context-menus,grid,board,surface}.tsx` + `artifact-render-panels.tsx` `ArtifactHeaderActions` + `artifact-detail-view.tsx`), `onCitationAdded` di `workspace-detail-client.tsx`, `detectedDocumentKind` ditambah ke `use-workspaces-data.ts`/`workspace-library-model.ts` |
| BlockNote ✅ (F3) | `blocknote-document-editor.tsx` (schema+picker+controller+`workspaceId`), `blocknote-editor-loader.tsx`, `blocknote-citation-schema.tsx`+`blocknote-citation-store.ts`+`citation-picker-dialog.tsx` (baru), `artifact-detail-view.tsx` (drill `workspaceId`); DB `documentCitationUsages.ts`+repo+mig `0032`; svc `citation-usages.ts`+`renderDocument`; route `render-document`; web `api.ts`/`types.ts`/`api-query.ts` (`useRenderDocumentCitations`) |
| Agent ✅ (F4) | `packages/chat-core/src/index.ts` (kind `workspace-citation`), `context.service.ts` hydration + `threads.ts` lane + web `composer.tsx`/`threads/api.ts`/`composer-inline-editor.ts`, tools `{search,get}-workspace-citation.ts`+`tools/index.ts`, subpath `@aqsha/services/citations`, chip di `citation-detail-view.tsx`/`citations-panel.tsx`/`workspace-side-panel.tsx` |
| Icons ✅ | `Quote`/`BookOpen`/`MessageSquarePlusIcon` sudah tersedia di `@aqsha/ui/icons` (tak perlu tambah untuk F3–4) |

## 12. Urutan keputusan sebelum mulai coding — SEMUA DITUTUP (2026-07-11)

Keputusan diambil mengikuti rekomendasi plan saat implementasi Fase 0–1:

1. ✅ Scope v1 = hanya `.bib`/`.ris`; EndNote XML di luar scope (ADR).
2. ✅ Empat style dikunci (`apa-7`/`ieee`/`vancouver`/`chicago-author-date`); custom CSL TIDAK diizinkan v1.
3. ⚠️ REVISI saat Fase 3: bibliography block dibuat **LIVE** (auto re-render dari store reaktif), BUKAN tombol "Update bibliography" manual — render server-side + cache React Query murah, live lebih ergonomis & tak menyimpan teks di blocksJson (konsisten keputusan #7).
4. ✅ Tanpa undo batch otomatis — koreksi via hapus per-citation (soft delete); `summary_json` batch tetap jadi audit.
5. ✅ ADR lisensi: citeproc dielek **CPAL-1.0**, server-side only (`docs/adr-citation-csl-engine.md`).
6. ✅ Label tab = "Sitasi" (sentence case).
7. ✅ `PanelOpenButton` tetap satu tombol tanpa indikator count (count tampil di toolbar kartu tab Sitasi).
