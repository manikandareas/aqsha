# Plan: Agent Answer Stream Redesign (UI Streaming)

> Dokumen desain + rencana implementasi. **SEMUA FASE SELESAI (6/6), branch `development`.**
>
> Penerus + perluasan langsung dari [`agent-activity-stream-plan.md`](./agent-activity-stream-plan.md)
> (Fase 1–3 + cleanup §12 SELESAI). Membangun **di atas** kontrak `ActivityEvent`,
> komponen `AgentRunBlock`, sanitizer no-leak, nesting sub-agen via `agent_id`, dan
> Accordion `/deep` yang sudah ada. **MEMBALIK** satu keputusan terkunci pendahulu
> (req 18: "jawaban akhir terpisah dari blok run") — lihat §4 D5.

## Status implementasi

| Fase                                          | Status                                                          | Catatan                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fase 0 — Pondasi data**                     | ✅ **SELESAI** — branch `development` (2026-06-14), uncommitted | Sanitizer `artifactId`/`action` + `query` (D6) + perlebar `listArtifacts`. Tanpa perubahan schema. Detail di "Fase 0 — yang dikerjakan".                                              |
| **Fase 1 — Urutan presisi (backend)**         | ✅ **SELESAI** — branch `development` (2026-06-14), uncommitted | Segmen `text`/`reasoning` ber-seq di `agentRunEvents` + `orderedPartsFromRun`. **Satu-satunya perubahan schema.** Barrier ordering (SDK EAGER). Detail di "Fase 1 — yang dikerjakan". |
| **Fase 2 — Penggabungan timeline (frontend)** | ✅ **SELESAI** — branch `development` (2026-06-14), uncommitted | `AssistantTurn` + `ToolRow` collapsible; konsumsi `orderedPartsFromRun` (urutan presisi); hapus split run/message. Tanpa perubahan schema. Detail di "Fase 2 — yang dikerjakan". |
| **Fase 3 — Kartu sub-agen**                   | ✅ **SELESAI** — branch `development` (2026-06-14), uncommitted | `SubagentCard` (satu kartu/sub-agen) + ringkasan progresif (running tool / roll-up) + chip "N berjalan". Helper kontrak murni, tanpa perubahan schema. Detail di "Fase 3 — yang dikerjakan". |
| **Fase 4 — Kartu artefak + side panel**       | ✅ **SELESAI** — branch `development` (2026-06-14), uncommitted | `ChatArtifactCard` + `ArtifactDetailPanel` (reusable page\|panel) + `ThreadPanelProvider` + `ChatArtifactProvider`; thread-detail panel mode. Tanpa perubahan schema. Detail di "Fase 4 — yang dikerjakan". |
| **Fase 5 — Parity + polish + cleanup**        | ✅ **SELESAI** — branch `development` (2026-06-14), uncommitted | Parity 3 surface (otomatis via `ChatThreadState`); v2 ringkasan sub-agen (`last_assistant_message`); hapus `artifactVersions`/`currentVersionId` mati (widen-migrate-narrow). Detail di "Fase 5 — yang dikerjakan". |

**Gerbang per fase (semua wajib hijau sebelum lanjut):**
`bun run typecheck` (5 paket) · `bun run lint` · `bun run --filter '@aqsha/agent-contracts' test` ·
`bun run --filter '@aqsha/agents' test` · `bun run --filter '@aqsha/convex' test` · `bun run --filter '@aqsha/app' test`
(paket web bernama `@aqsha/app`, bukan `@aqsha/web`).
Convex `npx convex dev --once` hanya di Fase 1 (segmentasi — satu-satunya yang menyentuh schema).

---

## Status implementasi — yang benar-benar dikerjakan

### Fase 0 — Pondasi data ✅ (gate hijau)

Sanitizer no-leak diperluas di sumber (`apps/agents/src/agent/activitySanitizers.ts`) — semua scalar baru di-allow-list + di-clamp di chokepoint tunggal:

- **`executeArtifact.result` → `{ artifactId, action }`** (prasyarat load-bearing kartu artefak Fase 4): `safeId` (helper baru) menerima HANYA token id-aman `^[A-Za-z0-9_-]+$` ≤128 char (buang prosa/path/URL/JSON), `action` lewat `safeEnum(["create","update","delete"])`. Body dokumen tak pernah ada di hasil → tak bisa bocor.
- **D6 — `query` di input `searchWeb`/`searchArxiv`** (helper `searchInput`): query yang DISUSUN MODEL (bukan prompt privat user) di-surface, di-clamp single-line ≤120 char. Tetap lewat chokepoint + review no-leak.
- **`safeLabel`/`safeErrorText` dikeraskan** (temuan review adversarial F1, LOW): memotong di SEMUA line terminator (`/[\n\r\u0085\u2028\u2029]/`), bukan hanya `\n` — interior CR / pemisah Unicode tak bisa menyelundupkan baris kedua lewat scalar (mempengaruhi `query`/`title`/`name`/`doi` + `safeErrorText` client-side).
- **`convex/agent/queries.ts:listArtifacts`** diperlebar additive: `+ source`, `+ updatedAt` (tanpa perubahan schema/index; `returns` tetap dilewatkan sesuai konvensi facade).
- **Sisi efek pra-ada:** `apps/web/app/layout.tsx` Clerk `appearance.baseTheme` → `theme` (memperbaiki break typecheck `@aqsha/app` yang sudah ada dari commit update-deps `821748c`; `baseTheme` di-`@deprecated` → `theme`) — membuka gerbang typecheck untuk semua fase.
- **Test:** `activitySanitizers.test.ts` (D6 query surfaced + clamp, line-terminator no-leak, `executeArtifact` result + reject non-id/enum, bridge metadata), `hooks.test.ts` (ekspektasi `searchWeb` tool_start kini membawa `query`).
- **Review adversarial no-leak (9 pertanyaan):** 1 temuan LOW (F1 single-line gap) → diperbaiki; sisanya dipatahkan (safeId tak bisa di-bypass, executeArtifact result tak punya body, normalizer `scalarsFrom` defense-in-depth, dll.).
- **Gate:** typecheck (5) · lint 0 error (12 warning pra-ada) · agent-contracts **56** · apps/agents **195** · convex **123** · @aqsha/app **74**.

### Fase 1 — Urutan presisi backend ✅ (gate hijau, satu-satunya perubahan schema)

**SPIKE (load-bearing):** menelusuri `@anthropic-ai/claude-agent-sdk@0.3.175 sdk.mjs` → generator `query()` **EAGER**: loop produser ter-detach mengisi antrian tak-berbatas; hook `PreToolUse` dipanggil sinkron saat frame dibaca dari stdout, MELEWATI antrian konsumen. Maka `tool_start` (hook) bisa tersimpan SEBELUM konsumen (`streamBridge`) memproses pesan asisten yang mengumumkan tool — `seq` tak bisa diandalkan dari interleaving alami. ([[sdk-stream-eager-ordering]])

