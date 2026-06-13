# Plan: Real-time Agent Activity Stream / Timeline

> Dokumen desain + status implementasi. **Fase 1 SUDAH SELESAI & ter-commit; Fase 2 & 3 belum dikerjakan.**

## Status Implementasi

| Fase | Status | Catatan |
|---|---|---|
| **Fase 1 — Frontend-only** | ✅ **SELESAI** — commit `ed5c5c2`, branch `development` (2026-06-13) | Belum di-push/PR. Semua gate hijau. |
| **Fase 2 — Enrichment backend** | ✅ **SELESAI** — branch `development` (2026-06-13), uncommitted | Detail di "Fase 2 — yang dikerjakan" di bawah. Tanpa perubahan schema/index/Convex. Semua gate hijau. |
| Fase 3 — Presisi & skala | ⏳ Belum | Detail di §9 Fase 3. |
| Cleanup follow-up | ⏳ Belum | Hapus `steps` yatim + `eventStepKey` + mapping `events` lama (§12). |

### Fase 2 — yang benar-benar dikerjakan
- `apps/agents/src/agent/activitySanitizers.ts` (**baru**): chokepoint sanitasi tunggal. `TOOL_SANITIZERS` allow-list per tool + `sanitizeToolInput`/`sanitizeToolResult` (default-deny → `{}`), `toolResponseIsError` (baca `isError` dari CallToolResult MCP), dan `sanitizeRunErrorMessage` (allow-list kode aman → copy Indonesia; selain itu generik "Terjadi kesalahan internal"). Raw `tool_input`/`tool_response` **tidak pernah** keluar modul ini. Helper `safeLabel` (single-line + ≤120 char) untuk label bebas seperti judul artefak.
- `apps/agents/src/agent/hooks.ts`: wire arg ke-2 `toolUseID` (fallback `tool_use_id`) ke `tool_start`/`tool_end`; tambah `tool_response` ke `HookInputLike`; isi `inputSummary` (start) & `resultSummary` (end) tersanitasi; set `status:"ok"|"error"` di `tool_end` (dari `toolResponseIsError`); **hook baru `PostToolUseFailure`** → `tool_end` `status:"error"` (raw `error` SDK sengaja dibuang); tambah `agentId` (dari `agent_id`) ke `subagent_start`/`subagent_stop` (helper `subagentEvent` dedup start/stop).
- `apps/agents/src/runs/runManager.ts`: bungkus `message` di SEMUA emit `appendRunEvent type:"error"` (failRun, executeTurn, budget deep, phase deep) dengan `sanitizeRunErrorMessage`. `finalizeRun.errorMessage` tetap RAW (untuk ops/logs; dipertahankan agar `runManager.test.ts:114` tetap hijau) — hanya payload event client-facing yang disanitasi.
- `packages/agent-contracts/src/run.ts` (additive): `toolStartPayloadSchema`/`toolEndPayloadSchema`/`subagentPayloadSchema` + `activityScalarRecordSchema`. Semua field tambahan **opsional** → event tipis Fase 1 tetap parse; dipakai untuk menTYPE emit site di hooks.ts + divalidasi di test.
- `packages/agent-contracts/src/activity.ts`: pairing tool **eksak via `toolUseId`** (fallback stack per-nama LIFO); pairing sub-agen **eksak via `agentId`** (fallback LIFO) — benar untuk start/stop paralel (nesting tetap coarse by seq, presisi = Fase 3); baca `inputSummary`/`resultSummary` lewat `scalarsFrom` (default-deny scalar sisi normalizer) ke `metadata`; `describeTool()` → `description` Indonesia ("12 hasil", judul artefak, dst). Semua perilaku Fase 1 dipertahankan.
- Test: `apps/agents/tests/activitySanitizers.test.ts` (**baru**, sanitizer murni + run-error + no-leak), `apps/agents/tests/hooks.test.ts` (extend: toolUseId, inputSummary/resultSummary, status, `PostToolUseFailure`, agentId, validasi schema, no-leak), `packages/agent-contracts/tests/activity.test.ts` (extend: pairing toolUseId, description dari summary, pairing agentId paralel, default-deny normalizer).

### Keputusan scope Fase 2
- **Item 5 (public `listRunEvents` Convex query) — DILEWATI (sengaja).** Ditandai "opsional" di plan; tak ada konsumen (frontend Fase 1 tetap pakai `listRuns`, mengalihkannya = refactor lebih besar yang berisiko regресi Fase 1); query publik tak-terpakai = dead code + perluasan permukaan keamanan, bertentangan dengan emphasis owner soal kerapian kode. Konsekuensi positif: **nol perubahan schema/index/Convex** → tak perlu `convex dev --once`. Optimasi read-amplification tetap kandidat Fase 3.
- **`verifyCitations` & `deleteArtifact` — default-deny disengaja** (tanpa entri di `TOOL_SANITIZERS`): `citation_check` sudah memiliki ringkasan kaya (hindari hitung-ganda); `deleteArtifact` tak punya skalar aman yang berguna (hanya id buram).

### Gate Fase 2 (hijau)
`bun run typecheck` (5 paket) · `bun run lint` (0 error, 1 warning pra-ada `table-block.tsx`) · `bun run --filter '@aqsha/agent-contracts' test` (41) · `bun run --filter '@aqsha/agents' test` (181) · `bun run --filter '@aqsha/convex' test` (123).

