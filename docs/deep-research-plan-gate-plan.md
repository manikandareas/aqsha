# Rencana Implementasi Final: Gate Plan-Approval Deep Research (`proposeResearchPlan`)

> Status: rencana (belum diimplementasi). Disusun 2026-06-16 dari audit + design workflow
> (5 fase: pendalaman → desain 2 pendekatan → sintesis → review adversarial 3 lensa → finalisasi).
> 33 temuan review, 12 must-fix terintegrasi ke langkah relevannya.

## 1. Ringkasan & Tujuan

Menambahkan satu gate human-in-the-loop (HITL) di awal alur `/deep`: setelah fase `plan` mendekomposisi pertanyaan riset menjadi 3-6 sub-pertanyaan, run berhenti (`waiting_hitl`) dan menampilkan kartu rencana yang dapat user edit, lalu user memilih **Mulai** (jalankan riset dengan rencana, opsional sudah disunting), **Minta revisi** (model menyusun ulang sub-pertanyaan dengan instruksi), atau **Tolak** (batalkan run). Pendekatan terpilih adalah **SDK tool `proposeResearchPlan`** yang mengalir lewat plumbing `interruptState` existing (identik pola `proposeArtifact`), dengan satu pinjaman dari alternatif sintetis (`questions: string[]` sederhana, bukan objek). Dokumen ini mengintegrasikan 11 must-fix dari review ke dalam langkah relevannya (terutama: poisoning research-question lewat `deepQuestion`, idempotensi replay, node timeline menggantung saat revise, mis-fire `primeResolvedApproval`, fallback no-tool yang harus park manual eksplisit, label `running` bukan `waiting`, prop-drilling status run ke kartu, dan zombie-card saat cancel) plus should/nice-to-have sebagai catatan inline.

## 2. Keputusan Owner yang Dipatuhi

- **Composer terkunci selama gate** (sesuai `isDeepActive` existing). "Minta revisi" lewat textarea DI KARTU, bukan composer free-text. Konsekuensi: dua pola HITL (askUser composer-open vs plan kartu-only) — konsisten internal, diterima.
- **Bahasa Indonesia** untuk semua copy UI, sentence case, tanpa uppercase (memory `copywriting-no-uppercase`). Istilah teknis tetap Inggris.
- **Typed contracts atas parser rapuh** (memory `code-organization-emphasis`): struktur rencana datang dari tool input terstruktur, bukan parsing Markdown prosa. Render Markdown lewat satu fungsi tunggal di `agent-contracts`.
- **Hapus dead-code konsisten, jangan setengah-setengah**: `startDeepResearch` dihapus dari SEMUA situs (termasuk komentar JSDoc dan test), diganti `proposeResearchPlan`.
- **Greenfield prod**: tidak ada migrasi data; schema Convex tidak berubah.

## 3. Arsitektur Solusi

**Pendekatan: SDK tool `proposeResearchPlan` (gated via `canUseTool`), reuse jalur `interruptState`.**

Alasan singkat:
1. **Reuse plumbing terverifikasi tanpa modifikasi.** `runManager.ts:711-747` (cabang `interruptState`) sudah melakukan persis yang gate butuhkan: simpan `sdkSessionId`, `finalizeRun waiting_hitl`, `setThreadStatus idle`, emit `run_status`, dan race-guard self-resume. Tool gate mengalir lewat ini apa adanya — sama seperti `proposeArtifact` di fase `write`.
2. **Menghapus seluruh kelas bug "parser plan".** `{title, summary, questions[]}` terstruktur langsung dari tool input — zero parsing prosa.
3. **Konsistensi pola.** Codebase punya satu pola HITL-gate (`proposeArtifact` → `canUseTool` → `requestApproval` → interrupt). Gate ini menjadi instance kedua dari pola yang sama.

**Pinjaman: `questions: string[]`** (bukan objek `{id, question, searchStrategy, evidenceTypes}`) — menyederhanakan kartu editable dan render Markdown.

**Reuse type `tool_approval`** (bukan tipe interaksi baru) — schema Convex `pendingInteractions` TIDAK berubah (`type` tetap `ask_user|tool_approval`; `toolName` string bebas; index `by_run_status` + literal `superseded` SUDAH ADA — dikonfirmasi di `schema.ts:686,694,702`).

**Invariant kunci (koreksi klaim Bagian-2 plan v1):** fallback no-tool MEMPERKENALKAN satu jalur park manual. Klaim "zero blok manual" tidak lagi akurat. Untuk membatasi duplikasi, kita extract helper `parkForPlanReview(...)` yang dipakai bersama cabang `interruptState` dan fallback (DRY).

## 4. Perubahan Backend (`apps/agents`)

### 4.1 `src/tools/proposeResearchPlan.ts` (BARU)
Tool SDK no-side-effect (pola `proposeArtifact` di `tools/artifacts.ts:36-60`). Input zod `{ title: z.string().min(1).max(120), summary: z.string().max(500).optional(), questions: z.array(z.string().min(1).max(500)).min(3).max(6) }`. Handler hanya return `jsonResult({ proposed: true, ... })` — tak pernah dieksekusi (saat `canUseTool` deny pada interrupt, SDK tidak menjalankan handler). Export `buildResearchPlanTool(ctx)`.