**Mekanisme urutan presisi (barrier per-`tool_use_id`):** `apps/agents/src/agent/segmentCoordinator.ts` (baru). Bridge menutup segmen pendahulu (await upsert → seq ter-commit) lalu `release(toolUseId)`; hook `PreToolUse` `awaitSegmentClosed` sebelum menulis `tool_start` → `seq(segmen) < seq(tool_start)` deterministik. Hanya tool main-thread (`!parentAgentId`); sub-agen tak menunggu. Timeout 3 dtk + abort-signal sebagai jaring pengaman (cancel bail dini — temuan review #3).

**Perubahan:**

- Schema (satu-satunya): `agentRunEvents.segmentId: v.optional(v.string())` + index `by_run_segment` (`convex dev --once` push bersih).
- `convex/agent/service.ts`: mutation `upsertRunEventBySegmentId` (lookup `by_run_segment.unique()` → patch-keep-seq / insert `nextRunEventSeq`).
- Store: `upsertRunEventBySegmentId` di `types.ts` + `memoryStore.ts` (referensi) + `convexStore.ts`.
- Kontrak `run.ts`: tipe event `text_segment`/`reasoning_segment` + `segmentPayloadSchema`.
- `streamBridge.ts`: emisi segmen coalesced (1 baris/segmen, re-patch), reasoning-sebelum-text sekuensial, `segmentTextOffset` + strip `LEADING_BREAKS` (artefak join `\n\n`), `turnKey` unik per dispatch (resume tak bentrok), silent tetap release barrier; pipeline non-blocking terpisah agar loop stream tak terhambat.
- `hooks.ts`: `PreToolUse` await barrier (+abort signal). `runManager.ts`: wiring coordinator+turnKey (executeTurn + tiap fase deep).
- Kontrak `activity.ts`: `orderedPartsFromRun(run)` + tipe `OrderedPart` — gabung segmen↔node by seq, anak sub-agen tetap ter-nest, `null` → fallback legacy (`uiMessageFromRow`).
- **Cap (review #1 MED):** `listRuns.MAX_EVENTS_PER_RUN` 200 → 500 (selaras `MAX_RUN_EVENTS`) agar segmen jawaban akhir (seq tertinggi) tak terpotong; read-amp ~5k baris worst-case (aman skala kini, paginasi = follow-up).
- **Test:** `segmentCoordinator.test.ts` (barrier/abort/timeout), `segmentOrdering.test.ts` (bukti `seq(segmen)<seq(tool)` di bawah urutan EAGER hook-duluan), `streamBridge` (coalescing 1-baris + silent), `activity` `orderedPartsFromRun` (merge/nested/legacy-null).
- **Review adversarial (9 vektor, 8 dipatahkan dengan trace):** 3 temuan laten → #1 cap (diperbaiki), #3 late tool_start saat cancel (diperbaiki: abort signal), #2 HITL resume = 2 pesan/run → dibawa ke Fase 2 (untuk timeline tunggal justru benar: satu `AssistantTurn` per RUN; jawaban final dari `message.text` kanonik).
- **Gate:** typecheck (5) · lint 0 error · agent-contracts **56** · apps/agents **206** · convex **123** · @aqsha/app **74** · `convex dev --once` push sukses.

### Fase 2 — Penggabungan timeline frontend ✅ (gate hijau, tanpa perubahan schema)

Satu `AssistantTurn` per RUN menggantikan pasangan sibling `AgentRunBlock` + `MessageRow`; jawaban + reasoning + tool kini satu parent berurut (urutan presisi dari Fase 1).

- **Kontrak (`uiAdapters.ts`):** `UiResearchRun.orderedParts: OrderedPart[] | null` diprakomputasi di `uiRunFromRow` via `orderedPartsFromRun(row)` — web `ResearchRun` tak membawa `events`, jadi adapter (tempat `events` ada) yang menderivasi; UI membaca `run.orderedParts`. Additive.
- **`utils/turn-model.ts` (baru, murni + unit-test):**
  - `pairRunsWithTurns(messages, runs, pendingHitlByRun)` ganti `interleaveRunsWithMessages` → emit `{kind:"user"} | {kind:"assistant-turn", message?, run?, hitl?}`, **satu turn per RUN**. Pesan asisten dipetakan ke run via jendela `createdAt` (run terakhir yang mulai ≤ `message.order`); pesan TERAKHIR run = jawaban final. Edge: (a) run tanpa pesan → `message:undefined` (shimmer); (b) gagal → tetap satu turn; (c) banyak run/prompt (deep+retry) → satu turn per run (lama collapse via header terminal); (d) yatim → turn (saat pesannya tercapai atau trailing).
  - `buildTurnParts(message, run)` → `TurnPart[]`. Utama: `run.orderedParts` (reasoning↔tool↔text by seq). **Segmen text TERAKHIR (max seq) dibuang** — jawaban final dari `message.text` kanonik (aman truncation: event segmen bisa ter-clamp, `message.text` tidak); segmen text intermediate render inline (`intermediate-text`). Fallback (legacy `orderedParts===null` / pesan tanpa run): reasoning pesan + node `run.activity` urut seq.
  - `toolRowModel(node)` murni: allow-list scalar (`query`,`resultCount`,`doi`,`checksRun`,`verdict`,`checked`,`verified`,`flagged`,`questionCount`,`hasResults`,`title`,`name`) → label ID sentence-case; **default-deny** (`tool`/`agentId`/`agentType`/`phase`/`artifactId`/`action` tak pernah muncul); verdict→VERDICT ID, boolean→Ya/Tidak.
- **`components/assistant-turn.tsx` (baru):** header run (`RunHeader`: Shimmer ringkasan saat aktif, toggle dev-mode, chip sumber, error di header saat gagal) → parts berurut (grouping fase deep ke `DeepPhaseTimeline`, `filterByVisibility` per node, anchor HITL di node `approval`) → `CitationIntegritySummary` (deep) → jawaban final (`StreamingResponse` di-key per `message.id` saat streaming, else `MessageResponse`) + `AssistantMessageActions` + `MessageSourceCount`.
- **`components/tool-row.tsx` (baru):** Collapsible (acuan `plan.tsx`/`reasoning.tsx`). Header: `NodeStatusIcon` + judul (Shimmer saat running) + chip `node.description`. Body: baris `toolRowModel` scalar (sentence-case ID) + raw metadata di dev-mode. Tanpa scalar → baris polos (tak collapsible).
- **Integrasi:** `chat-thread-state.tsx` → `pairRunsWithTurns` → `<UserMessageBubble>` | `<AssistantTurn>`; interaksi HITL pending dipisah dari stream pesan, di-key per `runId` (`pendingHitlByRun`) → **single-render** di node `approval` (tak ada lagi MessageRow sintetis ganda). `message-row.tsx`: ekstrak `UserMessageBubble` + ekspor primitif asisten (`StreamingResponse`/`AssistantMessageActions`/`MessageSourceCount`/`getMessageText`), hapus `MessageRow`. `run-progress.tsx`: ekspor `NodeStatusIcon`/`toneClass`/`formatRunDuration`/`findHeadlineNode`/`DeepPhaseTimeline`/`ActivityNodeRow`/`NodeLine`/`nodeDuration`/`metadataLine`, leaf tool → `ToolRow`, **hapus `AgentRunBlock`** (dilipat ke `AssistantTurn`). `transcript-model.ts`: sisakan `sortTranscriptMessages`/`isRunActive` (hapus `interleaveRunsWithMessages`/`interleavedEntryKey`/`entryGapClass`/`TranscriptEntry`).
- **Smoothing:** `StreamingResponse` (`useSmoothText`) di-key per `message.id` di dalam `AssistantTurn` (turn di-key per run id, stabil; jawaban di-key per message id → kursor reset per pesan, tak bocor antar giliran — regresi pendahulu dijaga).
- **Parity:** 3 surface berbagi `ThreadChatSurface` (`chat-thread-state.tsx`) → satu perubahan mencakup thread-detail main + workspace panel + Explore panel; `compact` & `ComposerMentionsProvider` (level shell) tak tersentuh; `threadWorkspaceId` tetap di tipe prop (parity call-site).
- **Test (web):** `turn-model.test.ts` — `pairRunsWithTurns` (streaming-sebelum-teks, gagal, deep, retry, yatim, HITL-resume-2-pesan, attach pending HITL), `buildTurnParts` (ordered + drop final segment, intermediate inline, fallback legacy), `toolRowModel` (chip+rows, default-deny, verdict/boolean ID); `transcript-model.test.ts` ramping (`sortTranscriptMessages`/`isRunActive`).
- **Scope:** `executeArtifact` = `ToolRow` biasa (kartu klik = Fase 4); `subagent` = `ActivityNodeRow` nested (SubagentCard = Fase 3).
- **Review adversarial (4 vektor):** smoothing (key per message id ✓), HITL single-render (anchor node approval + flag, fallback akhir ✓), parity 3 surface (komponen tunggal bersama ✓), urutan parts (`orderedPartsFromRun` pra-sort + final dari message.text ✓).
- **Gate:** typecheck (5) · lint 0 error (12 warning pra-ada) · agent-contracts **56** · apps/agents **206** · convex **123** · @aqsha/app **85**. Tanpa `convex dev --once` (tak menyentuh schema).

### Fase 3 — Kartu sub-agen ✅ (gate hijau, tanpa perubahan schema)

Render sub-agen nested-rekursif (`ActivityNodeRow` → `NodeLine` + `<ol>` ber-`border-l`) diganti **satu `SubagentCard` dinamis** per node `type:"subagent"`, + chip "N berjalan". v1 ringkasan berbasis TOOL children (prosa live sub-agen dibuang di streamBridge — v3 ditangguhkan). Tanpa perubahan backend/schema.

- **Kontrak (`activity.ts`) — helper MURNI additive (no field baru di `ActivityEvent`):**
  - `subagentSummary(node)` — terminal roll-up dari tool children: `"{n} pencarian"` (jumlah child tool) + `", {m} sumber"` (jumlah `resultCount` ter-allow-list). **Default-deny:** tanpa tool child & tanpa source count → `node.title` (label sub-agen), tak pernah data mentah.
  - `subagentCurrentActivity(node)` — running: judul child tool running **ber-seq tertinggi** (deterministik, anti-flicker); `undefined` bila belum ada child running (kartu fallback ke `node.title`).
  - Keduanya pakai `subagentToolChildren` (filter `type:"tool"`) + scalar allow-list yang sama (`resultCount`) — tak ada materialisasi field; komponen yang memanggil (kontrak minimal).
- **`utils/turn-model.ts` (web, murni + unit-test):**
  - `subagentCardModel(node, {devMode})` → `{ title, isRunning, summary, children, forceExpanded }`. `summary` = `subagentCurrentActivity` (running) / `subagentSummary` (terminal); `forceExpanded` = devMode (children tampil tanpa expand).
  - `runningSubagentCount(nodes)` → `nodes.filter(type==="subagent" && status==="running").length` (untuk chip).
- **`components/subagent-card.tsx` (baru):**
  - `SubagentCard` — judul = `node.title`; baris ringkasan dinamis (running → Shimmer; terminal → teks); ikon via `NodeStatusIcon`; durasi via `nodeDuration`. Tool children **disembunyikan** di balik `Collapsible` (acuan `ToolRow`), di-render ulang lewat `ActivityNodeRow` (tool → `ToolRow`); **dev-mode** → children tampil inline (`forceExpanded`).
  - `SubagentRunningChip` — "{n} berjalan" (Shimmer) + "· Menunggu {durasi}"; `null` saat 0 running.
- **Integrasi:**
  - `run-progress.tsx` — `ActivityNodeRow` cabang baru `node.type==="subagent"` → `<SubagentCard>` (jalur rekursif nested sub-agen LAMA dihapus, anti double-render). `DeepPhaseTimeline` terima prop `run?` opsional → render `<SubagentRunningChip>` di `AccordionContent` fase (durasi `formatRunDuration(run)`).
  - `assistant-turn.tsx` — `flushPhases` oper `run` ke `DeepPhaseTimeline`; TurnPart `kind:"subagent"` (top-level, defensif) → chip sekali di atas kartu + `<SubagentCard>`.
- **No-leak:** kartu/ringkasan/chip HANYA scalar allow-list lewat helper kontrak; `agentId`/`agentType` tetap dev-mode only (`metadataLine`), tak pernah ke user.
- **Parity:** `SubagentCard`/chip dipakai lewat `AssistantTurn` + `run-progress` yang dibagi `ChatThreadState` → otomatis mencakup thread-detail main + workspace panel + Explore panel.
- **Test:** agent-contracts `subagentSummary` (roll-up / count-only / default-deny) + `subagentCurrentActivity` (seq tertinggi anti-flicker / none-running / no-children); @aqsha/app `subagentCardModel` (ringkasan running vs terminal, forceExpanded dev-mode) + `runningSubagentCount`.
- **Review adversarial:** anti-flicker (pilih seq tertinggi deterministik ✓), no-leak (allow-list scalar via helper ✓), parity 3 surface (komponen bersama ✓), kartu vs nested-rekursif lama (cabang subagent short-circuit, jalur lama mati dihapus → tak double-render ✓), chip hanya saat ≥1 running (`null` di 0 ✓).
- **Gate:** typecheck (5) · lint 0 error (12 warning pra-ada) · agent-contracts **62** · apps/agents **206** · convex **123** · @aqsha/app **90**. Tanpa `convex dev --once` (tak menyentuh schema).

### Fase 4 — Kartu artefak + side panel ✅ (gate hijau, tanpa perubahan schema)

`executeArtifact` (tool node, `metadata.tool==="executeArtifact"` — diskriminator allow-list, bukan judul) kini dirender **kartu artefak yang dapat diklik** alih-alih `ToolRow`; klik → side panel (thread-detail) atau deep-link (panel compact, D2).

- **Presentasi bersama (murni + unit-test):** `apps/web/components/artifact-presentation.ts` (`artifactTypeLabel`/`provenanceLabel`/`formatArtifactYear`, tanpa ikon) diekstrak dari `library-artifact-card.tsx`; ikon-per-tipe pindah ke **komponen `ArtifactTypeIcon` di `packages/ui/src/icons.tsx`** (Hugeicons, tanpa lucide) — dipakai library card + chat card (tanpa regresi). Komponen (bukan `const Icon = fn()`) → tak melanggar `react-hooks/static-components`.
- **View-model murni (`turn-model.ts`):** `TurnPart` varian `artifact`; `isArtifactToolNode(node)`; `chatArtifactCardModel(node, artifactById)` → `{artifactId, title, artifactType, action, live, found, source, createdAt, updatedAt, workspaceId}` (running tanpa id → `live` Shimmer; resolusi id↔`artifacts`; fallback judul node; default "Dokumen"). `nodePart` me-route node artefak → part `artifact` (jalur ordered + fallback legacy).
- **`components/chat-artifact-card.tsx` (baru):** live → Shimmer "Menulis/Memperbarui dokumen…"; terminal → kartu (ikon tipe, judul, "Dibuat/Diperbarui · tanggal", provenance, label tipe). Klik: thread-detail (`!compact` + provider) → `openArtifactPanel(artifactId)`; compact → deep-link `/app/workspaces/[ws]/artifacts/[id]`; tanpa id/ws → statis.
- **`components/chat-artifact-context.tsx` (baru):** `ChatArtifactProvider({artifacts, compact})` di-mount di `ChatThreadState` (3 surface) → kartu di kedalaman transcript resolve `artifactById` + `compact` tanpa prop-drill.
- **`components/thread-panel-context.tsx` + `utils/thread-panel-model.ts` (baru, reducer murni + test):** mode `closed | context | {artifact}` (`ThreadPanelProvider`, meniru `ComposerMentionsProvider`); `openArtifactPanel`/`openContextPanel`/`backToContext`/`closePanel`/`setOpen`. SATU slot `ResponsiveSidePanel`: mode artefak MENGGANTIKAN panel library (tombol kembali). `ThreadDetailShell` → `ThreadDetailShellView` (di dalam provider): `rightPanelOpen=isOpen`, `onRightPanelOpenChange=setOpen` (mobile/header toggle sinkron); provider di-`key` per thread (reset saat ganti thread).
- **`ArtifactDetailView` reusable (`features/workspaces/components/artifact-detail-view.tsx`):** ekstrak inner `ArtifactDetailPage` → varian `page` (route penuh, tanpa regresi: `<main min-h-svh>` + breadcrumb) & `panel` (toolbar back+close, workspaceId di-derive dari `detail.artifact.workspaceId`, mengisi slot panel tanpa re-frame). Data: `api.artifacts.get` + `getRenderPayload`. **Markdown:** halaman = editor BlockNote editable, key STABIL (`:markdown`, anti-churn autosave); panel = **viewer read-only** (render `markdown` via `MessageResponse`) di-key `updatedAt` → panel ikut update saat agen menulis ulang dokumen markdown (perbaikan temuan review adversarial: key markdown stabil sebelumnya membuat panel basi untuk tulisan agen — markdown = tipe default tulisan agen). Non-markdown (paper/url) di-key `updatedAt` di kedua varian. `artifact-detail-page.tsx` = wrapper tipis; `ArtifactTitleBreadcrumb` di-export.
- **Convex (tanpa schema):** `agent/queries.ts:listArtifacts` proyeksi `+workspaceId` (target deep-link compact; agen selalu me-resolve workspace di `service.applyArtifactAction` → tak null). `ResearchArtifact` `+source/+updatedAt/+workspaceId`.
- **No-leak:** `artifactId` = `safeId` opaque; `action` enum; `title` allow-list (sudah dipakai ToolRow). Tak ada query Convex baru.
- **Test:** @aqsha/app `artifact-presentation` (label/provenance/year), `chatArtifactCardModel` (live/create/update/resolusi/fallback), `isArtifactToolNode`, `buildTurnParts` artefak (ordered+legacy), `thread-panel-model` reducer. convex `listArtifacts` proyeksi membawa `workspaceId` (string, tak null).
- **Gate:** typecheck (5) · lint 0 error (12 warning pra-ada) · agent-contracts **62** · apps/agents **206** · convex **123** · @aqsha/app **109**. Tanpa `convex dev --once`.

### Fase 5 — Parity + v2 ringkasan + cleanup ✅ (gate hijau, satu perubahan schema = cleanup)

- **A) Parity 3 surface (D2) — otomatis via arsitektur Fase 4.** `ChatArtifactProvider` di `ChatThreadState` (dibagi thread-detail main + `WorkspaceChatSidePanel` + `ExploreChatSidePanel` lewat `CompactThreadChatPanel`, `compact=true`) → kartu + deep-link langsung berlaku di 3 surface tanpa kode tambahan. `ThreadPanelProvider` hanya di thread-detail (satu slot panel); surface compact deep-link (D2). Checklist `apps/web/AGENTS.md` §13 hijau.
- **B) v2 ringkasan sub-agen (backend, additive):** `hooks.ts` `subagent_stop` baca `hookInput.last_assistant_message` → `sanitizeSubagentSummary` (baru, = `safeLabel`: single-line ≤120, no-leak) → `payload.summary`. `run.ts` `subagentPayloadSchema.summary?`. `activity.ts`: `ActivityEvent.summary?` (baru, opsional) + `safeSummary` (defense-in-depth ≤120) di `subagent_stop` → `node.summary`; `subagentSummary` UTAMAKAN `node.summary` saat terminal, fallback roll-up tool (Fase 3 tetap hijau). payloadJson open → tanpa perubahan Convex schema.
- **C) Cleanup tabel/field MATI (D3) — satu-satunya perubahan schema:** hapus tabel `artifactVersions` + field `artifacts.currentVersionId` (audit: 0 penulis di codebase). Bersih: `accountCleanup/artifacts.ts` (blok query+delete+storage loop), `agent/queries.ts` (proyeksi `currentVersionId`), `apps/web .../types/index.ts` (`currentVersionId?` + `version?`). **Data eksisting (sadar + dicatat):** dev punya **4 baris legacy** `currentVersionId` (versi kode lama, kini tak ada penulis) → **widen-migrate-narrow**: restore field+tabel sementara + migrasi sekali `clearDeadVersionPointers` (paginate, patch `undefined`, idempotent) → `clearDeadVersionPointers({cursor:null})` = `{cleared:4, isDone:true}` → hapus field+tabel+migrasi → `convex dev --once` **push bersih** (tabel+2 index `artifactVersions` terhapus). **⚠️ PROD:** `convex deploy` schema sempit ini akan GAGAL bila prod menyimpan baris `currentVersionId` legacy — owner harus migrasi dulu (re-introduce `clearDeadVersionPointers` dari git commit migrasi, jalankan, baru deploy sempit); prod greenfield (AGENTS.md) → kemungkinan nihil.
- **Test:** agents `sanitizeSubagentSummary` (single-line/CR/U+2028 cut, clamp ≤120, no-leak key/path) + hooks `subagent_stop` membawa summary tersanitasi & `subagent_start` tidak; agent-contracts `subagentSummary` prioritas `node.summary` (v2) + fallback roll-up + end-to-end `activityEventsFromRun` membawa summary ke node; convex `listArtifacts` tanpa `currentVersionId` + `cleanupOwnerArtifacts` (tanpa `artifactVersions`).
- **Gate:** typecheck (5) · lint 0 error (12 warning pra-ada) · agent-contracts **65** · apps/agents **213** · convex **124** · @aqsha/app **109** · `convex dev --once` push bersih.