**Bukti DoD (demo end-to-end hooks → payloadJson → normalizer):**
- searchWeb sukses → `{"toolName":"searchWeb","status":"ok","toolUseId":"tu_web","resultSummary":{"resultCount":2}}`
- tool gagal (PostToolUseFailure) → `{"toolName":"searchArxiv","status":"error","toolUseId":"tu_arx"}`
- Leak check (query / API key / URL / judul sumber / path file / "TypeError") = semua **tidak ada** di payload.
- ActivityEvent: `tool · completed · "Selesai mencari web" · desc="2 hasil"` dan `tool · failed · "Gagal mencari preprint arXiv"`.

### Review adversarial Fase 2 (4 lensa × 3 skeptik/temuan, 34 agen → 5 confirmed / 5 dismissed) — semua confirmed DIPERBAIKI
- **HIGH (no-leak):** header run masih bisa membocorkan `run.errorMessage` MENTAH lewat fallback `safeErrorText(run.errorMessage)` ketika event `error` tersanitasi absen (truncation >200 event, atau watchdog). **Fix:** header hanya merender pesan dari event yang sudah disanitasi di sumber; `run.errorMessage` mentah tak pernah dirender (judul "Berhenti sebelum selesai" menanggung status gagal). `run.errorMessage` tetap mentah di DB untuk ops (owner-gated). *Sisa Fase 3:* drop/sanitasi `errorMessage` di wire `listRuns` + watchdog emit event tersanitasi.
- **HIGH (regресi):** handler `error` mengeluarkan node tertutup dari `toolStacks` tapi BUKAN dari `toolsByUseId` (baru) → `tool_end` susulan bisa "menghidupkan" node failed jadi completed. Tidak terjangkau saat ini (urutan seq), tapi merusak parity defensif Fase 1. **Fix:** evict dari KEDUA map di handler error.
- **MEDIUM (kualitas):** kunci sanitizer ↔ kunci `describeTool` hanya terikat string literal antar-paket, tanpa test penjembatan. **Fix:** test integrasi (apps/agents) memipa output sanitizer NYATA → normalizer → assert `description` (searchWeb "2 hasil", verifyStatistics "3 pemeriksaan, perlu ditinjau").
- **LOW (kualitas):** sanitizer mengekstrak `verdict`/`action`/`computationKind`/`status` yang tak pernah dirender. **Fix:** `verdict` DISURFACE di `describeTool` (lensa Indonesia: lolos/perlu ditinjau/…); `action` + sanitizer `runComputation` DIBUANG → 1:1 producer→consumer.
- **LOW (kualitas):** literal `"budget_exhausted"` terikat ke kunci allow-list. **Fix:** konstanta bersama `RUN_ERROR_CODES` (rename = compile error).
- **Bonus dedup:** `ActivityScalar`/`ActivityScalarRecord` kini di-import dari `@aqsha/agent-contracts` (satu definisi).
- Gate ulang setelah fix: typecheck (5) · lint (0 err) · agent-contracts **43** · apps/agents **183** · convex **123**.
- **Dismissed (5):** error→tool_end resurrection (correctness menilai tak terjangkau — tetap diperbaiki sbg parity defensif), failed-tool keeps input description (informatif, bukan bug), MCP response shape unverified live (sanitizer defensif → {} bila beda; verifikasi manual §10), tipe ganda (sudah didedup), fallback key subagent mati (pra-ada, harmless).

### Fase 1 — yang benar-benar dikerjakan
- `packages/agent-contracts/src/activity.ts` (**baru**): tipe `ActivityEvent` + union (persis §3) + `activityEventsFromRun()` murni — fold tool via stack per-`toolName` (LIFO), nesting kasar fase→subagent→tool by window `seq`, map lifecycle/HITL/error, derivasi status terminal dari `run.status`, katalog label Indonesia (sentence case) dengan default-deny, allow-list scalar (`pickScalars`) anti-leak. Di-export dari `index.ts`.
- `packages/agent-contracts/src/uiAdapters.ts`: `UiResearchRun.activity` + `uiRunFromRow` mengisi via `activityEventsFromRun(row)`. Legacy `steps`/`events` dibiarkan.
- `apps/web/.../types/index.ts`: `ResearchRun.activity` ditambah.
- `apps/web/.../components/run-progress.tsx`: **ditulis ulang** merender `run.activity` (ikon status, Shimmer saat aktif, children ber-nest `border-l border-border/70 pl-3`, collapse/expand `userToggled ?? (isActive || isDeep)`). Dead-code `AgentRunStep` + `eventStepKey` **dihapus**. Badge sumber + `CitationIntegritySummary` deep dipertahankan. (Tidak diekstrak ke file terpisah — itu opsional.)
- `packages/agent-contracts/tests/activity.test.ts` (**baru**): 35 test (ordering, fold+durasi, nesting subagent & fase, error→failed, terminal-close titles, HITL pending→resolved, compaction hidden, 2× no-leak, judul gagal/selesai per jalur close).
- 3× `*.test.ts` fixture web dapat `activity: []` (agar typecheck lolos).

