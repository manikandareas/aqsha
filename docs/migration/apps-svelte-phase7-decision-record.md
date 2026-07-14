# Phase 7 decision record — thread experience UI & full Astra flows

> Bagian dari **Phase 7** (§10 [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md)).
> Tanggal: 2026-07-15. Melanjutkan Phase 1–6 (decision records + ledger). Bahasa Indonesia; nama
> package/API/simbol tetap English (AGENTS.md). Ledger: [`apps-svelte-parity-ledger.md`](apps-svelte-parity-ledger.md)
> THX-1..8 = **done**.

Fase EXPERIENCE (UI/orkestrasi di atas engine Phase 6): composer contenteditable tokenized, thread
shell + CRUD + tier, message list + tool-row + figur viz KAYA, `/deep` durable lifecycle imperatif
(extend `ThreadAgent`), panels + URL byte-equivalent + responsive drawer, send-status gates, history
seed 400 + scroll. Engine Phase 6 (reducer/transform/adapter/`ThreadAgent` chat spine) **di-reuse**,
tidak di-port ulang. **BUKAN** explore/workspace (Phase 8/9), **BUKAN** BlockNote (Phase 10).

---

## 1. Yang dibangun (peta file, di `apps/svelte/src`)

| Area | File | Sumber web |
|---|---|---|
| Data layer (THX-1/2/4/7) | `lib/features/threads/api.ts`, `lib/features/threads/lib/artifact-download.ts` (+spec) | `features/threads/api.ts`, `lib/artifact-download.ts` |
| Composer (THX-3) | `lib/features/threads/components/composer/{Composer,TokenizedPromptInput,SlashCommandPalette,ContextMentionPalette,ComposerPopover*,ComposerChipTooltip,ComposerStartPanel,FileChip,AgentSelector}.svelte`, `{agent-selection,palette-types,composer-types}` | `features/threads/components/{composer,tokenized-prompt-input,slash-command-palette,context-mention-palette,composer-popover,composer-chip-tooltip,file-chip,composer-agent-selector}.tsx` |
| Mention channels | `lib/features/threads/state/composer-mentions.svelte.ts` | `features/thread-experience/components/composer-context-mentions.tsx` |
| Messages/tools (THX-4) | `lib/features/threads/components/{MessageList,AssistantMessage,UserBubble,ProcessBlock,ToolRow,ChatArtifactCard,ElapsedLabel,QuestionsCard,QuestionsForm,ToolCard,tool-glyph,message-interactions}.svelte(.ts)`, `Shimmer.svelte` | `features/threads/components/{message-list,tool-row,chat-artifact-card,elapsed-label,questions-card,tool-card,message-interactions}.tsx`, `ai-elements/shimmer.tsx` |
| Figur viz KAYA (THX-4) | `components/deep-viz/{ConsensusMeter,ResultsTimeline,TopContributors,ClaimsEvidence,GapsMatrix,OpenQuestions,PaperPills,VizFigureBody,SourceCardList}.svelte`; `components/stats-viz/{StatsTable,StatsDecision,StatsFigure,StatsSummary,AnalysisRunCard,DatasetProfileCard,NextStepChips,StatsBlock}.svelte`; `components/{DeepSearchCards,SourceCardList,SourceLinkList,SourceLinkRow,SourcesPanel,InlineSources,ScrollDetailTrigger}.svelte` | `features/threads/components/{deep-viz,stats-viz}/**`, `deep-search-cards`, `sources-panel`, `scroll-detail-trigger`, `thread-experience/components/source-link-*` |
| Gate figur (extend Phase 6) | `lib/components/ai-elements/{DeepVizFigure,StatsVizFigure,Response,Reasoning}.svelte` | idem |
| `/deep` durable (THX-5) | `lib/features/threads/state/thread-agent.svelte.ts` (**extend**), `lib/features/threads/lib/deep-workflow.ts` | `features/threads/lib/use-mastra-agent.ts` (deep half) |
| Panels + URL (THX-6) | `lib/features/thread-experience/utils/thread-panel-model.ts` (+spec), `lib/features/threads/lib/thread-panel-data.ts`, `lib/features/thread-experience/components/{thread-panel-context.svelte.ts,DetailPanel}.svelte` | `thread-experience/utils/thread-panel-model.ts`, `threads/lib/thread-panel-data.ts`, `thread-experience/components/thread-panel-context.tsx` |
| Shell/surface (THX-1/2/7/8) | `lib/features/thread-experience/components/{ThreadDetailShell,MastraChatThreadSurface,ComposerHeroState}.svelte`, `utils/send-status.ts` | `thread-experience/components/{thread-detail-shell,mastra-chat-thread-surface,composer-hero-state}.tsx` |
| Smooth-text (polish) | `lib/features/threads/lib/smooth-text.svelte.ts` | `features/threads/lib/use-smooth-text.tsx` |
| Route | `routes/app/(product)/+page.svelte` (landing = thread baru), `routes/app/(product)/threads/[threadId]/+page.svelte` (Phase 6 slice DIGANTI) | `app/app/**` |

