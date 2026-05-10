# Aqsha Research Chatbot — Implementation Plan

Status: Draft v1
Last updated: 2026-05-10
Companion docs: `docs/aqsha-convex-research-chatbot-prd.md`, `apps/app/DESIGN.md`, `docs/aqsha-prototype.html`
Scope: `apps/app` + `packages/convex` only.

## How to read this plan

The PRD defines the product. This plan breaks delivery into **four phases**. Each phase ships a **vertical slice** — backend and frontend progress together — so that the person reviewing the build can see and feel what changed without waiting for "integration week".

Phases are cumulative. Nothing in phase N depends on a stubbed version of itself in phase N-1; by end of phase 4, every acceptance scenario in the PRD should pass.

Three rules shape the phase boundaries:

1. **Every phase ships a demo path.** If you can't sit down at the app and feel the difference, the phase is wrong.
2. **Ownership from day one.** The auth helper and ownership-assertion pattern land in phase 1; every function added in later phases uses it. We do not backfill ownership.
3. **Mode switch follows implementation.** The composer only exposes what is wired. Normal shows up in phase 2; Deep appears in phase 4. We ship honest surfaces, not disabled placeholders.

## Preflight (assumed true before phase 1)

- `apps/app` is a Next.js 16 app with a Convex provider and Better Auth client.
- `packages/convex` has `@convex-dev/agent` + `@convex-dev/better-auth` installed; `convex.config.ts` wires both.
- `packages/convex/convex/schema.ts` is empty and ready to define.
- No data migration from the old `apps/web` journal exists or will exist.
- The design prototype at `docs/aqsha-prototype.html` is the visual target for every phase.

If any of these drifts, the plan's first phase absorbs the fix; we do not create a phase 0.

## Phase 1 — Auth & Thread Shell

**Outcome:** A signed-in user lands in an empty chat app, creates threads, switches between them, and toggles dark mode. The app feels real, even without conversations yet.

### Backend