### Tambahan di luar rencana awal (hasil review adversarial 4-lensa, 14 agen → 4 confirmed / 6 dismissed)
- **Bug HIGH diperbaiki:** node `failed`/`cancelled` semula menampilkan label *running* ("Mencari sumber web") padahal ikonnya gagal. Ditambah bentuk `failed?` pada `Label` + helper `failedTitle()` + `labelForNode()`, diterapkan di **SEMUA jalur close** (tool_end-failed, orphan, error-menutup-tool, terminal-close) — bukan hanya yang ditemukan reviewer.
- **`safeErrorText()`** (baris pertama + batas 200 char) sebagai guard error-leak sisi frontend (mitigasi parsial; sanitasi penuh di sumber tetap Fase 2).

### Keputusan scope dari review (penting untuk Fase 2/3)
- **Sanitasi pesan error di `runManager.ts` → DITUNDA ke Fase 2** (file backend "JANGAN sentuh" di Fase 1; plan §8 menempatkan sanitasi di sumber). `safeErrorText` frontend sudah menanggulangi sebagian.
- **Orphan phase/subagent close → DILEWATI** (tak terjadi di produksi: `phase_done`/`subagent_stop` selalu mengikuti start via try/finally + SDK hook; konsisten dengan pola no-op `interaction_resolved`).

### Gate Fase 1 (hijau)
`bun run typecheck` (5 paket) · `bun run lint` (0 error, 1 warning pra-ada di `table-block.tsx`) · `bun run --filter '@aqsha/agent-contracts' test` (35) · `bun run --filter '@aqsha/convex' test` (123).

---

## Context

Saat user mengirim prompt, UI hanya menampilkan satu baris ringkas (`AgentRunBlock`: "Berjalan · 0:12") + spinner sampai jawaban akhir muncul. Padahal agent (Claude Agent SDK di `apps/agents`) menjalankan banyak tahap nyata: memanggil tools (`searchWeb`, `verifyCitations`, …), menjalankan sub-agents (`literature-searcher`), fase deep-research, HITL approval, dst.

**Temuan kunci audit:** seluruh pipeline event sebenarnya **sudah ada dan sudah mengalir sampai ke frontend** — hanya tidak pernah dirender. Jadi fitur ini adalah **perluasan pattern yang sudah ada**, bukan arsitektur baru. Tidak perlu SSE/WebSocket: reaktivitas Convex sudah menjadi transport server→client.

Tujuan: ubah pengalaman dari `prompt → spinner → jawaban` menjadi `prompt → run mulai → aktivitas tool/sub-agent muncul bertahap → jawaban mengalir → run selesai`, dengan progressive disclosure, nested sub-agent, status per langkah, dan tanpa membocorkan reasoning/secret.

---

## 1. Hasil Audit Codebase

### 1.1 Bagaimana agent diintegrasikan & request/response mengalir

```
apps/web (Next.js)
  composer → api.agent.startThread / sendMessage  (Convex mutation)
     └─ Convex membuat run (queued) + user message, lalu POST /runs ke apps/agents
apps/agents (Hono service, @anthropic-ai/claude-agent-sdk ^0.3.x)
  RunManager.executeTurn → SDK query() → StreamBridge + SDK hooks
     ├─ StreamBridge → store.updateMessageText  (teks jawaban streaming, non-blocking)
     └─ hooks/runManager → store.appendRunEvent  (event lifecycle/tool/subagent)
  ConvexStore.SERVICE_FUNCTIONS (agent/service:*) menulis ke tabel first-party Convex
apps/web membaca balik via Convex reactive query (TanStack Query)
```

- **Streaming sudah ada** untuk teks jawaban: `StreamBridge` (`apps/agents/src/agent/streamBridge.ts`) mem-flush teks ke `chatMessages.text` tiap ~250ms (non-blocking, satu mutation in-flight). Web mereaktifkan lewat Convex + `useSmoothText`.
- **Transport event = reaktivitas Convex.** Tidak perlu SSE/WebSocket. Setiap `appendRunEvent` menulis baris baru → query yang ter-subscribe otomatis push ke client.

### 1.2 Spine event SUDAH ada (ini temuan terpenting)

**Kontrak event** `RunEvent` sudah didefinisikan di `packages/agent-contracts/src/run.ts`:

```ts
runEventTypeSchema = z.enum([
  "run_status","tool_start","tool_end","subagent_start","subagent_stop",
  "compaction","citation_check","interaction_pending","interaction_resolved",
  "phase_start","phase_done","error",
]);
runEventSchema = z.object({ runId, seq, type, payload: z.record(z.string(), z.unknown()), createdAt });
```

**Semua 12 tipe event SUDAH di-emit hari ini** (terverifikasi):

| RunEvent | Sumber emit | Payload sekarang |
|---|---|---|
| `run_status` | `runManager.ts` (running/waiting_hitl/completed) | `{status, phase?, mode?, reason?, interactionId?, costUsd?}` |
| `tool_start` / `tool_end` | `agent/hooks.ts` (PreToolUse/PostToolUse) | `{toolName: logical}` **saja** |
| `subagent_start` / `subagent_stop` | `agent/hooks.ts` (SubagentStart/Stop) | `{agentType}` **saja** |
| `compaction` | `agent/hooks.ts` (PreCompact) | `{}` |
| `citation_check` | `tools/citations.ts` | `{checked, verified, flagged}` (sudah kaya) |
| `interaction_pending` / `interaction_resolved` | `agent/interactions.ts` | `{interactionId, toolName}` |
| `phase_start` / `phase_done` | `runManager.ts` (deep only) | `{phase, resumed/costUsd}` |
| `error` | `runManager.ts` | `{message, phase?}` |