### 4.2 `src/tools/index.ts`
Daftarkan di `buildAqshaMcpServer` (`:20-27`): tambah `buildResearchPlanTool(ctx)` ke array `tools`. Titik registrasi yang sama dengan `proposeArtifact`.

### 4.3 `src/agent/toolPolicy.ts`
Tambah `"proposeResearchPlan"` ke `APPROVAL_GATED_TOOL_NAMES` (`:49-55`) → otomatis masuk `APPROVAL_GATED_TOOL_NAME_SET`. JANGAN tambahkan ke `allowedToolsForTurn` (`:84-90`) — biarkan jatuh ke `canUseTool` (sama `proposeArtifact`, lihat komentar `:79-83`). Defense-in-depth opsional (should-fix): PreToolUse hook tolak `proposeResearchPlan` jika `phase !== "plan"`.

### 4.4 `src/agent/interactions.ts`
- **`RunInterruptState.reason` (`:26`)**: tambah `"plan_review"` ke union.
- **`requestApproval` (`:135-138`)**: set `reason` kondisional — `input.toolName === "proposeResearchPlan" ? "plan_review" : "approval"`.
- **`primeResolvedApproval` (`:43-47`) — MUST-FIX (mis-fire pada plan_decision)**: perketat guard agar HANYA prime approval murni. Ganti `if (interaction.type === "tool_approval" && interaction.response)` menjadi `if (interaction.type === "tool_approval" && interaction.response?.kind === "approval")`. Ini mencegah response `plan_decision` ter-prime, yang pada `revise` akan dikonsumsi `takePrimedApproval` lalu di-no-op secara kebetulan dan menyebabkan blok `interaction_resolved` (`:103-107`) dilewati (node timeline menggantung). Defense kedua di runManager (4.6) tetap dipasang (skip prime saat `resolvePlanDecision` non-null) — keduanya, agar tak bergantung satu titik.
- **`resumePromptForInteraction` (`:236-270`) — MUST-FIX (fallthrough ke "declined")**: sisipkan cabang `plan_decision` SETELAH blok `answers` (`:255`) dan SEBELUM `if (response.approved)` (`:256`). Tanpa ini, `plan_decision` (yang `.approved` = `undefined`) jatuh ke template "declined" (`:267`) — kebalikan dari intent `revise`. Implementasi: exhaustive — `revise` → `"The user reviewed your research plan and requested revisions: {revisionInstruction}. Revise the sub-questions accordingly, then call proposeResearchPlan again with the updated plan. Do not perform searches."`; `start`/`reject` → string benign eksplisit (jalur ini tak seharusnya tercapai karena Branch B short-circuit; gunakan default aman, bukan fallthrough). Tambah unit test per-decision (should-fix).

### 4.5 `src/agent/deepPhases.ts`
Ubah prompt case `plan` (`:85-91`):
```
PHASE 1/5 — RESEARCH PLAN. Decompose the research question into 3-6 focused,
independently searchable sub-questions. Then call proposeResearchPlan with a short
title, a one-sentence summary, and the array of sub-questions. Do NOT perform searches.
Do NOT write the plan as a chat message — submit it via the tool.
```
`DEEP_PHASE_POLICIES.plan` tetap `{ maxTurns: 4, useSubagents: false, streamsToChat: false }`.

### 4.6 `src/runs/runManager.ts`

**(a) `deepQuestion` (`:517-531`) — MUST-FIX (research-question poisoning).**
Bug: pada resume, `deepQuestion(isResume=true)` memindai `listMessages` mundur dan mengembalikan teks user terakhir. Setelah plan decision apa pun, pesan user terakhir adalah bubble HITL termaterialisasi (`humanizeInteractionResponse`), BUKAN `/deep <q>` asli. Untuk `start`, seluruh fase hilir (`section("Research question", question)` di `buildDeepPhasePrompt`) meriset string salah ("Mulai riset dengan rencana ini."). Hari ini laten karena fase plan belum punya interaksi; gate ini mengaktifkannya.
Fix (opsi a — kanonis, dipilih): persist research question pada run/phase saat `startRun`. Karena `request.prompt` saat `startRun` sudah = `effectivePrompt` (args `/deep` ter-strip, `runManager.ts:103-106,130`), simpan ke `researchPhaseStates` fase `plan` sebagai sumber kebenaran, atau baca balik dari `run.promptMessageId`. Implementasi minimal yang aman: di `deepQuestion`, JANGAN pakai heuristik last-user-message; sebagai gantinya ambil pesan pada `request.promptMessageId` (run.promptMessageId), atau pesan user yang `text.startsWith("/deep")`, atau — paling robust — baca question yang sudah dipersist. Test wajib: `/deep <q>` → plan gate → start → assert prompt fase `literature` memuat `<q>` ASLI, bukan bubble.

**(b) Branch B di `executeDeepRun`, sisipkan setelah `this.active.set(runId, activeRun)` (`:563`) dan SEBELUM `for (const phase of DEEP_PHASES)` (`:576`).**

```ts
const planResume = resolvePlanDecision(turn?.resumeInteraction);
// MUST-FIX (prime mis-fire): jangan prime untuk plan_decision; tangani di Branch B.
if (turn?.resumeInteraction && !planResume) {
  this.broker.primeResolvedApproval(runId, turn.resumeInteraction);
}
```
> Catatan: pindahkan `primeResolvedApproval` existing (`:566-568`) ke dalam guard `!planResume` ini. Dengan perketat guard di 4.4 ini double-safe.