---

## 1. Konteks & masalah

Owner ingin tampilan streaming jawaban agen menyerupai ChatGPT/Cursor (4 referensi
screenshot). Empat perilaku target:

1. **Satu parent berurut.** Reasoning ↔ pemanggilan tool ↔ reasoning ↔ tool ↔ teks final,
   semuanya dalam **urutan eksekusi alami** di **satu parent**. Saat ini reasoning+teks
   dan timeline aktivitas dirender sebagai **dua blok sibling terpisah**.
2. **Tool row collapsible.** Tiap pemanggilan tool adalah baris yang bisa diklik; saat
   dibuka menampilkan ringkasan input/hasil tool (mis. query pencarian + jumlah hasil).
3. **Artefak.** Indikator "sedang menulis/menyunting dokumen" yang live, plus **kartu
   artefak** yang dapat diklik → membuka **side panel** persis seperti panel workspace di
   halaman thread, menampilkan detail artefak.
4. **Sub-agen.** **Satu kartu per sub-agen** dengan ringkasan **dinamis/progresif**
   (mis. "Meneliti…" → "Menulis respons"), bukan list nested rekursif. Referensi
   memperlihatkan beberapa kartu sub-agen paralel + chip "N berjalan".

### Akar masalah (yang membuat ini bukan sekadar perubahan CSS)