**Persistensi & exposure (Convex):**
- Tabel `agentRunEvents` (`packages/convex/convex/schema.ts:634`): `{runId, seq, type, payloadJson: v.string(), createdAt}`, index `by_run_seq`. **`payloadJson` dan `type` keduanya free-form string** → memperkaya payload / menambah subtipe **tidak perlu perubahan schema** (backward compatible).
- `seq` di-assign monotonik oleh `agent/service/model.ts:nextRunEventSeq()` → UI bisa mengurutkan deterministik.
- Public query `api.agent.queries.listRuns({threadId})` (`queries.ts:120`) **sudah meng-embed `events[]` per run**, auth-gated (`requireCurrentUser` + `ownedThread`). Web sudah subscribe ke query ini.
- Service-only `agent/service:listRunEvents` ada tapi pakai serviceToken (bukan untuk web).

### 1.3 State management chat & rendering frontend

- Hook data kanonik: `features/thread-experience/api/use-thread-experience-data.ts` → `useConvexQueryData(api.agent.queries.listRuns, ...)` → `uiRunFromRow(row)` (`agent-contracts/src/uiAdapters.ts`) → `ResearchRun`.
- Transcript: `utils/transcript-model.ts:interleaveRunsWithMessages()` menyilangkan entri `run` dan `message`. **Jawaban akhir adalah `MessageRow` terpisah** dari blok run → pemisahan konseptual activity vs final answer **sudah terjadi secara struktural** (memenuhi req 18).
- `components/chat-thread-state.tsx:202` merender entri `run` sebagai `<AgentRunBlock run={...}>`.

### 1.4 Dead-end yang menyebabkan "cuma spinner"

`AgentRunBlock` (`components/run-progress.tsx`) sudah punya **semua bahan timeline**: status running/completed/failed, `Shimmer` saat aktif, collapsible progressive disclosure, sub-event ber-nest, durasi, label Indonesian. **Tapi** ia merender `run.steps`, dan:

- `uiRunFromRow` meng-hardcode **`steps: []`** (`uiAdapters.ts:237`).
- `run-progress.tsx` hanya merender `events` yang **ber-nest di bawah sebuah step** (filter `eventStepKey(event) === step.stepKey`).
- `eventStepKey` memetakan ke step-key **legacy deep-research** (`planRound`, `discoverRoundCandidates`, …) yang tidak ada untuk run normal.

⇒ Untuk run normal, `steps` kosong → **tidak ada apa pun yang dirender**, walau `run.events` penuh berisi tool/subagent/lifecycle. Event-nya ter-compute tapi yatim.

### 1.5 Tools, sub-agents, fase (katalog untuk label human-readable)

- Namespace MCP: `mcp__aqsha__<logical>` (`agent/toolPolicy.ts`). `logicalToolName()` melepas prefix.
- **Tools:** `searchWeb`, `searchArxiv`, `lookupDoi`, `searchThreadDocuments`, `verifyCitations`, `verifyStatistics`, `runComputation`, `proposeArtifact`, `executeArtifact`, `deleteArtifact`, `createWorkspace`, `renameWorkspace`, `askUser`.
- **Sub-agent:** `literature-searcher` (paralel, `background:true`, hanya di fase `literature` mode deep). Delegasi lewat built-in tool `Agent`.
- **Fase deep:** `plan → literature → counter_evidence → citation_verify → write`.

### 1.6 Design system yang bisa dipakai ulang

- `components/ai-elements/`: `Plan`/`PlanContent`/`PlanTrigger` (Collapsible+Card), `Shimmer` (teks animasi saat pending), `Conversation`, `Message`, `code-block`, `table-block`.
- `components/ui/`: `Spinner` (Loader2+animate-spin), `Skeleton`, `Collapsible`, `Card`, `Button`.
- `@aqsha/ui`: `Badge` (default/secondary/destructive/outline), `Accordion`, `Tooltip`.
- Ikon `@aqsha/ui/icons`: `CheckIcon`, `XCircleIcon`, `AlertCircleIcon`, `Loader2Icon`, `ChevronDownIcon`, `SparklesIcon`, `SearchIcon`, `FileTextIcon`, `FolderTreeIcon`, `ClockIcon`, `ShieldIcon`, `Code2Icon`, `UserRoundIcon`.
- Token warna (`packages/ui/src/styles/globals.css`): `--primary`, `--color-aqsha-mint` (sukses), `--color-aqsha-coral` (error), `--muted-foreground`, `--border`, `--lavender`. Dark-mode otomatis.
- Util existing: `utils/datetime.ts:formatCompactDuration`, `hitl-card-layout.ts` (token padding), idiom nesting `border-l border-border/70 pl-3` (sudah dipakai di `run-progress.tsx`).
- **Aturan copy:** sentence case, bahasa Indonesia, tanpa ALL-CAPS (BRAND-IDENTITY).

### 1.7 Keterbatasan SDK yang relevan (req 29)