```ts
if (planResume?.decision === "reject") {
  // SHOULD-FIX (urutan cancel): tiru cancelRun (:209-215) PERSIS — finalizeRun
  // dulu (sticky guard service.finalizeRun:345 menang race), lalu thread idle,
  // lalu event. finalizeMessage boleh setelahnya (tak perlu mendahului terminal).
  await store.appendRunEvent({ runId, type: "interaction_resolved",
    payload: { interactionId: turn!.resumeInteraction!.id, toolName: "proposeResearchPlan" } });
  await store.finalizeRun(runId, { status: "canceled" });
  await store.setThreadStatus(request.threadId, "idle");
  await store.appendRunEvent({ runId, type: "run_status",
    payload: { status: "canceled", reason: "plan_rejected" } });
  await store.finalizeMessage(assistantMessage.messageId, {
    text: "Rencana riset ditolak. Kirim /deep lagi kapan saja untuk memulai ulang.",
    status: "complete" });
  this.active.delete(runId);
  return;
}

if (planResume?.decision === "start") {
  await store.appendRunEvent({ runId, type: "interaction_resolved",
    payload: { interactionId: turn!.resumeInteraction!.id, toolName: "proposeResearchPlan" } });
  const planText = planResume.editedPlan
    ?? renderResearchPlanMarkdown(parseResearchPlanPayload(turn!.resumeInteraction!.payload));
  const done = await store.upsertResearchPhase({ runId, phase: "plan", status: "done", output: planText });
  states.plan = done;
  await store.appendRunEvent({ runId, type: "phase_done", payload: { phase: "plan", approved: true } });
  // SHOULD-FIX (bubble divergen): assistantMessage masih kosong di titik ini
  // (gate park belum menulis prosa karena park-pertama-lah yang menulis). Pada
  // start kita tidak menulis prosa lain; trace read-only diatasi di §8.
  // resumeConsumed tetap false → loop skip plan (done) → literature fresh.
}

if (planResume?.decision === "revise") {
  // MUST-FIX (node menggantung): emit interaction_resolved untuk interaksi
  // revise lama, simetris dengan start/reject. Tanpa ini node approval lama
  // menggantung "waiting_approval" sampai safety-net terminal.
  await store.appendRunEvent({ runId, type: "interaction_resolved",
    payload: { interactionId: turn!.resumeInteraction!.id, toolName: "proposeResearchPlan" } });
  // revise TIDAK mark done; loop lihat plan masih running + sdkSessionId →
  // resumingThisPhase=true → resumePromptForInteraction inject instruksi →
  // model re-call proposeResearchPlan → park lagi via interruptState.
  // SHOULD-FIX (session continuity): bergantung pada existing.sdkSessionId yang
  // dipersist saat park (:714-718) DAN dipertahankan oleh merge `?? existing`
  // di upsertResearchPhase status:"running" (:627). resumePromptForInteraction
  // tetap meng-inject revisionInstruction walau sdkSessionId undefined, jadi
  // revise tetap benar tanpa over-claim kontinuitas sesi.
}
```

Helper `resolvePlanDecision(i?: PendingInteraction): { decision: "start"|"revise"|"reject"; editedPlan?: string; revisionInstruction?: string } | null` — null jika `i` undefined / `toolName !== "proposeResearchPlan"` / `status !== "responded"` / `response.kind !== "plan_decision"`.

**(c) MUST-FIX (replay idempotency — re-enter & re-gate).**
Replay durable (re-dispatch tanpa `turn`/`resumeInteraction`) → `resolvePlanDecision` null → loop. Fase plan tersimpan `running` (bukan `done`) → tidak di-skip (`:578`); `isResume=false` → `resumingThisPhase=false` (`:608-609`) → fase plan DI-RUN ULANG fresh, model re-call tool → interaksi pending KEDUA dibuat, kartu pertama orphan.
Fix: sebelum me-run fase `plan` (di dalam loop, saat `phase === "plan"` dan `existing?.status === "running"`), cek interaksi pending `proposeResearchPlan` milik run via index `by_run_status` (tambah store method `listPendingInteractionsByRun(runId)` → service query memakai `by_run_status` `q.eq("runId",runId).eq("status","pending")`). Jika ada yang masih pending dan `toolName === "proposeResearchPlan"`, RE-PARK lewat `parkForPlanReview(...)` tanpa membuat interaksi baru dan tanpa re-query. Test wajib: park plan → re-dispatch tanpa resumeInteraction → assert tidak ada interaksi kedua, run tetap `waiting_hitl`.
> Nice-to-have terkait (overlap dispatch satu runId): tambah guard in-flight per-runId di `executeWhenSlotFree`/`executeDeepRun` (`this.active.has(runId)` → no-op dispatch kedua), mirroring `server.ts:55-60`. `acquireSlot` tidak dedupe by runId.

