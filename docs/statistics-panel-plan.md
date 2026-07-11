# Plan: Interaksi Statistik di Chat + Tab "Statistik" di Side Panel

Status: Fase A + B IMPLEMENTED (2026-07-11, menunggu verifikasi visual A.5/B.9) — Fase C/D belum
Branch: `statistics` (sudah merge `origin/development` ad72354, berisi panel bertab 44b5608)
Prasyarat: fase 0–6 statistik (stats-viz output layer) + panel bertab — keduanya sudah ada di branch ini.

## 0. Progress implementasi

| Fase | Status | Catatan |
|------|--------|---------|
| A — kartu run + kartu dataset di chat | ✅ IMPLEMENTED 2026-07-11 (commit c9d3998) | Typecheck + lint + test hijau. Checklist visual A.5 BELUM dijalankan (butuh dev stack + sandbox Daytona). |
| B — tab "Statistik" di side panel | ✅ IMPLEMENTED 2026-07-11 (uncommitted) | Typecheck + lint web hijau; chat-core 53 · services 274 pass. Checklist visual B.9 BELUM dijalankan. |
| C — chip next-step + ekspor panel | ⬜ belum | Seam siap: `StatsListPanel` menerima `runKey`; `threadId` tinggal dioper dari shell utk route ekspor C.2/C.3. |
| D — backlog | ⬜ (by design, setelah A–C terpakai) | |

Realisasi Fase B — deviasi kecil & keputusan saat implementasi (plan diikuti apa adanya selebihnya):

- **B.3**: `ThreadStatsPanelItem` + param `statsGroups` di `buildThreadPanelLookups`; tipe `ThreadStatsGroup` di-`import type` dari `../api` (type-only, tak ada cycle — api.ts tak impor lib ini). List dibangun via map `toolCallId→group` lalu jalan-timeline (anchor `messageId`), sisa map di-append tanpa anchor.
- **B.5**: `hasStats` via `useThreadPanelData()` (subscribe lookups — shell ikut re-render saat streaming; diterima, sesuai D4). Tab Statistik tampil bila `hasStats || mode.kind === "stats"` (deep-link `?panel=s` thread kosong tetap punya tab utk activeKey). Guard draft-shell: `!threadId && stats` → context (pola sources). `threadId` SENGAJA belum dioper ke `StatsListPanel` (hindari unused param; Fase C yang menambah bersama route ekspor).
- **B.6**: `StatsListPanel` (agregat list item bertombol "Lihat di percakapan" + scoped reuse `StatsBlocksProvider`/`StatsVizGroup`). Subteks katalog DIBUANG (redundan dgn judul grup DB); hanya badge amber "kustom" sbg pembeda. Ikon: `ArrowLeftIcon` (chip kembali), `MessageSquareIcon` (lihat di percakapan).
- **B.7**: `scrollToMessage` di lib baru `scroll-to-message.ts` (`CSS.escape` + `scrollIntoView` smooth); anchor `data-message-id` HANYA di root `AssistantMessage` (pemilik tool-call).
- **B.8**: seam `onOpen` distruk di-wire via `useMessageInteractions().openStats` (dispatcher `ToolRow` panggil 1 hook tak-kondisional di puncak → aman rules-of-hooks; gate pada `statsGroup` ada). Blok inline: helper bersama chip diekstrak ke `stats-viz/stats-summary.tsx` (`StatsVerdictChips` + `statsCountsLabel`, dedupe dari `analysis-run-card`); `StatsVizGroup` dapat prop `onOpen?` opsional → header "Buka di panel" HANYA jalur inline (`StatsVizMarkdownComponent`/`StatsAppendix`), panel scoped reuse tanpa `onOpen`.

File tersentuh Fase B: `thread-panel-model.ts` · `thread-panel-context.tsx` · `thread-panel-data.ts` · `mastra-chat-thread-surface.tsx` · `thread-detail-shell.tsx` · `message-interactions.tsx` · `message-list.tsx` · `tool-row.tsx` · `stats-viz/{stats-block,analysis-run-card}.tsx` + `stats-viz/stats-summary.tsx` (baru) · `lib/scroll-to-message.ts` (baru) · `stats-list-panel.tsx` (baru).