- Hook `PreToolUse/PostToolUse` callback punya arg ke-2 `toolUseID` (saat ini **diabaikan**) → bisa untuk pairing `tool_start`↔`tool_end`.
- `PostToolUseHookInput` membawa `tool_response` (saat ini **tidak dibaca**) → bisa untuk ringkasan output tersanitasi.
- `SubagentStart` membawa `agent_id`; nesting presisi sub-agent paralel butuh `parent_tool_use_id` yang **hanya ada di stream message**, bukan di hook input. `StreamBridge` sudah membaca `parent_tool_use_id` tapi hanya untuk **membuang** teks sub-agent (`streamBridge.ts:108`).
- Hook matcher tool saat ini di-scope `^mcp__aqsha__` ⇒ tool internal sub-agent & Task tool **tidak ter-emit**. (Konsekuensi: nesting presisi adalah pekerjaan fase lanjut.)
- `PostToolUseFailure` belum di-hook; cancel tidak meng-emit event terminal; jalur timeout→resume HITL tidak meng-emit `interaction_resolved`.

---

## 2. Rancangan Pendekatan (sesuai codebase, minimal)

Prinsip: **perluas spine event yang sudah ada**, jangan bikin arsitektur baru. Tiga lapis:

1. **Kontrak/normalisasi (shared):** `RunEvent` tetap jadi baris wire/storage (payload tetap open). Tambah **view-model `ActivityEvent`** + fungsi normalisasi `activityEventsFromRun()` di `packages/agent-contracts` (mengikuti preseden `eventTitle`/`EVENT_TYPE_MAP` yang sudah ada di `uiAdapters.ts`). Inilah "layer adaptasi event SDK → event internal aplikasi" (req 10–12).
2. **Frontend:** render `ActivityEvent[]` sebagai timeline di dalam `AgentRunBlock` (ganti rendering berbasis `steps` yang yatim). Pakai ulang Shimmer/chevron/Spinner/ikon/durasi/token yang sudah ada.
3. **Backend (fase lanjut):** perkaya `agent/hooks.ts` agar payload membawa `toolUseId`, ringkasan input/output **tersanitasi**, status sukses/gagal, dan `agentId` — semua di-sanitasi di sumber.

**Urutan kerja:**
- **Fase 1 — Frontend-only (ship cepat):** timeline langsung jalan memakai event yang sudah mengalir. Tidak ubah backend/Convex.
- **Fase 2 — Enrichment backend (didokumentasikan, dikerjakan menyusul):** hooks capture detail tersanitasi + query Convex khusus.
- **Fase 3 — Presisi & skala:** nesting paralel via stream, dev-mode, dll.

---

## 3. Struktur Event Internal (`ActivityEvent`)

Baru: `packages/agent-contracts/src/activity.ts` (di-export dari `index.ts`).

```ts
export type ActivityStatus =
  | "pending" | "running" | "completed" | "failed" | "cancelled" | "waiting_approval";
export type ActivityActor = "main" | "subagent" | "tool" | "system";
export type ActivityVisibility = "user" | "developer" | "hidden";
export type ActivityType =
  | "run"        // header run (started/completed/failed/cancelled)
  | "tool"       // satu pemanggilan tool (start→end terlipat jadi satu)
  | "subagent"   // satu instance sub-agent
  | "phase"      // fase deep-research
  | "approval"   // HITL menunggu persetujuan/jawaban
  | "system";    // compaction, catatan sistem

export type ActivityEvent = {
  id: string;                 // stabil: `${runId}:${seq}` (atau id pasangan terlipat)
  runId: string;
  parentId?: string;          // nesting (sub-agent → tool-nya); Fase 1 coarse, Fase 3 presisi
  seq: number;                // urutan eksekusi
  type: ActivityType;
  status: ActivityStatus;
  actor: ActivityActor;
  title: string;              // human-readable Indonesia, mis. "Mencari sumber web"
  description?: string;       // ringkasan aman, mis. "12 hasil"
  metadata?: Record<string, string | number | boolean>;  // skalar aman saja
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  visibility: ActivityVisibility;
  children?: ActivityEvent[]; // hasil folding (sub-agent → tools)
};
```

Memenuhi req 12 (semua field), req 13 (semua status), req 14 (semua tipe — `answer delta`/`final answer` sengaja **bukan** bagian activity stream; lihat §8).

### Pemetaan `RunEvent` → `ActivityEvent`

| RunEvent (+payload) | ActivityType | actor | status | visibility |
|---|---|---|---|---|
| `run_status status=running` | run | main | running | user (header) |
| `run_status status=completed` | run | main | completed | user |
| `run_status status=waiting_hitl` | approval | system | waiting_approval | user |
| `tool_start` (belum ada end) | tool | tool | running | user |
| `tool_start`+`tool_end` | tool | tool | completed / failed | user |
| `subagent_start`(+`subagent_stop`) | subagent | subagent | running / completed | user |
| `phase_start`(+`phase_done`) | phase | main | running / completed | user (deep) |
| `citation_check` | tool | tool | completed | user |
| `interaction_pending` | approval | system | waiting_approval | user |
| `interaction_resolved` | (menutup node approval) | system | completed | user |
| `error` | run / tool | system/tool | failed | user |
| `compaction` | system | system | completed | **hidden** (dev nanti) |

---

## 4. Cara Normalisasi Event SDK → Internal

Fungsi murni & teruji `activityEventsFromRun(run: AgentRunRow): ActivityEvent[]` di `agent-contracts/src/activity.ts`:

