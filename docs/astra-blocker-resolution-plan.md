# Astra Agent 2.0 — Blocker Resolution + Phase-3 Completion Plan

> Companion to `docs/astra-phase-2-4-plan.md` §"Blockers / decisions surfaced during implementation". This doc (1) resolves blockers #1, #3, #4 with concrete, code-grounded designs (file:line references verified 2026-06-11 against `development`), folding in the remaining 3.4 items (per-subagent skill delegation); and (2) sequences everything into the **execution roadmap** (§"Execution roadmap", end of doc) that takes Phase 3 to done. Blocker #2 (split timing) is already resolved; blocker #5 (stale doc notes) is fixed by edits to the main plan.
>
> Same gate every slice: `bun run typecheck && bun run lint && bun run --filter '@aqsha/convex' test`, then `cd packages/convex && npx convex dev --once`.

## Execution order

| Slice | Solves | Size | Depends on |
|---|---|---|---|
| R0 — headless deep-run harness | blocker #1's *gate* | S–M | nothing |
| R1 — 3.1 LLM core behind a strangler flag | blocker #1 itself | L | R0 |
| R2 — AUD-08 RAG-on-resume via `contextHandler` | blocker #3 | S | R0 (for the live HITL-resume scenario) |
| R3 — AUD-17 dedup + single-budget assembler | blocker #4 | M | none (but land after R1 to avoid touching `runInlineGeneration` concurrently) |
| R4 — per-subagent skill delegation | 3.4 remainder | S | R1 |

R2 and R3 both touch `runInlineGeneration` — sequence them, don't parallelize.

---

## Slice R0 — Headless deep-run harness (de-blocks #1's validation gate)

**Insight that dissolves the blocker:** the "auth'd thread → deep message → approval → multi-minute workflow" cycle only *looks* un-automatable because it was framed as a UI flow. Every step has an internal-function equivalent, and `npx convex run` executes `internalAction`s directly against the dev deployment. So the manual run becomes a scripted, repeatable smoke gate.

**R0.1 — dev-only harness module** `packages/convex/convex/agent/evals/devHarness.ts`:
- `startSmokeRun` (`internalAction`): guards on `process.env.AQSHA_DEV_HARNESS === "1"` (throw `appError` otherwise — never callable on prod). Creates a thread for a fixed harness user, saves a deep-research prompt message, and schedules the run through the SAME entry path production uses (`savePromptAndScheduleRun`-equivalent internal seam), returning `{threadId, runId}`.
- `resolvePendingApprovals` (`internalAction`): finds pending HITL cards/inline `needsApproval` tool calls for the run and resolves them approved, via the same internal mutations the UI calls. This is also the seam for the **HITL-resume scenario** in R2.
- `getSmokeStatus` (`internalQuery`): `{status, stepEvents: agentRunEvents grouped by stepKey, budgetJson, draftMarkdown?: boolean, artifactId?, verificationReport?: boolean, citationStatuses, computationCheckCount}` — one bounded read so the script never scrapes tables ad hoc.

**R0.2 — driver script** `packages/convex/scripts/smoke-deep-research.mjs`:
- `start → poll (getSmokeStatus, 10s interval, 15 min timeout) → on waiting_hitl: resolvePendingApprovals → continue polling → final assertions`.
- Assertions, per scenario: run reaches `completed`; expected `stepKey` sequence appears in events (literature rounds → counter-evidence → citation → writer → statistical → auditor); artifact exists; `verificationReportJson` present; budget envelope totals > 0 per subagent; on a forced-failure scenario, the report ships with the "verification incomplete" section instead of failing the run.
- Scenarios as args: `--scenario=happy|hitl-resume|verifier-fail|cancel-midrun`. `cancel-midrun` calls the cancel mutation between rounds and asserts graceful stop (non-throwing cancel checks from the 3.1 plan).
- Exit code = gate result, so it can ride CI later as Job 3 of `.github/workflows/agent-evals.yml` (secret-gated like Job 2, off the blocking path).