Realisasi Fase A — deviasi kecil & keputusan saat implementasi (plan selebihnya diikuti apa adanya):

- **A.1**: META masuk `packages/chat-core/src/stats-viz.ts` langsung (bukan file sibling — subpath exports chat-core per-file). Label = `entry.title.replace(/\s*\(.*\)\s*$/, "")` mirror `shortTitle` agent → identik judul grup DB. META juga membawa `heavy` (uji_mediasi/cb_sem/sem_pls). Helper `summarizeStatsGroup()` (rekap verdict + n tabel/gambar) ikut mendarat DI SINI (dimajukan dari B.6) supaya struk A.3 dan list panel B memakai satu logika. Sync-test: `packages/services/test/stats-analysis-meta.test.ts`; test unit chat-core di `test/stats-viz.test.ts`.
- **A.2**: builder detail hidup di lib baru `apps/web/features/threads/lib/stats-run-detail.ts` (bukan inline mastra-timeline — file sudah 60K): `statsRunDetailFromArgs` / `statsDetailFromResult` / `datasetProfileSummary` / `statsArgsSummary`. Detail `analysis` dapat field tambahan `failed?/note?` (kartu error butuh `ok:false` + note tool). Parse profil = defensif TANPA zod (helper polos, pola mastra-timeline), baca tabel id `profile` **by nama kolom** + `meta.n`. Wiring di EMPAT jalur: `toolModel` (tool-call), `appendToolArgsDelta` (kartu terisi progresif dari parse args parsial), `completeToolPart` (artifactId diambil dari input row via `inputRowValue`), `toolModelFromInvocation` (rehydrate). "Peta tool berat" terealisasi sebagai `STATS_SANDBOX_TOOLS` → kondisi elapsed `tool-row` (bukan heavy-map /deep — itu mekanisme stall watchdog yang beda); elapsed running kartu ditangani kartu sendiri.
- **A.3**: `stats-viz/analysis-run-card.tsx`. GOTCHA rules-of-hooks: kind detail bisa BERUBAH antar-render (row generik running → kartu saat settle) → `ToolRow` jadi dispatcher tanpa hook, body lama dipindah ke `GenericToolRow`. Klik struk = prop `onOpen?` yang belum di-wire (bukan referensi `openStatsPanel` yang belum ada — TS) → Fase B tinggal mengoper handler. Warna verdict: `VERDICT_META` di `stats-decision.tsx` di-export sebagai `STATS_VERDICT_META`. Copy chip memakai label verdict existing lowercase ("2 terpenuhi" dst.), bukan "n lolos" — satu kosakata dengan blok inline.
- **A.4**: `stats-viz/dataset-profile-card.tsx`. Judul artifact TIDAK di-resolve (opsi "bila murah" tak terpenuhi — ToolRow tak pegang attachment pesan user) → fallback "Dataset"; `artifactId` tetap tersimpan di detail untuk kebutuhan nanti.
- **A.5 (sisa)**: verifikasi visual Chrome — upload CSV → profil (kolom Likert + warning missing), `uji_validitas` (running → struk + chip), `sem_pls` (copy bertahap), mapping salah/blocked (kartu error), compact panel.

File tersentuh Fase A: `packages/chat-core/src/stats-viz.ts` + `test/stats-viz.test.ts` · `packages/services/test/stats-analysis-meta.test.ts` (baru) · `apps/web/features/threads/lib/{timeline-types,mastra-timeline}.ts` + `lib/stats-run-detail.ts` (baru) · `components/{tool-row,message-list}.tsx` · `components/stats-viz/{analysis-run-card,dataset-profile-card}.tsx` (baru) + `stats-decision.tsx`.

## 1. Konteks & tujuan

Statistik adalah fitur unggulan (SPSS-parity untuk skripsi), tapi interaksinya di chat tampil seperti obrolan biasa: `run_analysis`/`profile_dataset`/`run_python_analysis` bahkan tidak terdaftar di `TOOL_LABELS` (`mastra-timeline.ts:1445`) → tampil sebagai tool row generik ikon wrench dengan slug ter-humanisasi. Hasil akhir (blok tabel/verdict inline) sudah bagus; yang hilang adalah *identitas momen analisisnya*: dataset tak terasa sebagai objek, uji yang berjalan tak terlihat sedang "bekerja" (SEM bootstrap 1–2 menit tampak hang), verdict tak scannable, dan tidak ada rekap.