1. **Parse + urutkan** `run.events` by `seq`.
2. **Lipat tool:** `tool_start` membuka node `running`; `tool_end` menutupnya → `completed`/`failed`, hitung `durationMs`.
   - Fase 1 (tanpa `toolUseId`): pairing via **stack per `toolName`** (push saat start, pop saat end) — andal untuk run normal yang umumnya sekuensial.
   - Fase 2 (ada `toolUseId`): pairing **eksak** by id.
   - Tool yang belum punya `tool_end` tetap tampil sebagai `running` (live).
3. **Lipat sub-agent:** `subagent_start`→`subagent_stop` jadi satu node `subagent`.
4. **Nesting:**
   - Fase 1 **coarse:** tool yang terjadi di dalam window `subagent_start..subagent_stop` (by `seq`) jadi `children`. Catatan jujur (req 29): untuk sub-agent **paralel** (literature-searcher), atribusi tepat tidak bisa hanya dari urutan `seq` → Fase 1 tampilkan sub-agent sebagai node bertanda jelas + daftar tool di bawahnya sebagai perkiraan; **presisi via `parent_tool_use_id` adalah Fase 3.**
   - Run normal tidak punya sub-agent → timeline datar dan 100% akurat.
5. **Map lifecycle/phase/error/HITL** sesuai tabel §3; `interaction_resolved` menutup node approval.
6. **Label catalog** (Indonesian, sentence case) memetakan `toolName`/`agentType`/`phase` → `title`/`description`/`icon`/`actor`. Disimpan bersama normalizer di `activity.ts` (konsisten dengan preseden `eventTitle`). Default-deny: nama tak dikenal → judul generik ("Menjalankan langkah").
7. **Status terminal** diturunkan dari `run.status` (mis. run `failed`/`canceled` menutup node yang masih `running`).
8. **Durasi** dari `startedAt/endedAt`; node aktif memakai "now" di sisi UI.

Contoh label (katalog awal):

| toolName | running | completed |
|---|---|---|
| `searchWeb` | "Mencari sumber web" | "Selesai mencari web" |
| `searchArxiv` | "Mencari preprint arXiv" | "Selesai di arXiv" |
| `lookupDoi` | "Memverifikasi DOI" | "DOI terverifikasi" |
| `searchThreadDocuments` | "Mencari dokumen di thread" | "Selesai mencari dokumen" |
| `verifyCitations` | "Memverifikasi kutipan" | "Kutipan diverifikasi" |
| `verifyStatistics` | "Memverifikasi statistik" | "Statistik diperiksa" |
| `proposeArtifact` | "Menyusun dokumen" | "Usulan dokumen siap" |
| `executeArtifact` | "Menyimpan dokumen" | "Dokumen disimpan" |
| `askUser` | "Menunggu jawaban Anda" | "Jawaban diterima" |
| sub-agent `literature-searcher` | "Agen pencari literatur bekerja" | "Agen pencari literatur selesai" |
| fase `plan/literature/…` | "Merencanakan strategi" / "Mencari literatur" / … | (idem, selesai) |

---

## 5. Cara Frontend Menerima & Menampilkan Event

### 5.1 Data (Fase 1 — tanpa perubahan backend)

Event **sudah** ada di `run.events` (via `listRuns`). Tambah field `activity: ActivityEvent[]` pada `UiResearchRun` (`uiAdapters.ts`) & `ResearchRun` (`types/index.ts`), diisi `uiRunFromRow` memanggil `activityEventsFromRun(row)`. Aliran data lama (`listRuns → uiRunFromRow → AgentRunBlock`) tetap utuh; hanya menambah satu field.

### 5.2 Komponen

Rewrite isi `AgentRunBlock` (`components/run-progress.tsx`) — atau ekstrak `components/run-activity-timeline.tsx` — agar merender `run.activity` (bukan `run.steps` yang yatim):

- **Header ringkas (selalu terlihat):** aktif → `<Shimmer>Sedang mengerjakan · {judul-node-aktif}</Shimmer>`; selesai → "Selesai · {durasi}"; gagal → "Berhenti sebelum selesai"; cancelled → "Dihentikan". Default **expanded saat run aktif**, auto-collapse jadi ringkasan saat selesai (mengikuti idiom `useState(isDeep)` yang ada).
- **Tiap node** = satu baris: ikon status (`Spinner` running, `CheckIcon` mint completed, `XCircleIcon` coral failed, `ClockIcon` pending, `ShieldIcon` waiting_approval) + judul (`Shimmer` jika running) + `description` + durasi.
- **Nested children** (sub-agent → tools): indentasi dengan idiom `border-l border-border/70 pl-3` yang sudah ada; node sub-agent menunjukkan "dijalankan oleh agen lain" (req 6).
- **Progressive disclosure** (req 7): node dengan detail (metadata/children) bisa di-expand (chevron + Collapsible, reuse pola `run-progress`). Tampilan utama = ringkasan; detail muncul saat dibuka. `visibility: "developer"|"hidden"` **tidak dirender** di Fase 1.
- **Error state** (req 21–22): node failed menampilkan `description` error yang aman (bukan "Something went wrong"); run tidak otomatis gagal total karena satu tool gagal — node lain tetap tampil, run lanjut/parsial bila runtime mendukung.
- **Live** karena Convex reaktif: `listRuns` re-emit saat event baru ditulis → React re-render. Node `running` memakai `Date.now()` untuk durasi berjalan (sudah dilakukan `formatRunDuration`).

### 5.3 Final answer tetap terpisah (req 18–19)