## 2. Keputusan terkunci

### 2.1 Composer contenteditable — `{@attach}` seed, BUKAN `$effect` reflex (§3.4)

`TokenizedPromptInput` = contenteditable div uncontrolled, di-seed dari `value`+`pinnedContextRefs`
lewat **`{@attach seedEditor}`** (bukan `$effect` yang menyetel DOM). Attach membaca `value`/`pinned`
(reaktif → re-run saat berubah), lalu mem-render DOM via `composer-inline-editor.ts` (DOM model Phase 6).
Guard identik web: `if (serialized === value && chipSig sama) return` (post-input re-run = no-op) +
`if (document.activeElement === node && value !== '') return` (caret tak lompat saat mengetik). Input/
keydown/paste/blur = handler biasa memanggil `syncEditorState` (serialize → callback ke parent → set
slash/mention query). Palette = **bits-ui Popover** dengan `customAnchor={editorWrapper|shell}` +
`trapFocus={false}` + `interactOutsideBehavior/escapeKeydownBehavior="ignore"` + `preventScroll={false}`
(controlled `open`, editor pegang fokus & keyboard-nav). Chip tooltip = portal-to-body via `{@attach}`.
IME/CJK: keydown pertama `if (event.isComposing) return` (composition selesai dulu).

### 2.2 `/deep` orkestrasi — **EXTEND `ThreadAgent`** (bukan hook/kelas baru)

Task mensyaratkan extend. `ThreadAgent` (chat spine Phase 6) ditambah field `$state`
(`#deepStalled/#deepFailed/#deepNotice`) + field non-reaktif (`#deepRun`, `#queuedServerRuns`,
`#pollToken`) + method: `sendDeep`/`consumeWorkflow` (async-generator baca `run.stream`/`resumeStream`/
`timeTravelStream` → `reduceWorkflowChunk`), `applyDeepTerminal` (handler terminal TUNGGAL: failed→TAHAN
runId B1, success-bail→notice B3, else clear+refresh), `reconcileDeepTerminal`, `clearDeepRunIdUnlessAlive`
(jangan clear failed/`""` — kunci pemulihan), `maybeReattachAfterStreamClose`, re-attach poll
(`#reattachPoll` via `#pollToken`, `runById` 2.5s, `discoverDeepRunId` fallback, stall detection
per-fase, plan/clarify gate seed), `resolvePlan`, `resolveAsk` (extend: source `workflow` vs `tool`),
`regenerate` (deep-aware: regen `/deep` sebagai `/deep`), `stop` (extend: cancel run workflow),
`retryDeep`/`restartDeep`/`dismissDeep*`. Server-queue durability (`queueMessage`) + runId-ownership
guards + localStorage runId di `deep-workflow.ts` (helper pure). Reactivity: subscription + poll owned
imperatif (`start()`/`destroy()` dari `$effect` konsumen), `#pollToken.cancelled` = teardown poll.