Visi interaksi: **sesi analisis data yang berbentuk percakapan.** Chat-first dipertahankan; statistik mendapat bahasa visual + ritme interaksi sendiri di dalam chat, dan panel jadi ruang baca/rekapnya.

Empat masalah yang diselesaikan:

1. **Identitas proses** — run analisis & profil dataset jadi kartu khas, bukan tool row generik (Fase A).
2. **Rekap/navigasi** — setelah banyak uji, menemukan "hasil ANOVA tadi" = scroll-hunting → tab panel Statistik (Fase B).
3. **Tuntunan** — mahasiswa tak hafal urutan ritual (validitas → reliabilitas → asumsi → regresi) → chip next-step (Fase C).
4. **Discoverability ekspor** — ekspor docx/xlsx kini hanya via menyuruh Astra → tombol di panel (Fase C).

`runKey` = identitas tunggal pengikat: struk di chat ↔ item list panel ↔ view scoped ↔ scroll-to pesan.

## 2. Keputusan desain

| # | Keputusan | Alasan |
|---|-----------|--------|
| D1 | Mode panel baru `{ kind: "stats"; runKey?: string }` — agregat + scoped satu run, SATU tab | Mirror persis pola Sumber (`m` / `m:<id>`); scoped pakai chip kembali ke agregat |
| D2 | URL `s` (agregat) / `s:<runKey>` (scoped) | Prefix `s` belum terpakai (`c x m p a t q`); runKey tersanitasi (tanpa `:`) |
| D3 | Tab **hidden saat thread belum punya hasil analisis**, bukan disabled | Ikut keputusan Pratinjau ("hide when empty"); placeholder `disabled/hint:"segera"` dibuang |
| D4 | Data panel lewat `ThreadPanelLookups` (extend, bukan query baru di shell) | Surface sudah pegang `statsGroups` + timeline → sekalian dapat mapping runKey→messageId |
| D5 | Urutan list = urutan kemunculan di timeline, bukan `createdAt` | Route `stats-blocks` tak mengekspos `createdAt`; urutan pesan = mental model user |
| D6 | Penomoran Tabel/Gambar di panel = `StatsBlocksProvider` sendiri (mulai 1 per view) | Penomoran chat per-message render order — tak perlu dipaksakan sinkron |
| D7 | Ekspor panel = docx/xlsx level-thread via route API baru, unduhan langsung | `.sav` butuh `datasetArtifactId` → luar scope v1; per-run export belakangan |
| D8 | Blok inline chat dapat affordance "Buka di panel" | Jalur dua arah; `useThreadPanel()` null di compact panel → tombol otomatis hilang |
| D9 | Kartu run & kartu dataset = **detail kind baru di timeline** (`analysis` / `dataset-profile`), FE murni | Pola existing (`search-flat`, `plan`): mapping di `mastra-timeline.ts` dari tool part; backend/agent tak tersentuh |
| D10 | Chip verdict struk dibaca dari `statsGroupsByToolCallId` (blok DB ter-join), BUKAN parsing output tool | Map-nya sudah dioper ke message-list; satu sumber kebenaran dengan blok inline & panel; anti-forgery ikut gratis |
| D11 | Label manusiawi + kredit per analysis id = **const di `@aqsha/chat-core/stats-viz` + sync-test di services** terhadap katalog | `apps/web` DILARANG import `@aqsha/services`; pola persis vocab stance (const chat-core + sync-test) |
| D12 | Chip next-step = peta statis FE per analysis id, tap = prefill composer | Deterministik, instan, tanpa dependensi model; agent tetap bebas menyimpang saat user mengetik sendiri |
| D13 | TIDAK ada "mode statistik" yang membajak composer; blok hasil TETAP inline di narasi | Chat-first locked; narasi Bab 4 di sekeliling tabel adalah nilai jualnya |

---