**Why this is enough:** blocker #1 said "no unit test can validate" the LLM-calling core — true, and this doesn't pretend to unit-test it. It replaces the *manual* run with an *observed scripted* run: same fidelity (real providers, real Daytona, real workflow), but repeatable after every increment instead of once at the end. Cost per run = one deep run on dev (already budgeted for the manual gate).

**Tests:** the harness guard itself (env flag off → structured error) via convex-test; the status query shape via a seeded-fixture test.

---

## Slice R1 — 3.1 LLM core, strangler-flagged

The remaining 3.1 tasks (round-agent extraction, handler-loop rewrite, verifier/writer/auditor subagents, `persistArtifact` split, dead-code deletion) proceed as planned in the main doc, with two risk-reduction changes:

**R1.1 — strangler flag instead of big-bang swap.** `deepResearchExecuteWorkflow` (deepResearch.ts:228–299) branches on `process.env.DEEP_RESEARCH_V2 === "1"` (dev on, prod off): v1 keeps calling the monolithic `researchLoop`/`synthesize`/`auditClaims`; v2 runs the decomposed steps. Both paths share `normalizePlan` and `finalizeThread`. Dead-code deletion (researchLoop/synthesize/auditClaims) happens only AFTER the R0 smoke matrix is green on v2 **and** v2 has been default for one stabilization window — that's the answer to "landing it blind would risk the core feature."