**(d) MUST-FIX (fallback gate-tak-bocor — HARUS park manual eksplisit, BUKAN via broker).**
Di cabang sukses fase plan (`:788`), SEBELUM `upsertResearchPhase done`, jika `phase === "plan"` DAN `interruptState` tak pernah terisi (model tak panggil tool), gate bocor diam (regresi ke perilaku lama). Koreksi penting: `:788` berjalan SETELAH `finally` (`:698-701`) yang sudah `broker.unregisterRun(runId)` (membersihkan interruptStates/interruptRequests/primedApprovals) dan stream sudah selesai — jadi `broker.requestApproval`/`flagInterrupt` adalah no-op. Fallback HARUS park manual eksplisit yang menyalin urutan `:711-746`. Extract `parkForPlanReview(...)` helper, dipakai bersama (DRY):
```
parkForPlanReview({ runId, threadId, ownerUserId, phase, sdkSessionId, payload, assistantMessageId, finalText }):
  1. interaction = store.createInteraction({ ownerUserId, threadId, runId,
       type: "tool_approval", toolName: "proposeResearchPlan", payload })
  2. store.appendRunEvent interaction_pending { interactionId, toolName }
  3. store.upsertResearchPhase { runId, phase: "plan", status: "running", sdkSessionId }
  4. store.finalizeMessage(assistantMessageId, { text: finalText, status: "complete" })
  5. store.finalizeRun(runId, { status: "waiting_hitl" })
  6. store.setThreadStatus(threadId, "idle")
  7. store.appendRunEvent run_status { status: "waiting_hitl", phase, reason: "plan_review", interactionId }
  8. RACE-GUARD: getInteraction(interactionId); if responded → void resumeRun(runId, interactionId)
  9. this.active.delete(runId); return
```
Untuk cabang `interruptState` existing, refactor agar memanggil `parkForPlanReview` juga (payload dari `interruptState`, sdkSessionId = `result.sessionId`). Fallback membungkus `{ title: question, summary: "", questions: extractLines(result.finalText) }`. Test wajib: (1) fase plan selesai tanpa tool → satu interaksi pending dibuat, run `waiting_hitl`, thread idle, node approval muncul; (2) responder membalas di race-window (antara createInteraction dan finalizeRun) → run resume (race-guard).

**(e) `resumeRun` (`:164-170`): TIDAK BERUBAH.** `resume_after_approval` di-hardcode `proposeArtifact` (`:166`); `proposeResearchPlan` jatuh ke `"initial"` — benar (tool tak butuh `executeArtifact` retry). `revise` re-enter fase plan via `resumingThisPhase` + `existing.sdkSessionId`, bukan `TurnPhase`.

**Nice-to-have (cost-guard revise loop):** klaim "revise dibatasi cost-guard per-dispatch" menyesatkan — `dispatchCostUsd` reset ke 0 tiap dispatch (`:573`); per-dispatch budget membatasi SATU turn, bukan jumlah revisi lintas-dispatch. Koreksi narasi, atau (opsional) seed `dispatchCostUsd` dari `listResearchPhases` cumulative / counter revisi persisted. Tidak memblokir.

## 5. Perubahan Convex (`packages/convex`)

### 5.1 Schema (`schema.ts:683-702`): ZERO perubahan
`type` tetap `ask_user|tool_approval`; `toolName` bebas; `payloadJson`/`responseJson` bebas; index `by_run_status` + literal `superseded` SUDAH ADA. Tidak ada migrasi.

### 5.2 `convex/agent/interactions.ts` — MUST-FIX atomik (nice-to-have ordering)
**Widen validator + guard dalam SATU edit** (jangan tinggalkan state intermediat yang menolak `plan_decision`):
- `responseValidator` (`:23-35`) adalah `v.union` biasa: tambah cabang ketiga
  ```ts
  v.object({ kind: v.literal("plan_decision"),
    decision: v.union(v.literal("start"), v.literal("revise"), v.literal("reject")),
    editedPlan: v.optional(v.string()), revisionInstruction: v.optional(v.string()) }),
  ```
- **Guard type↔kind (`:59-70`) — SHOULD-FIX (perketat berbasis toolName, bukan hanya type).** Guard saat ini berbasis `type`; melonggarkan `tool_approval`→`plan_decision` membuka SEMUA tool_approval menerima `plan_decision` (frontend bisa kirim `plan_decision` ke kartu artifact). Fix:
  - `ask_user` + non-`answers` → tolak (sudah ada, aman).
  - `tool_approval` + `proposeResearchPlan` → terima HANYA `plan_decision` (tolak `approval`).
  - `tool_approval` + tool lain → terima HANYA `approval` (tolak `plan_decision`).
  Implementasi: cek `interaction.toolName === "proposeResearchPlan"` untuk merutekan ekspektasi.
- **`humanizeInteractionResponse` (`hitl/humanize.ts`) — MUST/SHOULD-FIX (dua sumber kebenaran tipe).** `HitlResponse` (`humanize.ts:24`) didefinisikan MANUAL (`AnswerResponse | ApprovalResponse`), TERPISAH dari zod. Tambah `PlanDecisionResponse = { kind: "plan_decision"; decision: "start"|"revise"|"reject"; editedPlan?: string; revisionInstruction?: string }` ke union, DAN cabang `if (response.kind === "plan_decision")` di fungsi: `start` → `"Mulai riset dengan rencana ini."` (+ ` (dengan suntingan)` jika `editedPlan`, lihat §8); `revise` → `revisionInstruction`; `reject` → `"Tolak rencana riset."`. Pertimbangkan meng-infer `HitlResponse` dari `InteractionResponse` (`@aqsha/agent-contracts`) untuk hapus duplikasi (code-organization-emphasis).
- Trigger resume (`:100-111`): tak berubah (`waiting_hitl` → `forwardResume`).