Jawaban akhir tetap `MessageRow` terpisah (sudah begitu secara struktural). Token streaming jawaban tetap lewat `StreamBridge`+`useSmoothText` — **tidak** dimasukkan ke activity stream.

---

## 6. Nested Sub-agent (req 4, 6)

- **Model:** `ActivityEvent.parentId` + `children[]`. Node sub-agent (`actor:"subagent"`) menampung tool-nya.
- **Fase 1 (coarse):** group by window `seq` `subagent_start..subagent_stop`. Akurat untuk normal mode (tanpa sub-agent) dan untuk deep mode memberi pengelompokan kasar + penanda "agen X".
- **Fase 3 (presisi):** tangkap `parent_tool_use_id` di `StreamBridge` (sudah dibaca, tinggal di-emit sebagai hint) + `agent_id` dari `SubagentStart`, lalu nest tool tepat di bawah Task `tool_use_id` sub-agent-nya. Memungkinkan atribusi benar untuk sub-agent paralel. Perlu pelebaran hook matcher (global) agar tool internal sub-agent ikut ter-emit.

---

## 7. Tool Activity (req 5)

- Satu node tool = `tool_start`(+`tool_end`) terlipat, status `running→completed/failed`, durasi.
- **Fase 1:** judul dari katalog ("Mencari sumber web", "Membaca dokumen", "Menjalankan analisis", "Memvalidasi hasil", "Selesai …"). Tanpa input/output (payload masih tipis).
- **Fase 2 (enrichment backend):** `description` dari ringkasan tersanitasi — jumlah hasil, nama file aman, dll. Recovery/gagal: `PostToolUseFailure` → node `failed` + pesan aman; run bisa fallback/lanjut (req 22).

---

## 8. Cegah Kebocoran Reasoning/Data Sensitif (req 8–9)

- **Tidak pernah ditampilkan:** raw chain-of-thought, hidden reasoning, prompt internal, API key/token/secret, raw payload. (CoT/thinking tidak masuk event sama sekali — hanya teks jawaban final yang masuk `chatMessages.text` via `StreamBridge`, dan itu pun hanya block `text`, bukan `thinking`.)
- **Sanitasi di sumber (Fase 2)** = chokepoint tunggal di `apps/agents` sebelum persist: `agent/activitySanitizers.ts` dengan **allow-list per tool** (`TOOL_SANITIZERS`). Hanya skalar yang diizinkan yang masuk `payloadJson`; `tool_input`/`tool_response` mentah **tidak pernah** ditulis. Default-deny untuk tool tak dikenal (hanya nama).
  - Contoh: `searchWeb → {resultCount}`, `searchThreadDocuments → {hitCount}`, `lookupDoi → {doi}`, `proposeArtifact → {title, action}`, `verifyStatistics → {checksRun, discrepant}`.
- **Visibility gating di client:** Fase 1 hanya render `visibility:"user"`. `compaction`/`run_status` internal → `hidden`/`developer` (tak tampil). Dev-mode ditunda (struktur sudah siap).
- **Label human-readable** menggantikan label mentah (`mcp__aqsha__searchWeb`, `bash_execute`, JSON panjang) — req 35–36. Technical name disimpan di `metadata` ber-`visibility:"developer"` untuk dev-mode nanti (req 37).

---

## 9. Perubahan Implementasi (per file)

### Fase 1 — Frontend-only ✅ SELESAI (commit `ed5c5c2`)
| File | Perubahan |
|---|---|
| `packages/agent-contracts/src/activity.ts` (**baru**) | `ActivityEvent` + `activityEventsFromRun()` + katalog label. Export via `index.ts`. |
| `packages/agent-contracts/src/uiAdapters.ts` | `uiRunFromRow`: isi field baru `activity` via `activityEventsFromRun(row)`. |
| `apps/web/.../types/index.ts` | Tambah `activity: ActivityEvent[]` ke `ResearchRun`. |
| `apps/web/.../components/run-progress.tsx` | Render `run.activity` (timeline) menggantikan rendering `steps` yatim. Reuse Shimmer/chevron/Spinner/ikon/durasi. (Opsional ekstrak `run-activity-timeline.tsx`.) |
| `packages/agent-contracts/tests/…` | Unit test normalizer. |

Tidak menyentuh (kompatibilitas): `schema.ts`, store, `service.ts`, `streamBridge.ts`, `transcript-model.ts`, `message-hitl-parts.tsx`, `listRuns`. Field legacy `steps`/`events` dibiarkan dulu (dipakai deep/sources); **cleanup** (hapus `steps` yatim + `eventStepKey`) jadi follow-up rapikan kode.

### Fase 2 — Enrichment backend (didokumentasikan)
| File | Perubahan |
|---|---|
| `apps/agents/src/agent/hooks.ts` | Wire arg `toolUseID` ke `tool_start/end`; tambah `tool_response` ke `HookInputLike`; isi `inputSummary`/`resultSummary` tersanitasi; set `status` di `tool_end`; hook `PostToolUseFailure`; tambah `agentId` ke subagent events. |
| `apps/agents/src/agent/activitySanitizers.ts` (**baru**) | `TOOL_SANITIZERS` allow-list + `sanitizeToolInput/Result`. |
| `packages/agent-contracts/src/run.ts` | (Additive, opsional) skema payload bertipe per event (`toolEventPayloadSchema`, …) — backward compatible, event tipis lama tetap parse. |
| `packages/convex/convex/agent/queries.ts` | (Opsional) public `listRunEvents({runId})` ber-ownership-guard + paginasi `seq`, mengurangi read-amplification `listRuns` (yang re-fetch semua event tiap heartbeat). Pakai index `by_run_seq` — tanpa perubahan schema. |
| `apps/agents/tests/hooks.test.ts` | Test sanitasi (raw query/secret TIDAK ada di payloadJson) + status gagal. |