## 3. Fase A — identitas statistik di chat (kartu run + kartu dataset) — ✅ IMPLEMENTED (lihat §0)

Dampak terbesar, FE murni. Semua styling komponen dalam main/panel WAJIB `@`-container variants (bukan `sm:/md:`).

### A.1 Katalog display-meta di chat-core

`packages/chat-core/src/stats-viz.ts` (atau file sibling `stats-catalog-meta.ts` dengan subpath sama):

- `export const STATS_ANALYSIS_META: Record<string, { label: string; credits: number }>` — 27 entri katalog + `profile` (label "Profil dataset", 0) + entri sintetis `custom` untuk `run_python_analysis`.
- Sync-test di `packages/services` (pola sync-test vocab stance): assert id, label, dan credits identik dengan katalog services — drift katalog ↔ meta gagal di CI.

### A.2 Detail kind baru di timeline

`apps/web/features/threads/lib/timeline-types.ts` — extend union `DeepStepDetail` (nama historis; sudah dipakai lintas chat biasa):

```ts
| {
    kind: "analysis";
    /** Id analisis katalog, atau "custom" untuk run_python_analysis. */
    analysis: string;
    /** Judul manusiawi run — judul grup DB bila sudah ada, else label META. */
    title: string;
    /** Ringkasan args mapping kolom (mis. "X1: X1.1–X1.5 · Y: Y.1–Y.4"), best-effort dari input. */
    argsSummary?: string;
    artifactId?: string;
    credits: number;
    /** runKey tersanitasi (mirror util agent) — tautan ke panel scoped saat grup DB sudah ada. */
    runKey: string;
  }
| {
    kind: "dataset-profile";
    artifactId: string;
    /** Hasil parse defensif output tool (kolom/tipe/likert/missing/shape) — lihat A.5. */
    profile: DatasetProfileSummary;
  }
```

`apps/web/features/threads/lib/mastra-timeline.ts`:

- `TOOL_LABELS` += `run_analysis: "Menjalankan analisis"`, `run_python_analysis: "Menjalankan analisis kustom"`, `profile_dataset: "Memprofil dataset"`, `list_analyses: "Mendata katalog uji"`, `export_analysis_results: "Mengekspor hasil analisis"`.
- Builder detail (sibling `search-flat` builder): tool part `run_analysis`/`run_python_analysis` → detail `analysis` dari input args (`analysis`, `args`, `artifactId`) + META; `profile_dataset` dengan output `ok:true` → detail `dataset-profile`. runKey FE = fungsi sanitasi yang SAMA dengan agent (`toRunKey` chat-core — sudah diekspor).
- `run_analysis`/`run_python_analysis`/`profile_dataset` masuk peta tool berat (spinner + elapsed persist; pola `search-literature` di heavy map).

### A.3 Kartu run analisis — `apps/web/features/threads/components/stats-viz/analysis-run-card.tsx`

Dirender `tool-row.tsx` saat `detail.kind === "analysis"` (cabang sibling `DeepSearchCards`, menggantikan baris generik):

- **Running**: ikon `ChartColumnIcon` + `title` + `argsSummary` + badge kredit ("10 kredit"; 0 → tanpa badge) + `ElapsedLabel`. Uji berat (`sem_pls`/`cb_sem`/`uji_mediasi`: credits ≥ 20 ATAU flag META `heavy`) → copy bertahap berbasis elapsed (pola copy per-fase /deep): 0–10 dtk "Menyiapkan sandbox…", lalu "Menghitung… (SEM-PLS: bootstrap ±1–2 menit)".
- **Sukses** (struk): baris ringkas — glyph ✓ + `title` + **chip verdict agregat** dihitung dari `statsGroupsByToolCallId.get(toolCallId)` (blok `stats-decision`): hijau "n lolos" · kuning "n perhatian" · merah "n tidak lolos" (hanya count > 0) + "n tabel · n gambar". Grup DB belum ter-fetch (jendela invalidasi) → struk tanpa chip, degrade mulus.
- **Klik struk** → `useThreadPanel()?.openStatsPanel(runKey)` (provider null / grup belum ada → struk non-klik). Sebelum Fase B mendarat, handler dibelakangi guard yang sama → Fase A bisa merge duluan.
- **Gagal / `ok:false`**: kartu error dengan konteks (title + dataset) + `note` tool yang memang sudah ramah (blocked kredit / mapping kolom salah).
- Warna verdict = satu sumber dengan blok inline (ekstrak konstanta warna dari `stats-decision.tsx` bila masih lokal).