### 5.3 `convex/agent/hitl/hitlToolNames.ts`
GANTI (bukan hapus) `"startDeepResearch"` → `"proposeResearchPlan"` di `PENDING_HITL_TOOL_NAMES` (`:25`) DAN `HITL_CARD_TOOL_NAMES` (`:34`). Penggantian agar `proposeResearchPlan` lolos `HITL_CARD_TOOL_NAME_SET` (`hitl-parts.ts:29`). Perbarui komentar `:21` yang menyebut `startDeepResearch`.

### 5.4 `convex/agent/service.ts`
- `createInteraction` (`:479`): ZERO perubahan (NON-idempotent — replay idempotency ditangani di runManager 4.6c via lookup-pending sebelum re-park).
- **TAMBAH** query service `listPendingInteractionsByRun(runId)` (untuk 4.6c) memakai index `by_run_status` (`q.eq("runId",runId).eq("status","pending")`), atau perluas store method existing. `interactionTypeValidator` TIDAK disentuh (reuse `tool_approval`).

## 6. Perubahan Contracts (`packages/agent-contracts`)

### 6.1 `src/interaction.ts`
- TIDAK menambah `interactionTypeSchema` (`:9`) — reuse `"tool_approval"`.
- `interactionResponseSchema` (`:41-54`) adalah `z.discriminatedUnion("kind", [...])` — tambah cabang ketiga:
  ```ts
  z.object({
    kind: z.literal("plan_decision"),
    decision: z.enum(["start", "revise", "reject"]),
    editedPlan: z.string().max(20_000).optional(),
    revisionInstruction: z.string().max(2_000).optional(),
  }),
  ```
- Payload schema + parser + renderer:
  ```ts
  export const researchPlanPayloadSchema = z.object({
    title: z.string().min(1).max(120),
    summary: z.string().max(500).optional(),
    questions: z.array(z.string().min(1).max(500)).min(1).max(8),
  });
  export type ResearchPlanPayload = z.infer<typeof researchPlanPayloadSchema>;
  export function parseResearchPlanPayload(raw: unknown): ResearchPlanPayload // safeParse + fallback { title: "Rencana riset", questions: [] }
  export function renderResearchPlanMarkdown(p: ResearchPlanPayload): string   // "## {title}\n\n{summary}\n\n1. {q1}\n2. {q2}…"
  ```
  `renderResearchPlanMarkdown` adalah SATU sumber kebenaran format — dipakai web (saat `start`) DAN backend (fallback + start tanpa editedPlan), agar `section("Research plan", priorOutputs.plan)` (`deepPhases.ts:98,127`) deterministik.

### 6.2 `src/activity.ts` — MUST-FIX (kunci `running`, bukan `waiting`)
Tipe `Label` (`:59`) = `{ running; completed; failed? }` — TIDAK ADA kunci `waiting`. Node approval dirender via `label.running` (case `interaction_pending`). Tambah ke `APPROVAL_LABELS` (`:141-163`) PERSIS pola `proposeArtifact` (`:143-146`):
```ts
proposeResearchPlan: { running: "Menunggu persetujuan rencana riset", completed: "Rencana riset disetujui" },
```
Test assert `APPROVAL_LABELS.proposeResearchPlan.running` non-kosong (bukan `FALLBACK_APPROVAL_LABEL`).

## 7. Perubahan Frontend (`apps/web`)

### 7.1 `features/thread-experience/components/research-plan-review-card.tsx` (BARU)
**Keputusan shell (owner, 2026-06-16): prose no-chrome, BUKAN `Plan` AI Elements.** Reuse styling/token dari `hitl-plan-review-card.tsx` (render sebagai prosa agen natural tanpa Card/border), selaras arah `hitl-conversational-redesign` (inline, no-card) dan konsisten dengan HITL lain (askUser/confirm). Komponen `Plan` AI Elements (`components/ai-elements/plan.tsx`, ber-chrome Card+Collapsible, saat ini 0 import) SENGAJA tidak dipakai untuk gate ini. JANGAN rusak `HitlPlanReviewCard` (masih dipakai `proposeArtifact`/`createWorkspace`/`renameWorkspace`). Props:
```ts
{ title: string; summary?: string; questions: string[]; disabled?: boolean;
  onStart: (editedQuestions: string[]) => void;
  onRevise: (instruction: string) => void;
  onReject: () => void; }
```
State lokal: `useState<string[]>(questions)` editable (item + tambah/hapus), `revisionDraft`, `mode: "review"|"revising"`. Footer: [Tolak] [Minta revisi] (buka textarea → submit `onRevise`) [Mulai] (submit `onStart(editedQuestions)`). Reuse token styling dari `hitl-plan-review-card.tsx`.
**Nice-to-have (edit hilang saat re-render):** JANGAN sinkronkan `questions` prop ke state via `useEffect` — state edit dimiliki kartu sampai submit. Initializer `useState` jalan sekali; key kartu = interaction id stabil. Cantumkan komentar invarian ini.

### 7.2 `features/thread-experience/components/hitl-plan-review-card.tsx` — SHOULD-FIX (situs ke-4)
Perbarui JSDoc `:8-9`: hapus mention `startDeepResearch` ("the approval tools: proposeArtifact, createWorkspace, renameWorkspace"). Bagian Slice 5 cleanup. Verifikasi final `grep -rn startDeepResearch` = 0.