Satu giliran agen dipersist lewat **dua kanal paralel yang tidak terurut bersama**:

| Kanal                   | Sumber                                                                    | Bentuk                                                          | Urutan                  |
| ----------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------- |
| **1. Teks + reasoning** | `streamBridge.ts` → `chatMessages.text` / `.reasoning`                    | **Dua string blob** yang digabung `\n\n` lintas seluruh giliran | TIDAK ada per-langkah   |
| **2. Event aktivitas**  | SDK hooks → `agentRunEvents` (`tool_start/tool_end/subagent_*/phase_*/…`) | Baris diskret per event                                         | `seq` monotonik per run |

Tidak ada kunci urutan bersama yang menautkan satu potongan reasoning ke pemanggilan tool
yang menyelanya. Maka perilaku #1 (urutan presisi `reasoning → tool → reasoning → teks`)
**tidak bisa direkonstruksi dari data tersimpan saat ini** — informasi urutannya hilang di
sumber. Ini menjadikan pekerjaan ini perubahan **backend + kontrak + frontend**, bukan
hanya render.

Kabar baiknya: **urutan eksekusi sebenarnya tetap teramati di satu titik.**
`runManager.executeTurn` mengonsumsi stream SDK dalam satu loop
(`for await (const message of handle.stream)`), dan hook tool (`PreToolUse`/`PostToolUse`)
adalah callback SDK yang dipicu sinkron, ber-selang-seling dengan pesan
`assistant`/`stream_event` di loop yang sama. Jadi urutan "reasoning → tool → reasoning →
teks" tersedia di tempat `StreamBridge.handle` dan `store.appendRunEvent` keduanya dipanggil
— yang hilang hanya **satu ruang seq yang mencakup keduanya** (diisi di Fase 1).

---

## 2. Arsitektur saat ini (ground truth)

| Aspek                | File                                                                                            | Perilaku                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render transcript    | `apps/web/.../components/chat-thread-state.tsx:183-219`                                         | Map `interleavedEntries`: `kind:"run"` → `<AgentRunBlock>`, lainnya → `<MessageRow>`, sebagai **div sibling terpisah**.                                             |
| Pairing run↔pesan    | `apps/web/.../utils/transcript-model.ts:18-94`                                                  | `interleaveRunsWithMessages`: run di-bucket per `promptMessageId`, di-emit sebagai entry sibling sebelum pesan asisten.                                             |
| Blok aktivitas       | `apps/web/.../components/run-progress.tsx:37-152`                                               | `AgentRunBlock` render `run.activity` (header collapsible + node tool/sub-agen/fase nested). Prop `artifacts` **diterima tapi tak pernah dirender** (`:43`).        |
| Pesan asisten        | `apps/web/.../components/message-row.tsx:59-128,270-285`                                        | `getMessageReasoning()` → satu `<Reasoning>` blob; `getMessageText()` → satu `<MessageResponse>`/Streamdown. Tanpa tool/step part.                                  |
| Adapter pesan        | `packages/agent-contracts/src/uiAdapters.ts:84-105`                                             | `uiMessageFromRow` → `parts: [reasoning?, text?]` (urutan fix, bukan eksekusi).                                                                                     |
| Adapter run          | `packages/agent-contracts/src/activity.ts:402-879`                                              | `activityEventsFromRun` → pohon `ActivityEvent` (fold tool, nest sub-agen via `agent_id`/`parentAgentId`, gate visibility).                                         |
| Stream backend       | `apps/agents/src/agent/streamBridge.ts:55-261`                                                  | Akumulasi `committedText`/`committedReasoning` (2 string), flush koalessing ~250ms / 800 char via `updateMessageText`, non-blocking (1 write in-flight + trailing). |
| Emit event           | `apps/agents/src/agent/hooks.ts` + `runManager.ts` + `interactions.ts`                          | `tool_*`, `subagent_*`, `phase_*`, `interaction_*`, `citation_check`, `compaction`, `error`, `run_status`.                                                          |
| seq                  | `packages/convex/convex/agent/service.ts:394-418` + `service/model.ts:194-204`                  | `nextRunEventSeq` = `(last?.seq ?? -1) + 1`, di dalam transaksi mutasi (OCC per run).                                                                               |
| Schema               | `packages/convex/convex/schema.ts:592-643`                                                      | `chatMessages {text, reasoning?, runId, status}`; `agentRunEvents {runId, seq, type:string, payloadJson:string, createdAt}` index `by_run_seq`.                     |
| Artefak (tulis)      | `apps/agents/src/tools/artifacts.ts` → `agent/service.ts:764-847` → `artifacts.ts:1253-1374`    | `executeArtifact` tulis baris `artifacts` (+`source:"agent"`, `threadId`) + `artifactContents`. **`artifactVersions`/`currentVersionId` tak pernah ditulis.**       |
| Artefak (baca panel) | `convex/artifacts.ts:246,361`                                                                   | `api.artifacts.get` (metadata+konten) + `api.artifacts.getRenderPayload(artifactId)` (action: body siap-render per tipe).                                           |
| Side panel thread    | `thread-detail-shell.tsx:46,66-81` + `detail-split-layout.tsx` + `responsive-side-panel.tsx:32` | Satu boolean `contextPanelOpen`; satu target panel (library/global-context); chrome via `panelSurfaceClass({framed:true})`.                                         |