Prasyarat wiring: `message-list.tsx` meneruskan `statsGroupsByToolCallId` (sudah tersedia di scope, baris ~347) ke `ToolRow` untuk tool part analisis.

### A.4 Kartu dataset — `stats-viz/dataset-profile-card.tsx`

Dirender saat `detail.kind === "dataset-profile"`:

- Header: ikon tabel + nama dataset (judul artifact bila resolvable murah — mis. dari attachment chips pesan user / query artifacts yang sudah ada; fallback "Dataset") + "n baris × m kolom".
- Body: chip per kolom — nama + tipe terdeteksi (badge kecil: Likert / numerik / kategorik) + ikon warning bila missing > 0; > ~24 kolom → collapse "+n kolom lagi".
- Footer kecil: total missing bila ada ("3 sel kosong di 2 kolom").
- `DatasetProfileSummary` di-parse defensif (zod, field opsional) dari `profile` output tool; **verifikasi bentuk persis output analisis `profile` `aqsha_stats` (contract.py) saat implementasi** — field yang tak ada → bagian UI-nya disembunyikan, bukan crash.

### A.5 Verifikasi Fase A — ⬜ visual BELUM (typecheck/lint/test sudah hijau)

- Thread baru: upload CSV → profil → kartu dataset (kolom Likert terdeteksi, missing warning).
- `uji_validitas`: kartu running (badge kredit, elapsed) → struk + chip verdict; klik struk no-op rapi (pra-Fase B).
- `sem_pls`: copy bertahap muncul; tak tampak hang.
- Mapping kolom salah → kartu error dengan note koreksi; kredit blocked → note blocked.
- Compact panel (workspace/explore): kartu tetap render, klik-ke-panel absen.

---

## 4. Fase B — tab "Statistik" di side panel — ✅ IMPLEMENTED (lihat §0)

### B.1 `apps/web/features/thread-experience/utils/thread-panel-model.ts`

- Tambah varian `| { kind: "stats"; runKey?: string }` di `ThreadPanelMode`.
- `ThreadPanelTab`: tambah `"statistics"`; `threadPanelTabOf`: `stats` → `"statistics"`.
- `serializeThreadPanelMode`: `stats` → `runKey ? "s:" + runKey : "s"`.
- `parseThreadPanelMode`: `"s"` → agregat; `"s:<runKey>"` → scoped (`"s:"` kosong → agregat, pola `m:`).
- `isThreadPanelPreviewMode`: TIDAK berubah (stats bukan preview slot).

### B.2 `thread-panel-context.tsx`

- `ThreadPanelValue` += `openStatsPanel: (runKey?: string) => void` (opener `useCallback` pola `openSourcesPanel`, masuk deps `useMemo`).

### B.3 `apps/web/features/threads/lib/thread-panel-data.ts`

- Tipe baru:
  ```ts
  export type ThreadStatsPanelItem = {
    runKey: string;
    toolCallId: string;
    /** Id pesan asisten pemilik tool call — anchor scroll-to (undefined bila tak ketemu). */
    messageId?: string;
    group: StatsGroup;
  };
  ```
- `ThreadPanelLookups` += `stats: ThreadStatsPanelItem[]` (+ `EMPTY_THREAD_PANEL_LOOKUPS`).
- `buildThreadPanelLookups`: param baru `statsGroups: readonly ThreadStatsGroup[] | undefined` →
  1. Map `toolCallId → group`.
  2. Iterasi messages→parts tool: toolCallId cocok → push `{ runKey, toolCallId, messageId: m.id, group }` urutan timeline; hapus dari map.
  3. Sisa map (part tak ketemu) di-append tanpa `messageId` — list tetap lengkap.

### B.4 `mastra-chat-thread-surface.tsx`

- Oper `statsGroups` (dari `useThreadStatsBlocks`, ~baris 310) ke `buildThreadPanelLookups`; tambah ke deps memo lookups.