### 7.3 `features/thread-experience/components/message-hitl-parts.tsx`
- Ganti cabang `startDeepResearch` (`:142-165`) → `proposeResearchPlan`. **MUST-FIX (busy-state + error-handling):** bungkus seperti `approve`/`deny` existing (`:108-125`) — `setSubmitting(true)` sebelum await, try/catch `toast.error(readableConvexErrorMessage(error, "Gagal mengirim keputusan rencana."))`, teruskan `disabled={busy}`. Tambah handler `planDecision(payload)` lokal mirip `approve`/`deny`.
  ```tsx
  if (part.toolName === "proposeResearchPlan") {
    const plan = parseResearchPlanPayload(part.input);
    return <ResearchPlanReviewCard title={plan.title} summary={plan.summary} questions={plan.questions}
      disabled={busy}
      onStart={(edited) => void planDecision({ decision: "start",
        editedPlan: renderResearchPlanMarkdown({ ...plan, questions: edited }) })}
      onRevise={(instr) => void planDecision({ decision: "revise", revisionInstruction: instr })}
      onReject={() => void planDecision({ decision: "reject" })} />;
  }
  ```
- **MUST-FIX (status run → kartu):** `MessageHitlParts`/`HitlPartCard` saat ini tak terima status run. Tambah prop `runTerminal?: boolean` mengalir `AssistantTurn` → `HitlExchangeQuestion` → `MessageHitlParts` → `HitlPartCard` → `ResearchPlanReviewCard`. `disabled = busy || runTerminal`. Sumber: `AssistantTurn` SUDAH punya `run` + `isActive = isRunActive(run)` (`assistant-turn.tsx:85`); turunkan `runTerminal = Boolean(run) && !isActive && run.status !== "waiting_hitl"` (terminal sejati: canceled/failed/completed). Cegah zombie-card interaktif.

### 7.4 `features/thread-experience/components/use-hitl-resume.ts` — SHOULD-FIX (path)
Path benar = `components/use-hitl-resume.ts` (tidak ada `hooks/`). Tambah ke `HitlActions` (`:13-17`) dan `useHitlResume` (`:24-51`):
```ts
onPlanDecision: (interactionId: string, payload: { decision: "start"|"revise"|"reject"; editedPlan?: string; revisionInstruction?: string }) => Promise<void>;
// impl:
const onPlanDecision = async (interactionId, payload) =>
  await respond({ interactionId: interactionId as never, response: { kind: "plan_decision", ...payload } });
```
`useHitlResume()` adalah satu-satunya pabrik `HitlActions` — verifikasi tidak ada literal `HitlActions` manual lain (grep `onAnswer:`); typecheck akan menangkap call-site yang tertinggal jika ada.

### 7.5 Composer & `run-progress.tsx`: MOSTLY ZERO, satu MUST-FIX
- `waiting_hitl ∈ ACTIVE_RUN_STATUSES` (`run.ts:25-30`) → `isDeepActive` true → composer terkunci, Escape/Stop = `onCancelRun`. Node `approval` `proposeResearchPlan` muncul otomatis via `interaction_pending` + label baru (§6.2). "Minta revisi" lewat textarea DI KARTU.
- **MUST-FIX (answerMode menyesatkan, `composer.tsx:239,292-313`):** saat plan-gate, `activeInteraction` pending (`type: "tool_approval"`) → `answerMode = Boolean(activeInteraction && hitlActions)` TRUE → placeholder "Ketik jawabanmu…" padahal editor `disabled` (`isInteractionLocked=isDeepActive`). Plus jalur `handleSubmit` non-ask_user memanggil `onDeny` (kirim `{kind:"approval",approved:false}`) → kena guard `interaction_response_mismatch` jika lock regresi. Fix: derive `answerMode` hanya untuk ask_user yang answerable + composer tak terkunci: `const answerMode = Boolean(activeInteraction && hitlActions && activeInteraction.type === "ask_user" && !isInteractionLocked)`. (`activeInteraction.type` tersedia dari `chat-thread-state.tsx:163`.)
- **MUST-FIX (cancel → zombie card):** `cancelRun` (`runManager.ts:189-224`) tidak expire interaksi pending; kartu tetap render interaktif setelah cancel. Mitigasi UTAMA = `runTerminal` guard di kartu (§7.3) — kartu non-interaktif saat run terminal. Hardening tambahan (opsional, defense): `cancelRun` expire pending `proposeResearchPlan` milik run via `listPendingInteractionsByRun` + `expireInteraction` (sudah ada di store). Test: Escape/Stop saat plan-gate → run canceled + kartu non-interaktif + tak ada bubble hantu.

## 8. Edge Cases & Penanganannya