---

## 3. Arsitektur target

Satu komponen **`AssistantTurn`** per giliran asisten yang menerima
`{ message, run, artifacts, sources, hitlActions, onOpenArtifact, compact }` dan merender
**satu list `TurnPart[]` berurut** lalu jawaban final + aksi pesan — menggantikan pasangan
sibling `AgentRunBlock` + `MessageRow`.

```ts
// apps/web/features/thread-experience/utils/turn-model.ts (baru)
type TurnPart =
  | { kind: "reasoning"; text: string; isThinking: boolean }
  | { kind: "tool"; node: ActivityEvent } // ToolRow collapsible
  | { kind: "subagent"; node: ActivityEvent } // SubagentCard (satu kartu dinamis)
  | { kind: "phase"; node: ActivityEvent } // seksi Accordion /deep
  | {
      kind: "artifact";
      artifactId?: string;
      title: string;
      action: "create" | "update";
      live: boolean;
    }
  | { kind: "hitl"; part: HitlToolPart } // diselipkan di posisi seq approval
  | { kind: "answer"; text: string; isStreaming: boolean }; // Streamdown body
```

Aliran data:

```
listMessages ─┐                         ┌─ uiMessageFromRow ─ (text/reasoning fallback)
              ├─ @aqsha/agent-contracts ┤
listRuns ─────┘                         ├─ activityEventsFromRun ─ (pohon: sub-agen/fase/dev-mode)
                                         └─ orderedPartsFromRun  ─ (FASE 1: flat by seq)
                                                    │
                  apps/web buildTurnParts(message, run, ordered?) → TurnPart[]
                                                    │
                                            <AssistantTurn>  →  reasoning / ToolRow / SubagentCard /
                                                                phase / ChatArtifactCard / HITL / answer
```

**Yang dipertahankan & dipakai ulang:** `Reasoning`, `MessageResponse` (Streamdown),
`useSmoothText`, `AssistantMessageActions`, `MessageSourceCount`, `DeepPhaseTimeline`,
`CitationIntegritySummary`, `MessageHitlParts`, `Shimmer`/`ThreadActivityIndicator`,
`NodeStatusIcon`/`toneClass`/`formatRunDuration`/`findHeadlineNode` (di-export dari
`run-progress.tsx`), serta seluruh viewer artefak di `features/workspaces`.

**Catatan pustaka:** tidak ada paket npm `ai-elements`; `components/ai-elements/*` buatan
sendiri. `ai@6` + `streamdown` tersedia. `plan.tsx` (Collapsible+Card) adalah pola acuan
untuk `ToolRow`. Tool/Subagent/Artifact card harus dibuat baru.

---

## 4. Keputusan kunci & ruang lingkup

> **Dikonfirmasi owner 2026-06-14:** D1 = urutan presisi langsung (b); D2 = thread-detail dulu;
> D3 = versioning ringan + hapus tabel mati; D4 = kartu sub-agen identik (ringkasan live).
> ✅ = terkonfirmasi · ⚠️ = masih default rekomendasi.

| #         | Keputusan                                                    | Opsi                                                                                                  | Hasil                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** ✅ | Kedalaman urutan presisi #1                                  | (a) Aproksimasi UI saja · (b) segmentasi backend (urutan presisi)                                     | **DIPILIH (b) langsung.** Segmentasi backend (Fase 1) **mendahului** penggabungan frontend (Fase 2) → urutan presisi sejak pertama kali terlihat, tanpa fase aproksimasi. Konsekuensi: hot-path streaming + perubahan schema tersentuh paling awal. |
| **D2** ✅ | Ruang lingkup parity side panel artefak                      | (a) Thread-detail saja · (b) 3 surface per `apps/web/AGENTS.md`                                       | **Thread-detail dulu (Fase 4), rollout 3 surface di Fase 5.** Di panel compact (embedded), kartu **deep-link** ke `/app/workspaces/[id]/artifacts/[id]` daripada panel-dalam-panel.                                                                 |
| **D3** ✅ | Versioning artefak                                           | (a) Ringan: "Dibuat/Diperbarui" dari `action`+`createdAt/updatedAt` · (b) Hidupkan `artifactVersions` | **(a) ringan.** `artifactVersions`/`currentVersionId`/`ResearchArtifact.version` saat ini **mati** — hapus sebagai cleanup (Fase 5).                                                                                                                |
| **D4** ✅ | Identitas sub-agen                                           | (a) Kartu identik dibedakan ringkasan live · (b) Judul tugas per-sub-pertanyaan                       | **(a).** Hanya `literature-searcher` yang pernah di-spawn hari ini; (b) ditangguhkan (v3) sampai desain deep-research menambah tipe sub-agen.                                                                                                       |
| **D5** ✅ | Pembalikan req 18 (jawaban terpisah dari run)                | —                                                                                                     | **Dibalik secara eksplisit.** Referensi owner mensyaratkan penggabungan. Dicatat sebagai supersede atas `agent-activity-stream-plan.md` §5.3/req 18.                                                                                                |
| **D6** ⚠️ | Tampilkan teks query pencarian (Image 1: "Searched for '…'") | (a) Hanya jumlah hasil · (b) + teks query (clamped)                                                   | **(b).** Tambah `query` (single-line ≤120 char) ke input sanitizer `searchWeb`/`searchArxiv`. Query di-generate agen (bukan data privat user) — tetap melewati chokepoint + clamp + review no-leak.                                                 |

---

## 5. Behavior #1 — satu timeline berurut

**Frontend (Fase 2):**

- **`utils/turn-model.ts` (baru):**
  - `pairRunsWithTurns(messages, runs, pendingHitlParts)`: ganti `interleaveRunsWithMessages`.
    Petakan tiap pesan user → run-nya (via `promptMessageId`) → pesan asisten berikutnya.
    Emit `{ kind: "user"; message } | { kind: "assistant-turn"; message?, run? }`.
    Tangani edge case: (a) run tanpa pesan asisten (baru mulai streaming) → turn dengan
    `message: undefined` agar timeline+shimmer muncul sebelum token pertama; (b) run gagal →
    error di header turn (`runNode.description`); (c) banyak run per prompt (deep + retry) →
    render run aktif/terakhir, run lama collapse; (d) run yatim → trailing turn.
  - `buildTurnParts(message, run)`: **jalur utama** = konsumsi `orderedPartsFromRun(run)`
    (Fase 1) untuk urutan presisi `reasoning → tool → reasoning → … → jawaban`. **Fallback**
    `uiMessageFromRow` (`[reasoning] + node aktivitas urut seq + [answer]`) HANYA untuk run
    legacy tanpa event segmen.
- **`components/assistant-turn.tsx` (baru):** render `TurnPart[]` → header run (Shimmer
  ringkasan saat aktif, toggle dev-mode, chip sumber, `CitationIntegritySummary` deep),
  lalu parts berurut, lalu jawaban (`StreamingResponse` w/ `useSmoothText` saat streaming,
  else `MessageResponse`) + `AssistantMessageActions` + `MessageSourceCount` di akhir.