### 2.3 URL codec — pure + SvelteKit `page.url`/`goto`, BUKAN `runed`/nuqs

Plan §6 menyarankan `runed useSearchParams`, tapi kontrak SEBENARNYA (§11.2/§13) = **codec
byte-equivalent**. Diputuskan: port `thread-panel-model.ts` sebagai fungsi PURE (`serialize/parse`
verbatim web — split first-`:`, search index strict-digit) + wire via `ThreadPanelController`
(`page.url.searchParams` reaktif + `goto(url, {noScroll,keepFocus})`). Tak perlu dep baru; codec pure =
kontrak, di-pin `thread-panel-model.spec.ts` (10 vektor + edge). `runed` tak dipasang (library-minimal).

### 2.4 Figur viz KAYA di DALAM gate Phase 6

Gate anti-forgery Phase 6 (`DeepVizFigure`/`StatsVizFigure`) sekarang render figur PENUH (bukan minimal):
`DeepVizFigure` (cabang valid) → `VizFigureBody` (dispatch 6 chart + caption; `citations` di-thread dari
`Response` → `PaperPills`); `StatsVizFigure` → `<div data-stats-runkey>` (jangkar test anti-forgery) →
`StatsBlock` (dispatch table/decision/figure). Semantik gate (presence + real data) TIDAK berubah;
`Response.svelte.spec.ts` (14) tetap hijau (jangkar `data-stats-runkey` dipertahankan).

### 2.5 Paralelisasi port leaf via subagent

14 komponen viz + kartu (pure display, typed-prop) di-port oleh 3 subagent paralel (deep-viz charts,
stats-viz tables, integrated cards) dengan brief konvensi (icons `$lib/icons` glyph-data, no
lucide/radix, runes, seam `getMessageInteractions`/`getComposerMentions`). Spine coupled (composer,
message-list, tool-row, deep orchestration, shell, panels) di-port manual. Integrasi bersih: typecheck
0/0 saat pertama disatukan. Catatan dedup: `deep-viz/SourceCardList.svelte` (lokal untuk ResultsTimeline)
menduplikasi `components/SourceCardList.svelte` — dibiarkan (kompilasi bersih), tandai untuk cleanup.

### 2.6 Seam Phase 8/9 (didokumentasikan, bukan diam)

Yang bergantung modul belum jadi → seam eksplisit: **@mention workspace picker** (workspaces +
context-picker API = Phase 9 → palette empty-state, `onRequestWorkspaceItems` no-op), **artifact reader
panel + Workspace tab** (Phase 9 → placeholder text), **save-to-workspace** di `ChatArtifactCard`
(Phase 9), **ambient/selection channels** (`ComposerMentions` siap; publisher = explore/workspace pages
Phase 8/9 → default kosong). Attachment upload TIDAK di-seam (endpoint di threads API, di-wire penuh).

## 3. Gotcha & temuan reusable

- **`$state`/prop init baca reaktif → `state_referenced_locally`**: init `let` non-reaktif atau `$state`
  yang membaca prop/`$derived`/getter di initializer → warning. Bungkus `untrack(() => …)` bila memang
  mau snapshot sekali (composer `content`, `historySettled`, tracking var `prevRunning`, drafts init).
- **nbsp literal**: composer-inline serialize `.replace(/ /g, ' ')` — WAJIB escape (char literal
  tak terlihat → `no-irregular-whitespace`).
- **`svelte/prefer-svelte-reactivity`** (di `.svelte`/`.svelte.ts`): `new Map/Set/URL` LOKAL di
  `$derived.by`/method (bukan reactive state) → `eslint-disable-next-line` + alasan. `.ts` biasa TIDAK
  di-lint rule ini (jangan tambah disable → "unused directive").