| Edge case | Penanganan |
|---|---|
| **Research-question poisoning** (`start` me-riset bubble HITL, bukan `/deep <q>`) | `deepQuestion` tidak pakai last-user-message; baca question kanonis (run.promptMessageId / persisted). Test wajib (§4.6a). |
| **Node timeline menggantung pada `revise`** | Branch B emit `interaction_resolved` untuk `revise` (simetris start/reject) + guard prime diperketat (§4.4, §4.6b). Test: node tertutup. |
| **`primeResolvedApproval` mis-fire untuk `plan_decision`** | Guard `response.kind === "approval"` (4.4) + skip prime saat `resolvePlanDecision` non-null (4.6b). Double-safe. |
| **Replay re-enter & re-gate** (dua kartu) | Lookup pending `proposeResearchPlan` via `by_run_status` sebelum re-run plan → re-park tanpa interaksi baru (§4.6c). |
| **Fallback no-tool (gate bocor diam)** | Park MANUAL eksplisit `parkForPlanReview` (BUKAN broker pada stream mati) + race-guard (§4.6d). |
| **Respond-while-finalizing race** (fallback & gate) | `parkForPlanReview` step 8: `getInteraction` → self-resume jika `responded` (salin `:738-745`). |
| **Cancel selama gate → zombie card** | `runTerminal` guard di kartu (§7.3); opsional expire pending di `cancelRun` (§7.5). |
| **`answerMode` menyesatkan saat composer terkunci** | `answerMode` hanya untuk ask_user + tak-terkunci (§7.5). |
| **Bubble divergen** (`start` dengan suntingan: chat bubble vs plan dieksekusi) — SHOULD-FIX | `researchPhaseStates.plan.output = editedPlan` (sumber kebenaran eksekusi). User bubble `humanize` `start` + suntingan → "Mulai riset dengan rencana ini. (dengan suntingan)". Trace read-only kartu (`hitlQuestionLines` membaca `part.input` asli, `hitl-parts.ts:62-73`) tak menampilkan suntingan — keputusan sadar: didokumentasikan, bukan bug diam. Minimal: bubble informatif. |
| **Reject race dengan cancelRun konkuren** — SHOULD-FIX | Branch B reject tiru urutan `cancelRun` + andalkan sticky `service.finalizeRun:345`. Test: satu terminal canceled + satu event. |
| **Session continuity `revise`** — SHOULD-FIX | `revisionInstruction` selalu ter-inject via `resumePromptForInteraction`; jangan over-claim resumeSessionId. Test assert hanya instruksi sampai ke prompt. |
| **Revisi tak terbatas** — nice-to-have | Setiap revise budget-bounded per-turn; jumlah revisi TIDAK terbatas lintas-dispatch. Koreksi klaim; opsional counter. |
| **Edit hilang re-render** — nice-to-have | Tanpa `useEffect`-sync; state dimiliki kartu sampai submit (§7.1). |

## 9. Slice Implementasi Berurutan (tiap slice gates-green)

- **Slice 1 — Kontrak + Convex (atomik).** `interaction.ts` (`plan_decision` + `researchPlanPayloadSchema` + `parseResearchPlanPayload` + `renderResearchPlanMarkdown`); `activity.ts` label (`running`, bukan `waiting`). Convex `agent/interactions.ts` (`responseValidator` widen + guard berbasis-toolName + `humanize` cabang + `HitlResponse` union) — **satu edit, jangan tinggalkan state yang menolak `plan_decision`**; `hitlToolNames.ts` swap + komentar; `service.ts` tambah `listPendingInteractionsByRun`. **Gate keras (dependency antar-slice):** `bun run typecheck` + `bun run lint` + `bun run --filter '@aqsha/convex' test` + `bun run --filter '@aqsha/convex' codegen` + `npx convex dev --once` (agar tipe `api.agent.interactions.respond` mengenal `plan_decision` SEBELUM frontend dikompilasi).
- **Slice 2 — Tool + gate backend.** `tools/proposeResearchPlan.ts`, `tools/index.ts`, `toolPolicy`, `interactions.ts` (reason `plan_review` + prime guard + resume-prompt cabang), prompt fase plan, system prompt. Park plan-review berfungsi. **Gate:** apps/agents test + typecheck.
- **Slice 3 — Resume branch + fallback + replay + deepQuestion.** `runManager.ts` Branch B (start/revise/reject) + `resolvePlanDecision` + `parkForPlanReview` helper (DRY dengan cabang interruptState) + fallback no-tool + replay-idempotency lookup + `deepQuestion` fix. **Gate:** apps/agents test + typecheck.
- **Slice 4 — Frontend.** `research-plan-review-card.tsx`, `message-hitl-parts.tsx` (busy/error + `runTerminal` prop), `use-hitl-resume.ts` (`onPlanDecision`), prop-drilling `runTerminal` (AssistantTurn→…→kartu), composer `answerMode` guard. **Gate:** typecheck + lint.
- **Slice 5 — Manual E2E + cleanup.** `/deep` → gate → edit→Mulai / Minta revisi (loop) / Tolak; Escape/Stop saat gate. Hapus mention `startDeepResearch` di JSDoc + test (`hitlToolNames.test.ts`). Verifikasi `grep -rn startDeepResearch` = 0.

## 10. Rencana Test

**contracts (`packages/agent-contracts`):** `interactionResponseSchema` parse/reject 3 varian `plan_decision`; `researchPlanPayloadSchema` min/max questions; `parseResearchPlanPayload` fallback graceful; `renderResearchPlanMarkdown` round-trip stabil; `APPROVAL_LABELS.proposeResearchPlan.running` non-kosong.