- **`chat-thread-state.tsx`:** ganti cabang map jadi `pairRunsWithTurns` → render
  `<UserMessageBubble>` | `<AssistantTurn>`. Pertahankan `compact`, `entryGapClass`, key.
- **`message-row.tsx`:** ekstrak `UserMessageBubble` (gelembung user) keluar; body asisten
  (Reasoning + jawaban + actions) dipindah/dipakai ulang di `AssistantTurn`.
- **`run-progress.tsx`:** `AgentRunBlock` tak lagi sibling. Rendering-nya (header, dev-mode,
  `DeepPhaseTimeline`, citation, chip sumber) dilipat ke `AssistantTurn`/sub-komponen
  `RunTimeline`. Export `NodeStatusIcon`, `toneClass`, `formatRunDuration`, `findHeadlineNode`.

**⚠️ Regresi yang harus dijaga:** smoothing per-`MessageRow` (`useSmoothText` remount per
message id, `message-row.tsx:132-147`) — saat jawaban pindah ke `AssistantTurn`, tetap
key per message id, jika tidak teks giliran sebelumnya bocor ke gelembung baru (bug yang
sudah pernah diperbaiki pendahulu — jangan regresi).

**HITL:** interaksi pending datang **ganda** — sebagai pesan sintetis
(`uiHitlMessageFromInteraction`) DAN node `ActivityEvent` `approval`. Di model baru: render
**satu** kartu HITL di posisi seq node `approval`. `pairRunsWithTurns` menerima HITL part
(dari pesan sintetis, dicocokkan via `runId`) dan `buildTurnParts` menyelipkannya di seq
approval (atau di akhir bila tak ada node). Hentikan double-render (node approval jadi
anchor, bukan baris tool terpisah). Logika blokir composer (`hasPendingHitl`) tetap.

**Urutan presisi backend → Fase 1** (lihat §9) — frontend ini (Fase 2) mengonsumsinya.

---

## 6. Behavior #2 — tool row collapsible

Sebagian besar **sudah mungkin hari ini**: `describeTool` + scalar tersanitasi sudah ada,
hanya saja metadata kini dev-mode only (`run-progress.tsx:240-280`).

- **`components/tool-row.tsx` (baru):** Collapsible (acuan `plan.tsx`/`reasoning.tsx`).
  - **Header (collapsed):** `NodeStatusIcon` + judul Indonesia (Shimmer saat running) +
    chip ringkasan inline dari `node.description` (mis. "12 hasil").
  - **Body (expanded):** key/value dari `node.metadata` scalar (sentence-case Indonesia).
- **Pemetaan per-tool** (dari `activitySanitizers.ts` + `describeTool`):

| Tool                                  | Header collapsed                                   | Body expanded                      |
| ------------------------------------- | -------------------------------------------------- | ---------------------------------- |
| `searchWeb` / `searchArxiv`           | "Mencari sumber web · 12 hasil"                    | query (D6) + `resultCount`         |
| `lookupDoi`                           | "DOI terverifikasi · {doi}"                        | `doi`, `resultCount`               |
| `searchThreadDocuments`               | "Selesai mencari dokumen"                          | "dokumen ditemukan"/"tidak ada"    |
| `verifyStatistics`                    | "Statistik diperiksa · {n} pemeriksaan, {verdict}" | `checksRun`, `verdict`             |
| `verifyCitations` (`citation_check`)  | "Kutipan diverifikasi · {n} diperiksa"             | `checked`, `flagged`               |
| `proposeArtifact` / `executeArtifact` | "Menyimpan dokumen · {judul}"                      | judul + link ke kartu artefak (§7) |
| `askUser`                             | "Menunggu jawaban Anda · {n} pertanyaan"           | (kartu HITL)                       |

Default-deny: tool tanpa scalar → judul saja. **Tanpa perubahan backend** untuk tool normal
(kecuali D6 query — di Fase 0).

---

## 7. Behavior #3 — kartu artefak + side panel

**Prasyarat load-bearing (Fase 0):** `executeArtifact` mengembalikan
`{ok, artifactId, action}` (`tools/artifacts.ts:97`) tapi **hasilnya tak disanitasi** →
`artifactId` tak pernah sampai UI. Tambah result sanitizer.

- **Fase 0:**
  - `apps/agents/src/agent/activitySanitizers.ts`: tambah `executeArtifact.result =
{ artifactId: safeId(r.artifactId), action: safeEnum(r.action, ["create","update","delete"]) }`
    (helper `safeId` baru di samping `safeLabel`/`safeEnum`). `proposeArtifact` opsional.
  - `packages/agent-contracts/src/activity.ts`: teruskan `artifactId`/`action` ke
    `node.metadata` (sudah `string|number|boolean`, tanpa perubahan tipe); `describeTool`
    case artefak.
  - `convex/agent/queries.ts:listArtifacts`: perlebar proyeksi dengan `source`, `updatedAt`,
    `artifactType` (sudah ada). Additive.
  - Test parity sanitizer↔`describeTool` (`apps/agents/tests/activitySanitizers.test.ts`) +
    no-leak (artifactId opaque aman; body/judul-penuh tak bocor).

- **Fase 4 — kartu inline:**
  - Ekstrak `getArtifactCardPresentation` dari `library-artifact-card.tsx` ke modul shared.
  - `components/chat-artifact-card.tsx` (baru): varian inline (ikon-per-tipe, judul,
    "Dibuat"/"Diperbarui" dari `action`, provenance). Resolusi baris artefak via
    `node.metadata.artifactId` terhadap prop `artifacts` (kini terpakai). Saat node
    `executeArtifact` running tanpa id → indikator Shimmer "Menulis dokumen…" /
    "Memperbarui dokumen…".

- **Fase 4 — side panel:**
  - Ekstrak inner `ArtifactDetailPage` → komponen reusable `{artifactId, workspaceId,
variant: "page" | "panel"}`. Varian `panel`: buang wrapper `<main min-h-svh>`, ganti
    breadcrumb workspace dengan toolbar panel + tombol tutup, bungkus
    `panelSurfaceClass({framed:true})` + `panelBodyPaddingClass`. Pakai ulang
    `ArtifactRenderPanels` + `ArtifactDetailHeader` + viewer (pdf/mermaid/json/csv/html/
    svg/code) apa adanya.
  - Data via `api.artifacts.get` + `api.artifacts.getRenderPayload(artifactId)` (**tanpa
    query baru**). `getRenderPayload` adalah action — re-fetch di-key pada `updatedAt` agar
    panel ikut update saat agen selesai menulis (pola yang sama dengan halaman).
  - **`ThreadPanelProvider` (baru, meniru `ComposerMentionsProvider`):** context
    `openArtifactPanel(artifactId)` agar kartu di kedalaman transcript tak perlu prop-drill.
    `panelMode` state di `ThreadDetailShell`: `"library" | "context" | { artifact: id }`.
    Hanya **satu slot `ResponsiveSidePanel`** → mode artefak **menggantikan** panel library
    (dengan tombol kembali).

**⚠️ Parity (D2):** panel artefak adalah mode panel BARU yang tak ada di tabel parity
`apps/web/AGENTS.md`. Fase 5 me-rollout ke `WorkspaceChatSidePanel` + `ExploreChatSidePanel`.
Di panel compact: deep-link ke route artefak penuh (hindari panel-dalam-panel).

**Catatan:** `api.artifacts.get` mengembalikan null bila `workspaceId` falsy
([[chat-attachment-workspaceid-null]]). Artefak yang **dibuat agen** mendapat `workspaceId`
(create me-resolve thread/default workspace, `service.ts:817-826`) → kartu dapat membukanya.
Verifikasi tak ada jalur agen yang menghasilkan artefak tanpa `workspaceId`.

---

## 8. Behavior #4 — kartu sub-agen

Hari ini sub-agen dirender sebagai `ActivityNodeRow` rekursif: node `subagent` dengan
children (tool-nya) sebagai `<ol>` ber-`border-l` nested ~2 level di dalam Accordion fase.

**v1 (Fase 3, tanpa backend):**

- `packages/agent-contracts/src/activity.ts`: helper murni
  `subagentSummary(node)` + `subagentCurrentActivity(node)`:
  - running → judul child tool yang sedang running (terbaru by seq), via Shimmer
    (mis. "Mencari sumber web"); fallback ke label sub-agen sendiri bila belum ada child.
  - terminal → roll-up ringkas (mis. "3 pencarian, 12 sumber"); v2 → kalimat pertama
    `last_assistant_message`.
  - Opsional: materialisasi `node.currentActivity` / `node.summary` (field opsional baru di
    tipe `ActivityEvent`) agar React presentasional.