- **`svelte/no-navigation-without-resolve`**: `<a href={dynamic external}>` (URL sumber riset) → tak
  bisa `resolve()` (route-id internal saja). Precedent repo = override config per-glob (ui/marketing/
  settings) → ditambah blok untuk source-card/citation files. `goto(url-object)` same-page = disable
  per-line. `replaceState`: pakai `resolve('/app/(product)/threads/[threadId]',{threadId})` BARE (bump
  thread baru tak punya `?panel=` → tak perlu concat search yang bikin rule gagal).
- **`svelte/no-useless-children-snippet`**: komponen dengan snippet lain (`header`) → konten utama =
  default children IMPLISIT (jangan `{#snippet children()}` eksplisit) → `DetailPanel`/`SidePanelFrame`.
- **`svelte/no-unused-props`** flag prop di TYPE walau tak di-destructure**: `FileChip` `id`/`mimeType`
  di-render sebagai `data-*` (API compat). Nested unused (`SourceLinkItem.key`) → referensi via
  `data-source-key`.
- **bits-ui Popover palette**: `customAnchor` (HTMLElement) + `trapFocus={false}` +
  `interactOutsideBehavior="ignore"` = controlled tanpa merebut fokus contenteditable.
- **`useSmoothText` mount mid-turn**: mulai dari teks yang SUDAH ada (`untrack(getText)`), animasi hanya
  PERTUMBUHAN — refresh saat turn in-flight tak crawl dari 0.
- **`data-active={false}` bocor highlight** (memory Phase 5): tetap berlaku; komponen baru pakai
  `active || undefined` bila perlu.

## 4. Gate Phase 7 (§10) — HIJAU

| Cek | Perintah / bukti | Hasil |
|---|---|---|
| Typecheck | `bun run typecheck` (svelte-check) | **0 errors / 0 warnings** (7140 files) |
| Lint | `bun run lint` | Prettier clean + ESLint 0 |
| Test | `bun run test` | **220 passed / 34 files** |
| Build | `bun run build` | OK (adapter-node) |
| Contract: URL codec | `thread-panel-model.spec.ts` | byte-equivalent (10 vektor + first-colon/strict-digit/empty-id edge) |
| Contract: export bytes | `artifact-download.spec.ts` | base64 decode byte-identik (docx/xlsx) |
| Anti-forgery gate | `Response.svelte.spec.ts` (14) | stats/viz gate tetap hijau dgn figur KAYA |
| No React/Radix/Lucide | grep `src` + client bundle | nol (client bundle bersih; nol `@aqsha/db`/services) |

Critical chat E2E (§11.3 #3 create/send→durable→reload; #4 `/deep` plan/HITL/result/export) = **owner
E2E** (butuh backend :3001 + agent :4111 + sesi Clerk live). Composer caret/IME + `/deep` durable
reload/abort/regenerate/revive = **owner verifikasi manual** (kode ter-port faithful; behavior live
belum di-drive di sesi ini).

## 5. Yang TIDAK dikerjakan (di luar Phase 7)

- **LinkPreview microlink hover citation** (InlineCitation): kartu screenshot microlink saat hover — polish
  KOSMETIK, butuh gambar eksternal (implikasi CSP). Ditunda; pill sitasi sudah link + tooltip judul
  (parity fungsional). Full JS-interpolation smooth-text SUDAH di-port (`useSmoothText`).
- **Phase 8/9 seam** (§2.6): @mention workspace picker, artifact reader panel, save-to-workspace,
  ambient/selection publisher, Workspace panel tab, home explore bento + banner carousel.
- **BlockNote AI doc-edit** (Phase 10): seam `onRequestDocumentEdit` di `ThreadAgent` (no-op).
- **Owner E2E live**: create→send→durable→reload; `/deep` plan/HITL/result/export; abort/regenerate/revive.
- Dedup `deep-viz/SourceCardList.svelte` vs `components/SourceCardList.svelte` (cleanup follow-up).