- Finalize `schema.ts` foundations: `threadMetadata` (optional, only what Agent doesn't cover for product UI), plus the `ownerUserId` convention.
- Write `auth.ts` helper: `getCurrentUser(ctx)` returning the server-derived Better Auth user; centralize the ownership-assertion pattern here.
- Public functions: `threads.create`, `threads.list`, `threads.get` — all thin wrappers over Agent's thread primitives with ownership checks.
- Better Auth routes confirmed: sign-up, sign-in, sign-out, session on Convex.

### Frontend

- Sign-in and sign-up screens matching prototype auth pages.
- App shell: sidebar (thread rail + logo + account), top bar (breadcrumb + theme toggle + `⌘K`), main canvas empty state.
- Thread rail fed by `threads.list`; clicking routes to a thread page.
- Empty-thread page renders the chat canvas skeleton — no composer yet (or a clearly disabled placeholder).
- Dark mode toggle with `localStorage` persistence + `prefers-color-scheme` seed, class toggled on `<html>`.

### Demo you can show

Sign up → arrive in empty state → click **Tulis chat baru** three times → switch between the three threads → toggle to dark mode → refresh → everything still there and still dark.

### Acceptance scenarios covered

PRD #1 (sign in), #2 (create thread), and the baseline of #9 ownership for threads (another account can't read your `threadId`).

### Out of scope for this phase

Messages, streaming, tools, RAG, Deep mode, rate limits, artifacts, source library.

## Phase 2 — Normal Mode Chat

**Outcome:** The user can actually talk to Aqsha. Answers stream in, survive a refresh, and the system pushes back politely when usage gets too hot.

### Backend

- Install + configure `@convex-dev/rate-limiter` in `convex.config.ts`.
- Public functions: `messages.send({ threadId, content, mode: "normal" })`, `messages.list({ threadId, paginationOpts, streamArgs })`.
- Agent configured for streaming; token usage recorded to a new `usageLedger` table after each completion.
- Rate limits wired for per-user send frequency + per-user token window; functions return retry-at timing when throttled.
- Error paths return structured errors the UI can turn into the lemon-soft rate-limit card.

### Frontend

- Composer wired: textarea auto-grow, Send button, keyboard shortcuts (`⌘/Ctrl+Enter`, `Shift+Enter`). Mode switch is **hidden in this phase** — Normal is the only mode we can actually run.
- Streamed assistant messages with the `.stream-caret` treatment.
- `messages.list` consumed with streamArgs for live deltas; mid-stream refresh resumes cleanly.
- Rate-limit card rendered inline at the end of the composer when throttled, with retry-at language ("Coba lagi dalam 42 detik").
- Thread last-activity meta in the rail updates from the latest message.

### Demo you can show

New thread → "halo, tolong ringkas novel X" → watch the stream → refresh mid-answer → watch it resume → send six messages in a burst → see the polite rate-limit card.

### Acceptance scenarios covered

PRD #3 (streamed answer), #4 (refresh while running — for Normal), #10 (rate-limit feedback).

### Out of scope for this phase

Retrieval tools, source records, citation markers, Sources tab, Deep mode, artifacts.

## Phase 3 — Research Corpus & Cited Answers

**Outcome:** Normal answers now cite real sources. The user has a Source Library they can add to. The right panel shows up when there are sources to show.

### Backend

- Install + configure `@convex-dev/rag`; default namespace `user:{ownerUserId}`.
- Schema: `corpusSources`, `researchSources`.
- Public functions: `corpus.addSource`, `corpus.search`, `sources.list`, `sources.get`.
- Agent tools registered: `searchCorpus` (RAG over user namespace) and `searchWeb` (Exa/web). The Normal-mode agent's tool loop calls these when relevant.
- When a tool call's result is actually cited in the final answer, persist a `researchSources` record linked to the message — untoggled search results are not persisted.

### Frontend

- Right panel with **Sources** tab only (Artifacts tab stubbed or hidden).
- Source card: origin chip (RAG / Web / Arxiv / Upload / Manual), Nunito title, mono DOI/URL row, lemon-bordered extract quote, evidence-quality chip, actions **Buka sumber** + **Salin kutipan**.
- Inline `[n]` citation markers in streamed prose; click scrolls the Sources tab to that source.
- Source Library page: list existing corpus sources, add URL, add manual text; file upload can ship as a stub that POSTs text content (OCR can come later if needed).
- Source detail in-place expansion inside the Sources tab.

### Demo you can show

Ask "apa itu RAG?" → streamed answer with `[1][2]` markers → open Sources tab → see real Arxiv + web sources with extracts → click `[2]` → panel scrolls to that source → add a DOI in Source Library → ask follow-up → answer now cites from your corpus.

### Acceptance scenarios covered

PRD #5 (inspect sources), #16 (uploaded sources improve answers), #17 (source filters by thread/document — at minimum by thread), #18 (insufficient-evidence language when no sources fit).

### Out of scope for this phase

Deep mode, workflow, artifacts tab, citation verification as a separate step, PDF OCR (if not free), full corpus-tag UI.

## Phase 4 — Deep Research & Artifacts

**Outcome:** The user flips Deep, watches Aqsha work through a real multi-step research run, stops and retries as needed, and reads the final report as an artifact with traceable citations.

### Backend

- Install + configure `@convex-dev/workflow`.
- Schema: `researchRuns`, `researchArtifacts`, `citationChecks`.
- Workflow with the seven PRD steps (`planResearch`, `retrieveSources`, `readExtract`, `synthesize`, `verifyCitations`, `persistArtifact`, `finalizeThread`) — real implementations, reusing the RAG and tool infrastructure from phase 3.
- `messages.send({ mode: "deep" })` creates a run record and starts the workflow.
- Public functions: `runs.getStatus`, `runs.cancel`, `runs.retry`, `artifacts.list`, `artifacts.get`.
- Internal workflow status (`queued` / `running` / `waiting` / `retrying` / `completed` / `failed` / `canceled`) persisted on the run, but the public API exposes what the UI actually needs (current step, done steps, error code/message, artifact ids).
- Rate limiter now also guards external API budget (Exa calls, academic fetch, OCR).

### Frontend

- Composer gains the Lavender Deep switch (mode pill becomes visible and two-position).
- When Deep is active, Send becomes the Coral ghost Stop button; textarea and mode switch lock.
- Inline step blocks inside the assistant message: icon state per step (sky spinner / mint check / coral square / ink dot), shimmer on the active step, optional right count chip ("6 sources", "3 excerpts"). Labels use the Indonesian copy table from `apps/app/DESIGN.md` — never `queued`, `retrying`, etc.
- Inline retry bubble on step failure — Coral-soft card with a short human reason and one Retry action.
- Dihentikan marker when the user stops a run.
- Artifacts tab in the right panel; opening an artifact swaps the chat area for the artifact reader (Nunito title, prose body, **Salin markdown** + **Bagikan link** + **Buka run**).
- Citation evidence view: claim → source mapping rendered as a compact table with evidence-quality chips.
- Run state recovers across refresh: step blocks repaint with current status; if a run finished while the user was away, the finalize message + artifact are already there.

### Demo you can show

Flip Deep → "buat laporan tentang kebijakan kripto OJK 2025" → watch the seven steps advance with shimmer → press Stop mid-run → see the dihentikan marker → Retry → watch it continue → completes → Artifacts tab reveals **Laporan** → open reader → every claim has a citation → click a citation → Sources tab scrolls to the source → refresh browser → everything still there.

### Acceptance scenarios covered

PRD #4 (refresh during Deep run), #6 (Deep start), #7 (progress visible without raw states), #8 (cancel), #9 (retry), #11 (artifact open), #12 (inspect sources from artifact), #13 (citation evidence), #14 (markdown report), #15 (insufficient-evidence handling for Deep), #19 (cross-user ownership verified end-to-end).

### Out of scope for this phase

Recursive sub-agent planning, advanced filter UI beyond basic corpus tagging, export formats beyond markdown, analytics dashboards.

## Cross-cutting concerns

These live outside any single phase but must be maintained throughout delivery.

- **Ownership assertions.** Every public function that takes an id (`threadId`, `sourceId`, `artifactId`, `runId`) runs the assertion from `auth.ts`. Reviewers reject PRs that skip it.
- **Typecheck gates.** `@aqsha/convex` and `@aqsha/app` must typecheck at the end of each phase before the phase is called done.
- **Acceptance sweep.** Before closing a phase, walk the PRD acceptance scenarios listed for it, in a fresh browser session, against dev deploy.
- **Dark mode parity.** Every new surface ships in both themes in the same PR. We never file "dark mode polish" as follow-up work.
- **Prototype drift check.** If a new UI decision contradicts `docs/aqsha-prototype.html`, update the prototype first so the visual source of truth stays accurate.

## Dependencies & risks

- **RAG quality before Deep.** Phase 4's `retrieveSources` and `readExtract` steps lean on the same tools delivered in phase 3. Weak retrieval in phase 3 means weak Deep research in phase 4. Spend the time in phase 3.
- **Rate limits land early.** Phase 2 installs the limiter so we don't scramble when Deep runs start costing real money in phase 4.
- **Workflow cancellation honesty.** Cancellation and retry need to work even when the workflow is mid-tool-call. Test this explicitly in phase 4, not hoped-for.
- **Better Auth × Convex token freshness.** If the Convex session expires mid-Deep-run the UI should surface a re-auth prompt without killing the workflow. Worth probing in phase 2 so the fix lands before phase 4.
- **Dependency on Convex component maturity.** If `@convex-dev/workflow` or `@convex-dev/rag` drop breaking changes between phases, treat the upgrade as a named task inside the phase that hits it — not a silent bump.

## Rough sequencing

Phases are sized so one phase can reasonably ship as one named milestone. They are not timeboxed here on purpose — ship the phase when the demo script passes, not when the week ends. If a phase starts sprawling, the fix is usually to pull scope out into the next phase, not to split the current one into sub-phases.