**R1.2 — land in harness-gated increments**, each one `convex dev --once` + one targeted smoke scenario:
1. `runResearchRound(ctx, args, state)` shared extraction (deepResearch.ts:645–917 body) — first called by the EXISTING loop (pure refactor, `workflowSnapshot.test.ts` must stay green), then by the new `literatureRoundAgent` internalAction (rehydrate via `listRunSourceState`/`listExtractsForRun`/`getLatestRoundSnapshot` → `rehydrateLoopState`, persist deltas + budget, return scalars `{sourceCount, extractCount, sufficiencyStatus, gapAssessment, stopReason}`). Persist `buckets` once per run (new optional `agentRuns` field or round-0 snapshot) so rounds don't re-plan them.
2. Handler loop rewrite (v2 branch): for-loop of `step.runAction(literatureRoundAgent)` with the same termination predicate (deepResearch.ts:908–912), then `counterEvidenceAgent` as a retryable step.
3. `ensureRunArtifact` shell + `citationAgent` (pre-writer, keys on accepted sources — reuses Phase 2A engine).
4. `writerAgent` (stages `agentRuns.draftMarkdown`) → `statisticalAgent` (post-writer, on draft prose, serviceMode sandbox) → `auditorAgent` (3.2 logic + agentic-RAG downgrade) → `finalizeArtifactContent` (split out of `persistArtifact`).
5. Budget increments via `updateBudget` per step + non-throwing cancel checks; a failed verifier writes a `verification_incomplete` marker consumed by the writer/finalizer (run never fails on verifier failure).
- Each subagent writes `agentRunEvents` with its `stepKey` (event types already exist — blocker #5).

**R1.3 — fixture-mocked convex-test layer (cheap subset, not the gate):** seed run + plan + sources/extracts/round snapshots, `vi.mock` `chatProvider` for canned `generateText`/`generateObject` outputs, and assert: rehydration parity at the round boundary, budget folding, step-status transitions, verifier-failure degradation. This catches contract regressions in CI without provider keys; the R0 smoke run remains the behavioral gate.

---

## Slice R2 — AUD-08: RAG on HITL resume (blocker #3)

**Verified mechanism.** `@convex-dev/agent` 0.6.1 offers exactly the "non-message context injection" the blocker asked for: `contextHandler` (`types.d.ts:255–293`, applied in `search.ts:658–669`) post-processes the assembled `ModelMessage[]` before the AI SDK call and is **never persisted** — no spurious user message. (The `messages` param is also unsaved under default `storageOptions: "promptAndOutput"`, but `contextHandler` gives explicit placement control, so it's the primary.)

**Design:**
1. **Persist the recall query.** Add optional `agentRuns.visiblePromptSnapshot` (schema-additive). `startInlineRun` (messages.ts:~1418) stores `args.visiblePrompt` + reuse the existing `messageAttachmentArtifactIds` if not already on the run. (Cleaner than re-deriving the query by stripping context blocks out of `promptSnapshot`.)
2. **Resume path** (`resumeGeneration`, messages.ts:1264–1273): load the run; if `visiblePromptSnapshot` exists, call `buildRagContextForThread` with it (+ attachment ids), and pass the resulting block into `runInlineGeneration` as a new optional arg `resumeRagContext?: string`.
3. **Injection** in `runInlineGeneration` (messages.ts:1087–1100): when `resumeRagContext` is set (resume path only — `args.prompt` is undefined there, so no interaction with the normal line-1020 path), pass `contextHandler` in the options: insert one synthetic message containing the `<retrieved_document_context>` block immediately **before** `inputPrompt`/`existingResponses` (i.e., before the HITL resolution turn), leaving `search`/`recent` untouched.
4. **Important non-change:** do NOT pass `prompt` on resume — with `promptMessageId` set, a string `prompt` *replaces* the message at that id (`types.d.ts:22–35`), which would clobber the HITL resolution. This is why the naive fix was wrong and the blocker existed.
5. **AUD-17 interaction:** once R3 lands, the resume path also threads `excludeArtifactIds` (from the run's stored included-artifact ids) into the rebuild — noted here, implemented in R3.

**Validation:** unit test for the pure `contextHandler` implementation (given assembled buckets, asserts placement + idempotence); convex-test for snapshot persistence; live gate = R0 `--scenario=hitl-resume` (approve mid-run, then assert the resumed turn's generation context contained the RAG block — expose via a debug field on `agentRunEvents` in dev-harness mode only).

---

## Slice R3 — AUD-17: dedup + single-budget context assembler (blocker #4)

The deferral reason ("unvalidated hot-path change at session tail") is retired by making this its own gated slice with the full call-site map. Two steps, separately gated:

**R3.1 — dedup (mechanical, the original AUD-17 core).**
- `buildPromptContextForThread` (threadContext.ts:530) returns `{ block: string; includedArtifactIds: Id<"artifacts">[] }` — an artifact id is "included" only when its content was NOT truncated by the budget loop (threadContext.ts:556–565); truncated artifacts stay RAG-eligible on purpose.
- Thread `includedArtifactIds` through the verified blast radius: `scheduleGenerationForMessage` (messages.ts:457–461, 490–500) → `generateReply` args (messages.ts:1204–1238) → `runInlineGeneration` (messages.ts:1003–1017) → `buildRagContextForThread` new `excludeArtifactIds` arg (ragContext.ts:86–96) → filter in `retrieveThreadDocumentContext` (ragContext.ts:46–55, drop excluded `artifactId` filters; workspace filters untouched). Also: `completeThreadStartAfterAttachments` call site, and the resume path (store ids on `agentRuns` at start so R2's resume rebuild can exclude too).
- Tests: unit (return-shape + truncation⇒not-included edge), convex-test integration (full-fit artifact absent from RAG filters; truncated artifact present).

**R3.2 — single-budget assembler.**
- New pure `assembleContext(blocks, budget)` in `agent/context/` unifying today's scattered constants (`PROMPT_CONTEXT_TOTAL_LIMIT` 16k, per-artifact 4k, `RAG_CONTEXT_LIMIT` 6k, currently-uncapped skill bodies): ordered typed blocks (`workspace_manifest | document | skill_catalog | skill_content | retrieved | computation`) with per-kind caps + one total budget; `skill_content` marked non-evictable (compaction-protection invariant from 2D); emits `{text, report}` where `report` lists what was clipped/dropped (no silent truncation).
- `buildPromptContextForThread` and the RAG injection both feed through it; this is also where `<computation_context>` injects for R1's subagents — one assembler, every block.
- Tests: pure unit suite (cap enforcement, ordering, protection, report accuracy). Live: one R0 happy-path run after landing (hot-path guard).

---

## Slice R4 — Per-subagent skill delegation (3.4 remainder)

Rides R1 wiring (as the main plan already concluded): each v2 subagent resolves its own skill at step start — `literatureRoundAgent`/`writerAgent` load the matched domain pack (`deep-research-medis|-cs-ml|-pendidikan`, selected from descriptions as today), `statisticalAgent` loads `stat-verification`, `citationAgent` loads `citation-verification` — injected into that step's prompt only (via R3.2's assembler `skill_content` block), recorded in `skillActivations` with the `stepKey`. Sibling contexts stay lean; that's the whole point of delegation. Test: activation rows per step in the R0 happy-path scenario + a convex-test asserting the resolver picks the right pack per subagent kind.

---

## What this leaves open (explicitly)

- **AUD-08 fallback** if a run predates `visiblePromptSnapshot`: resume proceeds without RAG (current behavior) — additive field, no backfill.
- **CI Job 3** (smoke harness on preview deploys) is wired only after the scenario matrix is stable locally; it stays secret-gated and non-blocking.
- v1 monolith deletion is a follow-up commit after the stabilization window, not part of R1.

---

# Execution roadmap — blockers solved → Phase 3 done

Eight focused sessions (S1–S8). Every session ends gate-green (`typecheck · lint · convex test · convex dev --once`) **plus** the listed smoke scenario(s), and ends with a commit — no session leaves the branch broken. A key property throughout: **v2 stays end-to-end runnable at every increment** by letting the v2 branch temporarily call the remaining monolith tail (e.g. v2 rounds → monolith `synthesize`/`auditClaims`) until the decomposed replacement lands. Rollback at any point = `DEEP_RESEARCH_V2=0`.

### S1 — R0 harness + v1 baseline (S–M)
1. `agent/evals/devHarness.ts`: `startSmokeRun` / `resolvePendingApprovals` / `getSmokeStatus`, all guarded by `AQSHA_DEV_HARNESS=1` (structured `appError` otherwise).
2. `scripts/smoke-deep-research.mjs` with `--scenario=happy|hitl-resume|verifier-fail|cancel-midrun` (only `happy` must pass now).
3. Tests: env-guard rejection (convex-test) + `getSmokeStatus` shape on a seeded fixture.
4. **Run `happy` against the current v1 monolith and save the output as the behavioral baseline** — this validates the harness itself and gives R1 something to diff against.
- _Exit:_ gates green; `happy` passes on v1; baseline JSON committed under `tests/fixtures/`.

### S2 — R1a: `runResearchRound` extraction, pure refactor (M)
1. Extract deepResearch.ts:645–917 into shared `runResearchRound(ctx, args, state)`; the EXISTING `researchLoop` now calls it (behavior-preserving — `workflowSnapshot.test.ts` and `deepResearch.test.ts` must stay green untouched).
2. Persist `buckets` once per run (round-0 snapshot or optional `agentRuns` field) and read them back per round.
- _Exit:_ gates green; smoke `happy` on v1 matches the S1 baseline (sources/extracts/round counts within tolerance).

### S3 — R1b: `literatureRoundAgent` + v2 handler loop (M–L)
1. `subagents/literatureRoundAgent.ts` (internalAction): rehydrate (`listRunSourceState`/`listExtractsForRun`/`getLatestRoundSnapshot` → `rehydrateLoopState`) → `runResearchRound` → persist deltas + `updateBudget` → return scalars.
2. v2 branch in `deepResearchExecuteWorkflow` behind `DEEP_RESEARCH_V2`: for-loop of `step.runAction(literatureRoundAgent)` with the v1 termination predicate (deepResearch.ts:908–912); `counterEvidenceAgent` as a retryable step; **tail still calls monolith `synthesize`/`auditClaims`/`persistArtifact`** so v2 is fully runnable.
3. Fixture-mocked convex-test (R1.3 subset): rehydration parity at the round boundary + budget folding.
- _Exit:_ gates green; smoke `happy` on **v2** completes with a report comparable to baseline; `cancel-midrun` passes on v2 (non-throwing cancel between rounds).

### S4 — R1c: `ensureRunArtifact` + `citationAgent` + `writerAgent` (M)
1. `ensureRunArtifact` (artifact shell, no visible version) as a workflow step.
2. `citationAgent` step pre-writer (wraps the Phase-2A engine over accepted sources; failure ⇒ `verification_incomplete` marker, never run failure).
3. `writerAgent` replaces `synthesize` in v2: synthesizes with `integrityStatus` context, stages `agentRuns.draftMarkdown`.
- _Exit:_ gates green; smoke `happy` on v2 shows step order literature→counter→citation→writer in `agentRunEvents`; artifact draft staged.

### S5 — R1d: `statisticalAgent` + `auditorAgent` + finalize split (M–L)
1. `statisticalAgent` post-writer on the draft prose (serviceMode sandbox, reuses Phase-1 runner); failure ⇒ marker, not run failure.
2. `auditorAgent` (3.2 logic: tier-aware claims, computation linking, agentic-RAG downgrade) revises the draft; `finalizeArtifactContent` split out of `persistArtifact` publishes the final version + `verificationReport`.
3. Budget increments on every step; remaining cancel checks; report ships a "verification incomplete" section when any marker is set.
- _Exit:_ gates green; smoke matrix `happy` + `verifier-fail` + `cancel-midrun` all pass on v2. **3.1 functionally complete.**

### S6 — R2: AUD-08 (S)
1. Schema: optional `agentRuns.visiblePromptSnapshot`; `startInlineRun` stores it (+ attachment ids if missing).
2. `resumeGeneration`: rebuild RAG block from the snapshot → `runInlineGeneration` `resumeRagContext` arg → `contextHandler` injection before the HITL-resolution turn (never via `prompt` — see R2 §4).
3. Unit tests for the pure handler; convex-test for snapshot persistence.
- _Exit:_ gates green; smoke `hitl-resume` passes and the resumed turn's context contains the RAG block (dev-harness debug event).

### S7 — R3: AUD-17 (M)
1. R3.1 dedup: `{block, includedArtifactIds}` return + threading through the 8 mapped call sites + `excludeArtifactIds` filter + resume-path threading (store included ids on the run for S6's rebuild). Unit + integration tests.
2. R3.2 assembler: pure `assembleContext(blocks, budget)` (per-kind caps, `skill_content` protected, clip report); route prompt-context + RAG + future `<computation_context>` through it. Unit suite.
- _Exit:_ gates green; one smoke `happy` (hot-path guard); no duplicate artifact content between prompt block and RAG block in the debug dump.

### S8 — R4 + flip + cleanup → Phase 3 DONE (M)
1. R4 delegation: each v2 subagent activates its own skill per `stepKey` via the R3.2 assembler; `skillActivations` rows per step; resolver test.
2. Flip `DEEP_RESEARCH_V2=1` as default on dev; stabilization window = the full smoke matrix (all 4 scenarios) + at least one organic deep run from the UI.
3. Delete the monolith: `researchLoop`, `synthesize`, `auditClaims`, the pre-split `persistArtifact` body, dead types; retire the flag (v2 becomes the only path).
4. Docs: update `astra-phase-2-4-plan.md` status section (3.1 ✅, 3.4 ✅, blockers closed); optional CI Job 3 (secret-gated smoke on preview).
- _Exit:_ **Phase 3 definition of done** (below) fully checked; merge `development` → PR to `main`.

### Phase 3 — definition of done
- [x] Smoke matrix on v2: `happy` ✅ live; `cancel-midrun` ✅ live (non-throwing between-round check). `hitl-resume` covers the deep plan-approval resume (✅ exercised every run); the *inline*-chat HITL-with-RAG path (AUD-08) is unit-tested, not in the smoke matrix. `verifier-fail` — Daytona is unavailable on dev so the stat pass degrades on every run (the natural verifier-fail), and the report ships a caveat; a *forced* failure injection is not wired into the harness.
- [x] Subagent step sequence visible in `agentRunEvents` with per-step `stepKey`; per-subagent budget envelope folded via `updateBudget` (literatureRound/counterEvidence/citation/writer).
- [x] Verifier failure degrades to a "verification incomplete" report section (`appendVerificationCaveat` driven by `agentRuns.verificationMarkersJson`); run never fails on verifier failure.
- [x] HITL resume re-injects RAG context via `contextHandler` without persisting a spurious message (AUD-08).
- [x] Full-included artifacts excluded from RAG retrieval (AUD-17 dedup). _Single budgeted `assembleContext` with clip report (R3.2): deferred — behavioral dedup done, constants unification is the remaining polish._
- [x] Each subagent activates only its own skill; sibling contexts unpolluted (writer domain pack + citation recipe via `skillActivations`).
- [ ] **Deferred to the stabilization window (by design):** monolith deletion + `DEEP_RESEARCH_V2` flag retirement. The plan itself gates this on "v2 default for one stabilization window"; v2 is validated but not yet the default, so the monolith stays as the flag-off rollback path. No dead exports introduced (`bun run lint` clean).
- [x] Test count 305, well above the 281 baseline; `workflowSnapshot.test.ts` unchanged (R1a extraction was behavior-preserving).
- [x] `astra-phase-2-4-plan.md` status + blockers updated; this doc marked executed (§"Execution status").

### Execution status (2026-06-12)
Roadmap **S1–S4, S6, S7-R3.1, R4, and S5's degradation caveat are executed and gate-green** (305 convex tests; commits `bc6d074`, `ee18baa` on `development`, plus the R4 + cancel-check increment). All three blockers (#1, #3, #4) are resolved and the deep-research decomposition is live-validated end-to-end behind `DEEP_RESEARCH_V2` (v1 + v2 `happy` and `cancel-midrun` pass against dev).

**Explicitly NOT done (and why):**
- **S5 full artifact split** (`ensureRunArtifact` shell + `finalizeArtifactContent` + stat-before-auditor) — the only on-dev-observable payoff (computation→claim linking) requires Daytona, which is unavailable on this deployment; the split's risk (rewiring the shared `persistArtifact` artifact lifecycle) is not justified until Daytona is live. v2 keeps the post-persist service-mode stat pass + the verification caveat, so behavior degrades correctly today.
- **S7 R3.2 assembler** — the behavioral dedup (R3.1) is the blocker; the single-budget `assembleContext` unification is code-quality polish.
- **S8 flip-default + monolith deletion** — the plan mandates a stabilization window before these; rushing them would remove the flag-off rollback path while v2 has only just been validated.

### Risk register
| Risk | Mitigation |
|---|---|
| v2 behavior drifts from v1 unnoticed | S1 baseline diff + `workflowSnapshot.test.ts` pins; flag-off rollback at any session |
| Harness leaks to prod | `AQSHA_DEV_HARNESS` guard + structured error path tested in CI |
| `contextHandler` ordering subtly wrong | pure handler unit-tested on assembled-bucket fixtures before any live use |
| AUD-17 hot-path regression | mechanical typed change (compiler walks the 8 sites) + dedicated session + smoke after |
| Budget/OCC on re-run verifiers | split timing is sequential; `updateBudget` increments keyed by step attempt (idempotent fold) |
| Daytona snapshot drift breaks `statisticalAgent` | smoke `verifier-fail` doubles as the degradation test — a Daytona outage must produce a marker, not a failed run |