### Fase 3 — Presisi & skala (didokumentasikan)
- `StreamBridge`: emit hint `parent_tool_use_id` → nesting presisi sub-agent paralel; pelebaran hook matcher global untuk tool internal sub-agent + Task.
- `interactions.ts`: emit `interaction_resolved` di jalur timeout→resume (agar node approval selalu tertutup).
- `runManager.cancelRun`: emit event terminal `cancelled`.
- Dev/debug mode toggle (render `visibility:"developer"`).
- Accordion per-fase untuk `/deep`.

### Perubahan API contract & backward-compat (req 31)
- `RunEvent` wire **tidak berubah** (payload tetap open). Semua penambahan payload bersifat **additive-optional** → event tipis lama tetap valid.
- `ActivityEvent` adalah **view-model turunan** (bukan wire/DB) → tidak ada migrasi, tidak ada perubahan index/schema, `listRuns` tetap.

---

## 10. Cara Menguji (req 39)

**Unit (`packages/agent-contracts/tests/activity.test.ts`):**
- Run dimulai → ada node `run` running.
- Event terurut by `seq`.
- `tool_start`+`tool_end` → satu node `running→completed` + `durationMs`.
- Window `subagent_start..stop` → node sub-agent dengan `children`.
- `error` → node `failed`; run `failed` menutup node running.
- `interaction_pending` → node `waiting_approval`; `interaction_resolved` menutupnya.
- **No-leak:** `metadata`/payload hanya berisi key allow-list (assert tak ada query mentah/secret).

**Backend (Fase 2, `apps/agents/tests/hooks.test.ts`):** hooks meng-emit payload tersanitasi; `payloadJson` hanya skalar whitelist; `PostToolUseFailure` → status error.

**Web:** render test `run-activity-timeline` — node berurutan, Shimmer saat running, jawaban akhir tetap `MessageRow` terpisah.

**E2E manual** (stack lokal: `apps/agents` `bun src/main.ts` :8787 + `ngrok http 8787` + `bun run dev:app`, `AGENTS_STORE=convex`):
1. Kirim prompt yang memicu `searchWeb` → amati node "Mencari sumber web" running→completed live.
2. Picu error tool → node failed + pesan aman.
3. `/deep` → fase + sub-agent muncul ber-nest, jawaban akhir mengalir terpisah.
4. Inspect Network/Convex payload → tak ada secret/CoT/raw payload.

Gate: `bun run typecheck && bun run lint && bun run --filter '@aqsha/convex' test` (+ `apps/agents` vitest), lalu `convex dev --once` bila ada perubahan Convex (Fase 2).

---

## 11. Contoh Skenario UX (req 40)

```
User: "Analisis paper ini dan beri rekomendasi."

Timeline (live, di dalam AgentRunBlock):
▸ Menjalankan permintaan…                     (run · running)
  ✓ Mencari dokumen di thread · 3 hasil        (tool · 0:02)
  ⟳ Mencari sumber web…                         (tool · running, Shimmer)
  ✓ Memverifikasi kutipan · 8 diperiksa, 1 ditandai
  🛈 Menunggu persetujuan: simpan dokumen        (approval · waiting)  → kartu HITL existing
  ✓ Menyimpan dokumen                            (tool · 0:01)
  ✓ Selesai · 0:18                               (run · completed)

(Jawaban akhir muncul sebagai MessageRow terpisah, teks mengalir.)

Mode deep:
▸ Riset mendalam…
  ✓ Merencanakan strategi
  ▸ Mencari literatur
     › Agen pencari literatur bekerja            (subagent)
        ✓ Mencari preprint arXiv · 5 hasil
        ✓ Memverifikasi DOI
  ✓ Memverifikasi kutipan
  ✓ Menulis laporan → jawaban akhir mengalir
```

---

## 12. Trade-off & Catatan

- **Fase 1 jujur tapi bisa terasa minim** untuk Q&A singkat tanpa tool (sesuai keputusan "hanya event nyata"): hanya `run started → answer → completed`. Tidak ada progress karangan (req 2/28 terpenuhi).
- **Nesting sub-agent paralel** tidak presisi sampai Fase 3 (keterbatasan SDK: `parent_tool_use_id` hanya di stream). Fase 1 memberi pengelompokan kasar + penanda agen — di-disclose jujur, bukan klaim palsu.
- **Read-amplification:** Fase 1 memakai `listRuns` (re-fetch semua event tiap heartbeat); bounded (`MAX_RUNS`, `MAX_EVENTS_PER_RUN`) dan dapat diterima. Query khusus `listRunEvents` adalah optimasi Fase 2.
- **Rapikan kode (sejalan emphasis owner):** setelah timeline `activity` terbukti, hapus jalur `steps` yatim + `eventStepKey` + mapping `events` lama di `uiAdapters` agar tak ada dua representasi.