**convex (`packages/convex/tests`):** `respond` menerima 3 decision → patch `responded` + `forwardResume` ter-schedule saat `waiting_hitl`; **guard berbasis toolName**: `tool_approval`+`proposeResearchPlan`+`plan_decision` lolos; `tool_approval`+`proposeArtifact`+`plan_decision` DITOLAK; `tool_approval`+`proposeResearchPlan`+`approval` DITOLAK; `ask_user`+`plan_decision` DITOLAK; `humanizeInteractionResponse` bubble benar per decision (+ "(dengan suntingan)"); `HITL_CARD_TOOL_NAME_SET` memuat `proposeResearchPlan`, TIDAK memuat `startDeepResearch`; `listPendingInteractionsByRun` mengembalikan pending `proposeResearchPlan`.

**apps/agents:** broker `proposeResearchPlan` → `requestApproval` reason `plan_review` → interrupt, interaksi `type:"tool_approval" toolName:"proposeResearchPlan"` payload `{title,summary,questions}`; `start`(editedPlan) → `states.plan.done output===editedPlan`, literature dispatch dgn prompt memuat editedPlan; `start` tanpa editedPlan → output = `renderResearchPlanMarkdown(payload)`; **deepQuestion**: `/deep <q>` → start → literature prompt memuat `<q>` ASLI bukan bubble; `reject` → `finalizeRun canceled`, literature tak jalan, thread idle, satu `run_status canceled`; **reject + cancelRun konkuren** → satu terminal canceled; `revise` → plan non-done, `resumePromptForInteraction` memuat `revisionInstruction`, interaksi lama dapat `interaction_resolved` (node tertutup), re-call → park lagi; **prime**: revise resume tidak meninggalkan stale primed approval, re-call membuka interaksi fresh; durable replay plan `done` → re-dispatch skip plan, `priorOutputs.plan===editedPlan`; **replay parked-not-responded** → re-dispatch tanpa resumeInteraction → tak ada interaksi kedua, run tetap `waiting_hitl`; **fallback** no-tool → satu pending dibuat, run waiting_hitl, thread idle; **fallback race** → responder di gap → run resume.

**apps/web:** kartu terminal (`runTerminal`) non-interaktif; double-click `Mulai`/`Revisi` di-disable via busy; error submit → toast.

## 11. Risiko & Catatan Deploy

- **Dependency keras antar-slice:** Slice 1 (Convex `responseValidator` widen + `codegen` + `convex dev --once`) HARUS mendarat dan ter-deploy ke dev SEBELUM Slice 4 frontend dikompilasi/dijalankan; jika tidak, `respond({kind:"plan_decision"})` kena `ArgumentValidationError` runtime dan tipe `api.*` tak mengenal `plan_decision`.
- **Trade-off tersisa (jujur):** (1) Resume `start` adalah cabang non-pola (tulis-done tanpa retry tool) — di-test eksplisit Slice 3. (2) Ketergantungan model memanggil tool — ditutup fallback wajib (§4.6d). (3) Fallback MEMPERKENALKAN satu jalur park manual (`parkForPlanReview`) — klaim "zero blok manual" v1 dikoreksi; di-DRY-kan dengan cabang interruptState. (4) Composer terkunci selama gate (owner) → dua pola HITL, konsisten internal. (5) Revisi tak dibatasi jumlahnya lintas-dispatch (hanya per-turn budget-bounded). (6) Trace read-only kartu menampilkan payload asli, bukan suntingan — keputusan sadar.
- **Schema/deploy:** ZERO perubahan schema; ZERO migrasi (`type`/`toolName`/`payloadJson` cukup; `by_run_status` + `superseded` sudah live). `npx convex deploy` prod oleh owner setelah gate hijau. Klaim "Bonus B mengaktifkan by_run_status + superseded" dari v1 dihapus dari narasi: `by_run_status` kini DIPAKAI (replay-idempotency + opsional cancel-expire), `superseded` tetap tak dipakai (defer; tandai follow-up, bukan blocker).

## File-file Relevan (path absolut)

- Backend: `apps/agents/src/runs/runManager.ts`, `apps/agents/src/agent/interactions.ts`, `apps/agents/src/agent/deepPhases.ts`, `apps/agents/src/agent/toolPolicy.ts`, `apps/agents/src/agent/systemPrompt.ts`, `apps/agents/src/tools/index.ts`, `apps/agents/src/tools/proposeResearchPlan.ts` (BARU), `apps/agents/src/store/types.ts`
- Contracts: `packages/agent-contracts/src/interaction.ts`, `packages/agent-contracts/src/activity.ts`
- Convex: `packages/convex/convex/agent/interactions.ts`, `packages/convex/convex/agent/hitl/humanize.ts`, `packages/convex/convex/agent/hitl/hitlToolNames.ts`, `packages/convex/convex/agent/service.ts`, `packages/convex/convex/schema.ts` (no-op)
- Frontend: `apps/web/features/thread-experience/components/research-plan-review-card.tsx` (BARU), `apps/web/features/thread-experience/components/message-hitl-parts.tsx`, `apps/web/features/thread-experience/components/use-hitl-resume.ts`, `apps/web/features/thread-experience/components/hitl-plan-review-card.tsx`, `apps/web/features/thread-experience/components/assistant-turn.tsx`, `apps/web/features/thread-experience/components/chat-thread-state.tsx`, `apps/web/features/thread-experience/components/composer.tsx`, `apps/web/features/thread-experience/utils/hitl-parts.ts`
- Tests: `apps/agents/tests/runManager.test.ts`, `packages/convex/tests/hitlToolNames.test.ts`
</content>
</invoke>