### B.5 `thread-detail-shell.tsx`

- `hasStats = (lookups?.stats.length ?? 0) > 0` via `useThreadPanelData()`.
- Tabs: ganti placeholder → `...(hasStats ? [{ key: "statistics", label: "Statistik" }] : [])`.
- `selectTab`: `"statistics"` → `panel?.openStatsPanel()`.
- `panelContent`: `mode.kind === "stats"` → `<StatsListPanel runKey={mode.runKey} threadId={threadId} />`.
- Guard deep-link: `!threadId && mode.kind === "stats"` → perlakukan `context` (pola guard sources draft shell). Thread nyata tanpa hasil + `?panel=s` → panel render empty state; verifikasi `PanelTabsHeader` aman untuk activeKey tanpa tab (bila tidak: tampilkan tab saat mode aktif = stats).

### B.6 Komponen baru `thread-experience/components/stats-list-panel.tsx`

Pola `sources-list-panel.tsx` (IN-CARD, `DetailPanelShell`).

**Agregat** (`runKey` absen): eyebrow "n analisis"; list item per `ThreadStatsPanelItem` — judul grup + subteks id katalog / badge amber "kustom"; chip verdict agregat (logika SAMA dengan struk A.3 — ekstrak helper bersama, mis. `summarizeVerdicts(group)` di chat-core stats-viz); "n tabel · n gambar"; klik row → `openStatsPanel(runKey)`; tombol sekunder "Lihat di percakapan" → scroll-to (B.7), disabled tanpa `messageId`. Empty state: "Belum ada hasil analisis" + hint `/analisis`.

**Scoped** (`runKey` ada): chip kembali "‹ Semua analisis"; render penuh `<StatsBlocksProvider groups={satuGrup}><StatsVizGroup/></StatsBlocksProvider>` (reuse — banner kustom + "Lihat kode" ikut); tombol "Lihat di percakapan" di toolbar; runKey tak ketemu → empty state + kembali ke agregat.

### B.7 Scroll-to-message

- `message-list.tsx`: `data-message-id={message.id}` pada wrapper row (belum ada anchor DOM).
- Helper `scrollToMessage(messageId)`: `querySelector` + `scrollIntoView({ behavior: "smooth", block: "start" })`. Highlight kilat opsional (nice-to-have).

### B.8 Aktivasi silang dengan Fase A

- Struk A.3: guard klik dilepas → `openStatsPanel(runKey)` hidup.
- `StatsVizGroup` (blok inline): baris header kecil — judul + tombol ikon expand → `openStatsPanel(group.runKey)`; provider null → tak dirender. GOTCHA arah import threads → thread-experience sudah ada preseden (`thread-panel-data.ts` import `LIVE_PLAN_KEY`); bila lint boundary protes, angkat handler via props dari `message-list`.

### B.9 Verifikasi Fase B

- Tab muncul setelah run pertama; hidden di thread tanpa analisis; draft shell fallback Workspace.
- Agregat: urutan, chip verdict, badge kustom; klik row → scoped penuh (tabel/figur besar, "Lihat kode"); chip kembali; expand 30:70.
- "Lihat di percakapan" → scroll halus; struk chat → panel scoped; deep-link `?panel=s` / `?panel=s:<runKey>` survive refresh; runKey basi → empty state; mobile drawer OK.

---

## 5. Fase C — chip next-step + ekspor dari panel

### C.1 Chip next-step (pipeline ritual jadi terlihat)

- Peta statis `apps/web/features/threads/lib/stats-next-steps.ts`: `Record<analysisId, Array<{ label: string; prompt: string }>>` mengikuti ritual SKILL.md — mis. `uji_validitas` → [Uji reliabilitas], `uji_reliabilitas` → [Uji asumsi klasik, Deskriptif], `uji_normalitas/multikolinearitas/heteroskedastisitas` → [Lanjut regresi], `regresi_linear` → [Korelasi, Ekspor Bab 4]. `custom` & Tier 3 → tanpa saran (jangan sok tahu).
- Render: di bawah struk A.3, HANYA pada run analisis TERAKHIR di thread + turn settled (streaming selesai) — bukan di semua struk (noise + saran basi).
- Tap chip → prefill composer (pakai mekanisme set-teks composer yang ada — pola channel `selectionRefs`/ambient mention; verifikasi API pastinya saat implementasi), TANPA auto-send — user tetap pegang kendali.