- `components/subagent-card.tsx` (baru): SATU kartu per node `type==="subagent"` (judul =
  `node.title` dari `SUBAGENT_LABELS`/fallback; baris ringkasan dinamis; tool children
  **disembunyikan** di balik expand + tetap muncul di dev-mode). Pakai ulang `ToolRow` saat
  di-expand.
- Branch `ActivityNodeRow` + body `AccordionContent` fase `literature` di
  `run-progress.tsx`/`AssistantTurn` agar `subagent` → `SubagentCard`.
- **Chip "N berjalan" + waktu tunggu:** hitung `children.filter(c => c.type==="subagent" &&
c.status==="running").length`; waktu reuse `formatRunDuration(run)`. Tanpa backend.

**v2 (Fase 5, backend):** tangkap `last_assistant_message` di `subagent_stop`:
`hooks.ts` baca `hookInput.last_assistant_message` → `sanitizeSubagentSummary` (safeLabel,
≤120 char) → `payload.summary`; `run.ts` `subagentPayloadSchema.summary?`; `activity.ts`
simpan di node; `subagentSummary` utamakan saat terminal. + test parity.

**Catatan penting:**

- Hanya `literature-searcher` yang pernah di-spawn (fase `literature` deep). planner/
  counter-evidence/citation-verifier/writer adalah **PHASE**, bukan sub-agen — tetap render
  sebagai baris Accordion fase. Kartu sub-agen referensi = literature-searcher paralel.
- Ringkasan prosa live "Researching → Writing response" **tidak tersedia** tanpa perubahan:
  teks/reasoning internal sub-agen dibuang di `streamBridge.ts:131-135` (`parent_tool_use_id`).
  v1 ringkasan berbasis-tool; v3 (teks live per sub-agen) ditangguhkan.

---

## 9. Perubahan backend — urutan presisi (Fase 1)

Pendekatan terpilih (**opsi b**): emit segmen `text`/`reasoning` ber-seq ke
`agentRunEvents`, gabung di kontrak. Mempertahankan `chatMessages.text` sebagai sumber
kebenaran jawaban (copy/finalize/judul thread/search).

- **Schema** (`packages/convex/convex/schema.ts`, additive — **satu-satunya perubahan
  schema seluruh plan**): `agentRunEvents` + `segmentId: v.optional(v.string())` + index
  `by_run_segment: ["runId", "segmentId"]`.
- **Store** (`apps/agents/src/store`): `upsertRunEventBySegmentId(runId, segmentId, type,
payload)` di `types.ts`, `convexStore.ts`, `memoryStore.ts`; mutasi Convex baru di
  `agent/service.ts` (lookup `by_run_segment` → patch jika ada **pertahankan seq** / insert
  `nextRunEventSeq` jika belum).
- **Kontrak** (`run.ts`): `runEventTypeSchema` + `text_segment` + `reasoning_segment`;
  payload `{ text, segmentId }`.
- **streamBridge.ts:** saat batas tool (hook memicu) → tutup segmen text/reasoning kini,
  buka segmen baru; di dalam segmen tetap koalessing 250ms/800char tapi emit/re-patch
  **SATU event per segmen kontiguous** (by `segmentId`) — bukan per delta (jaga cap
  200-event + ekonomi write non-blocking). Tetap tulis `chatMessages.text`/`.reasoning`
  apa adanya. `segmentId = \`${runId}:${turnIndex}:${kind}:${n}\`` (unik lintas resume).
- **Kontrak** (`activity.ts`): `orderedPartsFromRun(run)` gabung semua event by seq → flat
  parts (fold `tool_start`+`tool_end` → satu tool part; `executeArtifact` → artifact part;
  segmen → reasoning/text part). **Fallback** ke `uiMessageFromRow` saat tak ada event
  segmen (run legacy). Pakai ulang logika terminal-close + visibility. `activityEventsFromRun`
  tetap untuk pohon sub-agen/fase.
- **Frontend (Fase 2):** `buildTurnParts` pakai `orderedPartsFromRun` sebagai jalur utama;
  fallback `uiMessageFromRow` hanya untuk run legacy tanpa event segmen.

**Koordinasi batas segmen (risiko):** `streamBridge` kini tak melihat event hook. Solusi:
cursor per-run bersama, atau `runManager` menutup segmen terbuka bridge di sekitar pesan
ber-hook. **Konfirmasi urutan SDK runtime** (apakah blok `tool_use` di pesan assistant tiba
sebelum/sesudah hook `PreToolUse`-nya dalam iterasi loop yang sama) sebelum diandalkan.
Salah-segmentasi hanya menurunkan granularitas urutan, tak pernah merusak jawaban final
(`chatMessages.text` utuh).

**Cap & resume:** koalessing per-segmen jaga text/reasoning ~1 event per run kontiguous;
estimasi worst-case vs `MAX_EVENTS_PER_RUN=200` (`queries.ts:16`) + `MAX_RUN_EVENTS=500`
(`service.ts`) — naikkan cap atau paginasi bila perlu. `segmentId` unik lintas resume HITL

- fase deep. Cancel tutup segmen terbuka seperti `activity.ts:739-782`.

---

## 10. Ringkasan perubahan kontrak (`@aqsha/agent-contracts`)

| Fase | Perubahan                                                                                                                         | Sifat                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 0    | `executeArtifact` sanitizer `{artifactId, action}`; `describeTool` artefak; (D6) `query` di searchWeb/searchArxiv input sanitizer | Additive, no-leak test |
| 1    | `runEventTypeSchema` + `text_segment`/`reasoning_segment`; `orderedPartsFromRun(run)`                                             | Additive               |
| 3    | `subagentSummary`/`subagentCurrentActivity` (helper murni); opsional `ActivityEvent.currentActivity?`/`summary?`                  | Additive               |
| 5    | `subagentPayloadSchema.summary?` (last_assistant_message)                                                                         | Additive               |

Semua field additive/opsional → event lama tetap parse. Pertahankan invariant pendahulu:
normalizer **murni + ter-unit-test**, payload `agentRunEvents` open (`z.record`),
chokepoint sanitasi tunggal di `activitySanitizers.ts`, kunci sanitizer ↔ `describeTool`
1:1 (dijaga test).

---

## 11. Fase implementasi (ringkas)

| Fase                             | Tujuan                                                                               | File utama                                                                                                                                               | Risiko                                             |
| -------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **0 Pondasi data**               | `artifactId`/`action`/`query` sampai UI; perlebar `listArtifacts`                    | `activitySanitizers.ts`, `activity.ts`, `queries.ts`, test                                                                                               | Rendah                                             |
| **1 Urutan presisi (backend)**   | Interleaving reasoning↔tool presisi via segmen ber-seq                               | `schema.ts`(+`segmentId`), `service.ts`, `convexStore.ts`/`memoryStore.ts`/`types.ts`, `streamBridge.ts`, `run.ts`, `activity.ts`(`orderedPartsFromRun`) | **Tinggi** (hot path + satu-satunya schema change) |
| **2 Penggabungan timeline**      | Satu parent berurut + `ToolRow`; konsumsi `orderedPartsFromRun`; hapus split sibling | `turn-model.ts`(+), `assistant-turn.tsx`(+), `tool-row.tsx`(+), `chat-thread-state.tsx`, `transcript-model.ts`, `message-row.tsx`, `run-progress.tsx`    | **Sedang** (transcript inti, 3 surface, smoothing) |
| **3 Kartu sub-agen**             | Satu kartu dinamis + chip "N berjalan"                                               | `subagent-card.tsx`(+), `activity.ts`(helper), `run-progress.tsx`/`assistant-turn.tsx`                                                                   | Rendah                                             |
| **4 Kartu artefak + side panel** | Indikator live + kartu klik → side panel                                             | `chat-artifact-card.tsx`(+), `artifact-detail-panel.tsx`(+), `ThreadPanelProvider`(+), `thread-detail-shell.tsx`, ekstrak `ArtifactDetailPage`           | **Sedang-Tinggi** (parity, reuse viewer)           |
| **5 Parity + cleanup**           | Rollout 3 surface; v2 ringkasan; hapus `artifactVersions` mati                       | panel twins, `hooks.ts`+sanitizer subagen, migrasi hapus `artifactVersions`/`currentVersionId`/`ResearchArtifact.version`, `accountCleanup`              | Sedang                                             |

