# Phase 6 decision record — thread model, streaming renderer, chat core (engine)

> Bagian dari **Phase 6** (§10 [`svelte-plan.md`](svelte-plan.md)).
> Tanggal: 2026-07-14. Melanjutkan Phase 1–5 (decision records + ledger). Bahasa Indonesia; nama
> package/API/simbol tetap English (AGENTS.md).

Fase ENGINE (pure-first): reducer/codec/transform timeline + citation/stats/viz + integrasi Mastra +
Svelte Streamdown adapter + sanitize/harden + conversation viewport. **BUKAN** thread experience UI
(composer chips/slash/mentions, panels, tools UI, `/deep` flows penuh = Phase 7) dan **BUKAN**
explore/workspace (Phase 8/9). Ledger: [`parity-ledger.md`](parity-ledger.md)
THC-1..9 = **done**.

---

## 1. Yang dibangun (peta file)

| Area | File `apps/svelte/src` | Sumber web |
|---|---|---|
| Pure types | `lib/features/threads/lib/timeline-types.ts`, `features/threads/types.ts` | `features/threads/lib/timeline-types.ts`, `types.ts` |
| Timeline reducer (THC-1) | `lib/features/threads/lib/mastra-timeline.ts` (**verbatim**, 1574 baris) | `features/threads/lib/mastra-timeline.ts` |
| Citation/stats/viz transform (THC-2/3/4) | `lib/features/threads/lib/{citation,stats,viz}-markdown.ts`, `stats-run-detail.ts`, `stats-next-steps.ts`, `source-card.ts`, `components/{deep-viz/labels,stats-viz/verdict-meta}.ts` | idem |
| Composer/attachment model (THC-8) | `lib/features/threads/lib/{attachment-buckets,token-pill,composer-inline-editor,scroll-to-message}.ts` | idem |
| Mastra client (THC-5) | `lib/features/threads/lib/mastra-client.ts`, `chunk-replay.ts` | `features/threads/lib/mastra-client.ts`, `use-mastra-agent.ts` |
| Agent state (THC-5) | `lib/features/threads/state/thread-agent.svelte.ts`, `state/context.ts` | `features/threads/lib/use-mastra-agent.ts` (spine) |
| Streamdown adapter (THC-6) | `lib/components/ai-elements/{Response,Reasoning,InlineCitation,DeepVizFigure,StatsVizFigure}.svelte`, `markdown-extensions.ts`, `contexts.ts` | `components/ai-elements/{response,message,reasoning,inline-citation}.tsx`, viz-block/stats-block/*-context |
| Conversation viewport (THC-7) | `lib/components/ai-elements/{Conversation,ConversationContent,ConversationScrollButton,ConversationEmptyState}.svelte`, `conversation-state.svelte.ts` | `components/ai-elements/conversation*.tsx` |
| Route renderer | `routes/app/(product)/threads/[threadId]/+page.svelte` (Phase 1 slice DIGANTI) | — |

Relokasi Phase 1 slice: `lib/threads/` + `lib/components/Markdown.svelte` (+ spec) **DIHAPUS** — diganti
`lib/features/threads/*` + ai-elements. `@aqsha/chat-core` ditambah sebagai workspace dep `@aqsha/svelte`
(browser-safe: hanya impor `zod`; nol `@aqsha/db`/`services`/`node:*` — THC-9 terverifikasi).

## 2. Keputusan terkunci

### 2.1 Svelte Streamdown adapter — **marked-based, BUKAN rehype** (DEALBREAKER)

`svelte-streamdown@3.1.2` memakai **`marked`** (token) + sistem **snippet/theme**, BUKAN
remark/rehype (HAST) seperti React `streamdown`. Konsekuensi: pipeline `reportRehypePlugins` web
(`[...Object.values(defaultRehypePlugins), reportRehypePlugin]` yang merewrite HAST tersanitasi) **TIDAK
portabel**. Ini persis risiko §13 "Svelte Streamdown mismatch". Keputusan (bukan fallback
`@humanspeak/svelte-markdown` — svelte-streamdown lulus parity+security):

- **Semantik transform dipertahankan; MEKANISME diadaptasi.** `[n]` → pill, `{{stats:}}` → figur
  ter-gate, ```` ```aqsha:viz ```` → figur ter-gate, sanitasi — semua SAMA secara fungsional.
- **Citation `[n]`**: pakai tokenizer **native** svelte-streamdown (`markedCitations`, menghasilkan token
  `inline-citations` dari `[n]`/`[1, 2]`). Dirender lewat snippet `inlineCitation` → `InlineCitation.svelte`,
  di-resolve dari `map` prop (bukan regex kita). DATA transform (nomor mana, `buildCitationMap`,
  `resolveCitationCards` dedup-by-key) tetap PURE + contract-tested (`citation-markdown.ts`). Perbedaan
  tokenizer native (`[ref]` non-numerik, grouping `[1] [2]`) IMMATERIAL utk sitasi numerik Astra.
- **Stats `{{stats:}}` + viz ```` ```aqsha:viz ````**: **marked extensions** (`markdown-extensions.ts`)
  → token kustom `aqsha-stats` (inline) / `aqsha-viz` (block, `applyInBlockParsing:true` → jalan SEBELUM
  code tokenizer core; fence ```` ```python ```` tetap ke Shiki native). Dirender lewat snippet catch-all
  `children` (`Element.svelte` dispatch token tak dikenal ke `streamdown.children`). Regex + parse tetap
  PURE (`stats-markdown.ts`/`viz-markdown.ts`, tested).
- **Table/code chrome**: pakai kontrol **native** svelte-streamdown (`TableDownload` + code copy via
  `controls`). React `TableBlock`/`CodeBlock` (chrome kustom) **di-supersede** (library-first §3.3) —
  copy/download/fullscreen parity dari lib. §9.1 point 4: selektor golden CSS `[data-streamdown='table']`
  → `[data-streamdown-table]` (svelte-streamdown emit atribut per-elemen, bukan `data-streamdown="table"`).

### 2.2 Sanitize/harden — TIDAK dilonggarkan (§10 gate)

- svelte-streamdown **tak pernah** render raw HTML (`renderHtml` DEFAULT off, tak di-set) → `<script>`/
  `onerror`/`javascript:`-di-markup tak dieksekusi. Lebih ketat dari rehype (nol HTML passthrough).
- `allowedLinkPrefixes={['https://','http://','mailto:','/']}` + `allowedImagePrefixes={['https://','http://','/']}`
  → `javascript:`/`data:` href/src di-strip.
- Tag kustom = token KITA → komponen KITA yang di-gate → nol injeksi HTML, nol pelebaran allowlist sanitasi.
- Dipin `Response.svelte.spec.ts` (XSS corpus: `javascript:`/`data:` di-strip, raw `<script>`/`onerror` tak
  jalan, https lolos) + parity (GFM/table/CJK/incomplete) + custom-tag (citation resolve/fallback, stats
  gate real/forged, viz gate forged→code/invalid→fallback). **14 test Chromium hijau.**

### 2.3 Anti-forgery gate — **reactive snippet props**, bukan Svelte context

React memakai Context (`VizFigureProvider`/`StatsBlocksProvider`/`CitationProvider`) yang di-mount
`Response` kondisional. Svelte `setContext` **init-only** → tak reaktif, padahal stats groups datang
SETELAH stream (fetch DB). Keputusan: gate data dialirkan lewat **prop snippet reaktif** dari `Response`
ke `InlineCitation`/`DeepVizFigure`/`StatsVizFigure`. Semantik "presence + real data" IDENTIK:
- deep-viz: `figureAssign` prop ada HANYA saat `viz={true}` (report `/deep` tepercaya) → forged fence di
  chat biasa = **plain code** (bukan figur). Payload korup → fallback (bukan crash, `<svelte:boundary>`).
- stats: `stats` prop ada + `groups.get(runKey)` real → render; forged/absent → **render kosong** (token
  `{{stats:}}` tak pernah bocor jadi teks). Blok data = DB join, penanda cuma kunci.
- Numberer (`createNumberer`, mirror `useRef(new Map)`) dibuat SEKALI per instance `Response` (stabil).

**Figur kaya** (consensus-meter/claims-evidence/… + stats-table/figure/decision penuh) = Phase 7 (THX-4/5).
Phase 6 render figur MINIMAL + gate benar (deep-viz: frame+caption; stats: tabel/verdict-chip/PNG fungsional).

### 2.4 Mastra event model (THC-5) — chat spine lengkap

`ThreadAgent` (`state/thread-agent.svelte.ts`) = port CHAT spine `use-mastra-agent.ts` ke class runes:
- **`$state`** = timeline (reduce per chunk), `#sentKind`, `#queued`. **`committedAgentKind`** = satu-satunya
  turunan (getter reaktif baca `$state` `#sentKind` — BUKAN `$derived` field karena baca `#initialAgentKind`
  hasil-constructor, gotcha "used before initialization"). Handle/registry/replay/buffer = field privat
  **non-reaktif** (§3.5 — jangan `$state`).
- **Satu langganan `subscribeToThread`** panjang; chunk chat → `reduceMastraChunk`. Routing chat-vs-workflow
  = **by TRANSPORT** (workflow run punya stream sendiri = Phase 7), bukan inspeksi tipe chunk.
- **Idempotency/no-dup-lost**: `createChunkReplayFilter` (verbatim, `chunk-replay.ts`) — server replay
  buffer run aktif dari index 0 tiap (re)connect; `text-delta` append non-idempoten → replay di-drop.
  6 test idempotency hijau.
- **Reconnect 2-lapis**: internal client-js `{maxRetries:20}` + loop `while(!cancelled)` re-subscribe;
  re-baca `committedAgentKind` tiap iterasi → commit lite→pro re-subscribe channel `astra-pro` (`#cycleSubscription`
  bump epoch). Kegagalan ≥3 → banner degraded (senyap bila thread baru pra-kirim).
- **Delta batching** (IMP-10): `text-delta`/`reasoning-delta` di-buffer, flush via rAF (visible) / `setTimeout(32)`;
  chunk struktural flush dulu → urutan state = urutan stream.
- **Lifecycle IMPERATIF** (bukan `$effect` reflex): `start()`/`destroy()` dipanggil dari `$effect` konsumen
  (route). E2 (settle→invalidate query) & queue-dispatch (E3) = edge/event di `#afterStructural`, bukan
  derivasi reaktif (I/O). `#detectDocumentEdit` dedup `request_document_edit` per tool-call (side-effect
  berbayar) → callback `onRequestDocumentEdit` (wiring BlockNote = Phase 10).
- Tercakup: send + queue-while-busy (client-side; server `queueMessage` durability = Phase 7), stop (chat
  abort), regenerate (chat; `lastTurnMessageIds` positional signal-aware, tested), approve/decline (HITL
  tool), resolveAsk (jalur tool).

**Batas fase**: orkestrasi imperatif `/deep` (sendDeep/consumeWorkflow/poll `runById`/plan+ask workflow
resume/failure-recovery/retry-revive) = **Phase 7 (THX-5)**. Reducer workflow (`reduceWorkflowChunk`,
`seedWorkflowProgress`, `settleWorkflowTurn`, `reviveWorkflowTurn`) SUDAH ported+tested — Phase 7 tinggal
wire driver ke class yang sama.

### 2.5 Conversation anchoring (THC-7) — hand-roll, nol virtualization

Tak ada `stick-to-bottom-svelte` matang saat pin. Hand-roll `StickToBottom` (`conversation-state.svelte.ts`):
class `$state isAtBottom` + wiring DOM lewat **`{@attach}`** (§3.4 — sync eksternal + cleanup, BUKAN `$effect`).
Follow-bottom saat konten tumbuh (ResizeObserver) KECUALI user scroll-up; tombol muncul saat `!isAtBottom`;
reduced-motion → lompatan instan. **Nol virtualization** (§6 — jangan ubah behavior). Konteks
`stickToBottomContext` (mirror `useStickToBottomContext`) utk tombol. 2 test Chromium hijau (pin awal +
un-follow/re-pin).

## 3. Gotcha & temuan reusable (untuk Phase 7)

- **svelte-streamdown = marked, bukan rehype.** Kustomisasi via **snippet** (per nama elemen: `inlineCitation`,
  `code`, dst.), **`extensions`** (marked; block butuh `applyInBlockParsing:true`), **`children`** catch-all
  (token kustom), **`mdxComponents`**. `renderHtml` off = XSS-safe by default.
- **`$derived` FIELD tak boleh baca field hasil-constructor** ("used before initialization") → pakai getter
  reaktif (baca `$state` di dalam getter tetap reaktif).
- **`state_referenced_locally`**: baca `$props` di `const` non-reaktif → warning. `untrack()` bila memang mau
  sekali-baca (mis. `viz` stabil); `$derived` bila memang reaktif (mis. `class`/`stats`).
- **ESLint `svelte/prefer-svelte-reactivity`**: `new Set/Map/Date` di `.svelte(.ts)` di-flag; registry
  non-reaktif → `eslint-disable-next-line` + alasan.
- **`svelte/no-useless-children-snippet`**: bila komponen punya snippet lain (mis. `overlay`), taruh konten
  utama sebagai default children (implisit), jangan `{#snippet children()}` eksplisit.
- **Clerk `clerk.auth` volatile** (Phase 1/2): `$effect` lifecycle agen wajib depend PRIMITIF
  (`$derived(clerk.auth.userId)`), gate `isLoaded` (bukan `userId`) agar `getToken()` real.
- **nbsp literal** di composer-inline-editor → escape ` ` (jangan char literal tak terlihat).

## 4. Gate Phase 6 (§10) — HIJAU

| Cek | Perintah / bukti | Hasil |
|---|---|---|
| Typecheck | `bun run typecheck` (svelte-check) | **0 errors / 0 warnings** |
| Lint | `bun run lint` | Prettier clean + ESLint 0 |
| Test | `bun run test` | **hijau** (pure timeline/replay/transform/model + Chromium XSS/parity/gate/anchoring) |
| Build | `bun run build` | OK (adapter-node) |
| No dup/lost | `chunk-replay.spec.ts` (6) + `mastra-timeline.spec.ts` | replay drop + delta concat + settle terverifikasi |
| XSS/sanitize | `Response.svelte.spec.ts` (14, Chromium) | `javascript:`/`data:` strip, raw HTML tak jalan, custom-tag gate |
| Markdown corpus | idem | GFM/table/CJK/incomplete; Shiki/KaTeX/Mermaid = native lib (E2E owner) |
| Anti-forgery | idem | stats forged→kosong, viz forged→plain code, invalid→fallback |
| No React/Radix/Lucide | grep `src` + client bundle | nol (ESLint blokir; svelte-streamdown/hugeicons only) |

Contract tests correctness-critical: timeline reducer (fixture, no-dup/lost), replay idempotency,
citation/stats/viz transform bytes, attachment bucketing, token pill/source-card, XSS corpus, anchoring.

## 5. Yang TIDAK dikerjakan (di luar Phase 6 → Phase 7 THX-*)

- Thread experience UI penuh: composer contenteditable + chips/slash/mentions/context/attachments (THX-3),
  thread shell + Lite/Pro selector (THX-2), recent/pinned/rename/pin/delete (THX-1), panels + URL serialization
  (THX-6), send-status/cooldown/rate/billing (THX-7), history seed 400-message + scroll long-thread (THX-8).
- `/deep` durable lifecycle imperatif (THX-5): sendDeep/consumeWorkflow/poll re-attach/plan+ask workflow
  resume/deepFailed/deepStalled/deepNotice/retryDeep/restartDeep. Reducer sudah siap; driver = Phase 7.
- Figur viz kaya (deep-viz 6 sub-komponen + stats-viz tabel/figur/keputusan penuh) = THX-4.
- Smooth-text reveal (`useSmoothText`), LinkPreview hover citation, server-side queue durability = Phase 7.
- Doc-edit bus (BlockNote AI) = Phase 10 (seam `onRequestDocumentEdit` disiapkan).
- Owner E2E: flow live stream/reconnect/durable dengan backend+agent.