### C.2 API route ekspor — `GET /threads/:id/analysis-export?format=docx|xlsx`

- `apps/api/src/routes/threads.ts`, sibling `/:id/references`: `assertOwner` → `AnalysisService.exportResults(db, { ownerUserId, threadId, formats: [format] })` → response bytes + `Content-Type`/`Content-Disposition` dari `EXPORT_SPEC`. TANPA membuat artifact (tombol = "kasih file"; tool = "simpan ke workspace"). Union `ok:false` (`export_empty`/`export_failed`) → `appError` terstruktur.
- Catatan: `exportResults` menjalankan sandbox `codeRun` heavy → FE wajib loading state jelas ("Menyiapkan file… bisa ~1 menit"), mutation tanpa retry. Tool-nya gratis → route juga tanpa debit.

### C.3 FE ekspor

- `features/threads/api.ts`: `useExportAnalysisResults(threadId)` — pola `useDownloadThreadReferences` (fetch → blob → anchor). Error via `readableApiErrorMessage`.
- `stats-list-panel.tsx`: dropdown `DownloadIcon` di `actions` `DetailPanelShell` ("Ekspor docx" / "Ekspor xlsx") — pola persis `ReferencesExportButton`.

### C.4 Verifikasi Fase C

- Chip muncul hanya di run terakhir pasca-settle; tap → composer terisi, tidak terkirim; run berikutnya → chip pindah.
- Ekspor: loading state, file terunduh benar; thread tanpa hasil → error ramah; double-click aman (mutation pending → tombol disabled).

---

## 6. Fase D — backlog lanjutan (di luar scope implementasi sekarang)

Dicatat supaya keputusan A–C tidak menutup jalannya; kerjakan setelah A–C terbukti dipakai:

- **D.1 Variable-mapper khusus** — upgrade layout `ask_questions` untuk mapping kolom → X1/X2/Y (dropdown per kolom dari profil dataset), menggantikan radio/freeform generik. Butuh desain resumeData; HITL flow existing tetap fallback.
- **D.2 Progress live di panel** — saat run berjalan, tab Statistik menampilkan row "sedang berjalan" (status dari timeline, bukan DB) di atas list.
- **D.3 Thumbnail figur** di list agregat (base64 sudah ter-fetch — murah, tinggal kebutuhan visual).
- **D.4 Ekspor per-run + `.sav`** — extend `exportResults` dengan filter `runKeys?: string[]`; `.sav` butuh picker dataset (`datasetArtifactId`).
- **D.5 Panel Statistik di compact chat** (workspace/explore) — menunggu compact panel wired `statsGroups` (open item lama).

---

## 7. Urutan implementasi & verifikasi menyeluruh

1. Fase A (A.1 → A.4) — bisa merge duluan, guard klik-panel menahan diri.
2. Fase B (B.1 → B.8) — panel + aktivasi silang struk/blok inline.
3. Fase C (C.1 → C.3).
4. Tiap fase: `bun run typecheck` + `bun run lint`; `bun run test` (chat-core kena A.1/helper verdict; services kena sync-test META + route C.2; api kena route). Chat-core META sync-test = pagar drift katalog.
5. Verifikasi visual Chrome per fase (checklist A.5 / B.9 / C.4) pada thread uji berisi: profil dataset + ≥2 uji katalog (1 ringan + 1 SEM) + 1 kustom.

## 8. Open questions (default sudah dipilih, bisa dioverride)

- OQ1: ekspor route ikut membuat artifact di workspace (paritas tool)? **Default: tidak** — unduhan langsung.
- OQ2: thumbnail figur di list agregat v1? **Default: tidak** (Fase D.3).
- OQ3: chip next-step memakai prompt bahasa natural ("Lanjutkan dengan uji reliabilitas untuk semua variabel") vs slash command (`/analisis ...`)? **Default: bahasa natural** — lebih jelas terbaca di composer sebelum dikirim.