Owner memilih **urutan presisi langsung** (D1): segmentasi backend (Fase 1) **mendahului**
penggabungan frontend (Fase 2), sehingga timeline tergabung sudah presisi sejak pertama kali
terlihat — tanpa fase aproksimasi. Trade-off: hot-path streaming + satu-satunya perubahan
schema dikerjakan paling dini; mitigasi risiko di §9 & §15. Fase 0 (pondasi data) tetap bisa
berjalan paralel dengan Fase 1 karena tak bergantung pada segmentasi.

---

## 12. Tabel copy (Indonesia, sentence case)

Referensi screenshot berbahasa Inggris → wajib diterjemahkan (label uppercase dilarang
[[copywriting-no-uppercase]]). Sebagian sudah ada di katalog `activity.ts`.

| Referensi (EN)        | Aqsha (ID)                           | Sumber                           |
| --------------------- | ------------------------------------ | -------------------------------- |
| Thought for 3 seconds | Berpikir 3 detik                     | baru (Reasoning header + durasi) |
| Thinking…             | Sedang berpikir…                     | `reasoning.tsx` (sudah ada)      |
| Searching the web     | Mencari di web                       | `TOOL_LABELS.searchWeb.running`  |
| Searched for "…"      | Mencari "…" / Selesai mencari "…"    | baru (D6 query)                  |
| Write file.md         | Menulis dokumen / Menulis {judul}    | `TOOL_LABELS.executeArtifact`    |
| Researching…          | Sedang meneliti / Mencari literatur… | `subagentSummary`                |
| Writing response      | Menulis respons                      | `subagentSummary`                |
| 4 Working             | 4 berjalan                           | baru (chip sub-agen)             |
| Waiting 1m 51s        | Menunggu 1m 51s                      | `formatRunDuration`              |

---

## 13. Invarian & gerbang (non-negosiabel)

- **No-leak:** sanitasi tetap di sumber (`activitySanitizers.ts` allow-list); view-model
  hanya scalar allow-list. Tiap scalar baru (`artifactId`, `query`, `summary`) butuh test
  no-leak baru (body dokumen, path file, kunci API, data privat user tak pernah lolos).
- **Copy:** sentence case Indonesia, tanpa class `uppercase` [[copywriting-no-uppercase]].
- **Ikon:** hanya dari `@aqsha/ui/icons`.
- **Convex client:** tanpa `convex/react` `useQuery`/`useMutation`/`useAction` baru — pakai
  helper `apps/web/lib/convex-query.ts`.
- **Error:** terstruktur via `lib/appError.ts` (backend) / `readableConvexErrorMessage`
  (frontend).
- **Read backend:** ber-index & ber-batas (`packages/convex/AGENTS.md`).
- **Parity (Fase 4/5)** — checklist `apps/web/AGENTS.md` sebagai gerbang keluar:
  - [x] Fitur jalan di thread-detail **main**, workspace-chat **panel**, Explore **panel** (kartu lewat `ChatThreadState` bersama; thread-detail = side panel, compact = deep-link)
  - [x] Tiap surface dibungkus `ComposerMentionsProvider` (+ `ThreadPanelProvider` di thread-detail; surface compact memakai deep-link D2 → tak butuh provider panel)
  - [x] Chrome panel pakai token `lib/panel-surface.ts` (`ArtifactDetailPanel` mengisi slot `ResponsiveSidePanel` tanpa double-frame); prop `compact` dihormati di kartu
  - [x] Mobile open/close sinkron via `DetailSplitLayout`/`useCloseRightPanel` (`panel.setOpen` ⇄ `onSideOpenChange`; reducer `closePanel`/`back`)

---

## 14. Pengujian

- **agent-contracts (vitest):** `pairRunsWithTurns` (streaming-sebelum-teks, gagal, deep,
  retry, yatim); `buildTurnParts` (ordered + fallback legacy); `subagentSummary` (running/
  terminal/flicker); `orderedPartsFromRun` (merge by seq, fold tool/artifact, fallback
  legacy, terminal-close cancel).
- **apps/agents (vitest):** sanitizer `executeArtifact.result`/`query`/`subagent summary`
  - no-leak; `streamBridge` batas segmen + koalessing + cap (Fase 1); `hooks` parity.
- **convex (vitest):** `upsertRunEventBySegmentId` (patch-keep-seq vs insert); `listArtifacts`
  proyeksi lebar.
- **web (vitest):** `turn-model` edge case; render `AssistantTurn`/`ToolRow`/`SubagentCard`/
  `ChatArtifactCard` (snapshot/interaksi collapsible + klik kartu).
- **E2E manual (DoD):** giliran research nyata → verifikasi (a) reasoning↔tool↔jawaban
  berurut di satu parent, (b) tool row klik → ringkasan, (c) kartu artefak klik → side
  panel, (d) kartu sub-agen dengan ringkasan berubah + chip "N berjalan", (e) leak-check
  (query/judul/path/API key TIDAK ada di payload event).

---

## 15. Risiko & pertanyaan terbuka

1. **D1/urutan presisi (DIPILIH langsung):** segmentasi backend (Fase 1) mendahului frontend
   → hot-path streaming + satu-satunya perubahan schema tersentuh paling awal; tak ada fase
   aproksimasi sebagai jaring pengaman. Mitigasi: koordinasi batas segmen + verifikasi urutan
   SDK (risiko #3) WAJIB tuntas di Fase 1 sebelum frontend (Fase 2).
2. **Pembalikan req 18 (D5):** mengubah keputusan terkunci pendahulu — referensi owner sudah
   mensyaratkan, tapi dokumen pendahulu menandainya sebagai requirement terpenuhi & shipped.
3. **Koordinasi batas segmen (Fase 1):** `streamBridge` tak melihat hook; butuh cursor
   bersama / penutupan oleh runManager + verifikasi urutan SDK runtime.
4. **Cap 200 event (Fase 1):** giliran panjang multi-tool + banyak segmen bisa melebihi;
   koalessing per-segmen + estimasi worst-case; mungkin naikkan cap/paginasi.
5. **Parity side panel (D2):** triple surface = pengali ruang lingkup terbesar; panel compact
   nested vs deep-link; satu slot `ResponsiveSidePanel` (artefak menggantikan library).
6. **`artifactVersions` mati (D3):** tipe menjanjikan data versi yang backend tak hasilkan;
   konfirmasi cleanup (hapus) vs hidupkan riwayat versi.
7. **Identitas sub-agen (D4):** hanya `literature-searcher` di-spawn; kartu paralel akan
   identik kecuali ringkasan live; v3 task-title ditangguhkan.
8. **Aksi pesan saat merge:** `AssistantMessageActions`/`MessageSourceCount` (kini di
   `MessageRow`) harus tetap melekat ke jawaban final di `AssistantTurn`, jangan hilang.

---

## 16. Referensi file (peta cepat)

**Frontend** — `apps/web/features/thread-experience/`: `components/chat-thread-state.tsx`,
`components/message-row.tsx`, `components/run-progress.tsx`, `components/message-hitl-parts.tsx`,
`components/shared.tsx`, `utils/transcript-model.ts`, `utils/hitl-parts.ts`;
`components/ai-elements/{reasoning,message,conversation,shimmer,plan}.tsx`;
`components/layout/{detail-split-layout,responsive-side-panel}.tsx`;
`features/thread-experience/components/{thread-detail-shell,thread-shell-layout,composer-context-mentions}.tsx`;
`features/workspaces/{pages/artifact-detail-page,components/artifact-render-panels,components/artifact-detail-header,components/artifact-detail-sidebar,components/pdf-artifact-viewer}.tsx`;
`components/library-artifact-card.tsx`; `lib/panel-surface.ts`.

**Kontrak** — `packages/agent-contracts/src/{activity,uiAdapters,run}.ts`.

**Backend agen** — `apps/agents/src/agent/{streamBridge,hooks,activitySanitizers}.ts`,
`apps/agents/src/runs/{runManager,sdkRunner}.ts`, `apps/agents/src/tools/artifacts.ts`,
`apps/agents/src/subagents/index.ts`, `apps/agents/src/store/{types,convexStore,memoryStore}.ts`.

**Convex** — `packages/convex/convex/agent/{queries,service}.ts`,
`packages/convex/convex/artifacts.ts`, `packages/convex/convex/schema.ts`.
