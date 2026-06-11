# Astra Agent 2.0 — Implementation Plan, Phase 2 → 4 (to completion)

> Companion to `docs/astra-agent-maximized.html` (the audit + redesign) and `docs/agent-deep-dive.html` (current architecture). This file is the executable roadmap for the remaining phases. Conventions: `packages/convex/convex/AGENTS.md` (domain facade+folder, object-syntax functions, `returns` validators, owner-scoped tables, bounded reads, structured `appError`). Gate after every slice: `bun run typecheck && bun run lint && bun run --filter '@aqsha/convex' test`, then `cd packages/convex && npx convex dev --once`.

## Status (done)

- **Phase 0 — debt + organization** ✅ AUD-01/02/03/04/05/06/11/13/14/21. Shared sources of truth (`agent/hitl/hitlToolNames.ts`, `agent/providers/userAgent.ts`, `agent/research/deepResearchContract.ts`, `billing/catalog.ts:featureForUsage`), typed contracts, cache-before-gate, arXiv `reserve` pacing.
- **Phase 1 — sandbox + Verification Engine Module 1 (statistics)** ✅ `agent/sandbox/*` (runner, vendor-neutral interface, tools, compute router, claim extraction, statcheck/GRIM/GRIMMER/power classifiers, computation workflow for long jobs, records, verificationReport builder), tables `sandboxRuns` + `computationChecks`, `agentRuns.verificationReportJson`, `sandbox_compute` billing feature (optional-key, no migration), `runComputation` approval tool. **Daytona snapshot must stay pre-baked** (tier egress blocked).
- **De-risked**: MCP web-standard transport runs in the Convex isolate (stateless + `enableJsonResponse`); Daytona works from a `"use node"` action.

**Guiding principles (unchanged):** verification is the differentiator; deterministic results split from LLM judgment; every capability rides the same cost gate (credits → rate limit → ledger → rollup); neutral framing (discrepancy ≠ fraud); each change leaves the code more organized (dedupe, typed contracts, tests).

---

# Phase 2 — Integritas (M)

**Outcome:** every deep-research report and any workspace bibliography carries 4-step-verified citations; quantitative papers auto-get a light integrity pass; the UI shows a Verification Panel; and the agent gains a **Skills runtime** so research methodology becomes pluggable knowledge instead of hardcoded prompts. Two independent tracks (2A citations, 2B skills) — parallelizable.

## Track 2A — Citation verification (4-step) · Module 2

The cheapest high-value win: almost entirely composition of providers that already exist (`searchOpenAlexWorks`, `lookupDoiProvider`, `searchArxivProvider`, `canonicalSourceKey`).

**Slice 2A.0 — billing + schema foundation** (mirror the `sandbox_compute` pattern from Phase 1):
- Add `citation_verify` everywhere `sandbox_compute` was added: `billing/usageShape.ts` (USAGE_FEATURES + `v.optional(v.number())` in featureCountValidator + `emptyFeatureCounts`), `billing/catalog.ts` (CreditFeature + estimateCredits branch + requiredPlanForFeature), `schema.ts` providerUsageLedger.feature union, `billing/entitlements.ts` featureValidator, `billing/usage.ts` activity map (`?? 0`). Rate bucket `citationVerifyPerUser` in `limits.ts`.
- `schema.ts` `researchSources` (~:824): add optional `integrityStatus` (`verified | metadata_mismatch | identifier_invalid | not_found | unverifiable`), `integrityDetailJson`, `integrityCheckedAt`.
- Tests: extend `tests/billingCatalog.test.ts` + `tests/usageRollup.test.ts`.

**Slice 2A.1 — the 4-step engine** (`agent/research/citationIntegrity.ts`, pure + a thin action):
1. **Existence** — title+author fuzzy match against OpenAlex (`searchOpenAlexWorks`), fallback Crossref. Reuse the 24h cache.
2. **Metadata consistency** — compare cited author/year/venue vs the DB record (`ExploreCandidateMetadata` carries the fields).
3. **Identifier validation** — DOI → `lookupDoiProvider` (resolve + title match); arXiv id → `searchArxivProvider` id-mode (version-normalized via `canonicalSourceKey`).
4. **Not a link check** — HTTP 200 is never proof; steps 1–3 decide. A dead URL on an otherwise-valid citation lowers accessibility, not validity.
- Output per source: one `integrityStatus` + `integrityDetailJson`. Keep the **fuzzy-match scorer** a pure unit-tested helper.
- Gate with `citation_verify` credit + rate limit (cache-before-gate, like Phase 0 AUD-04).

**Slice 2A.2 — surfaces** (3 triggers, one engine):
- (a) **Auto** on every final deep-research source (wire into `deepResearch.ts persistSourcesForRun`).
- (b) **Chat tool** `verifyCitations` (`agent/sandbox/sandboxTools.ts`-style registration, exposed by the compute router when a bibliography/paper is in context) — the peer-reviewer use case.
- (c) Reserved for the MCP endpoint (Phase 4).
- Tests: golden set of ~20 citations (valid / fabricated / typo-metadata) → assert statuses (pure, mock provider results).

## Track 2B — Deep-research × sandbox integration

- In `deepResearch.ts`, after retrieval/synthesis, when a quantitative paper is detected, **default-run a light stat-integrity pass** via the existing `agent/sandbox/` runner (extract headline numbers + statcheck) and attach `computationChecks` to the run. Reuse `claimExtraction.ts` + `statcheckClassify.ts`. (Full per-subagent decomposition is Phase 3 — here it's an inline step inside the current monolith.)
- Mid-fanout cancellation (AUD-20 follow-through): ensure the sandbox runner honors cancel.

## Track 2C — Verification Panel v1 (apps/web)

- Render `verificationReportJson` (statistics summary + verdict badge) at the report head; per-source integrity badge from `integrityStatus`; finally render the **`evidenceStrength`** badge that is persisted but unused (AUD-19). Reuse the thread-experience render seams; respect detail/panel parity (`apps/web/AGENTS.md`).

## Track 2D — Agent Skills runtime v1

Turns hardcoded procedural knowledge (`runtime.ts SHARED_INSTRUCTIONS`, the 10 `promptCommands.ts buildPrompt` bodies, deepResearch internal prompts) into pluggable **SKILL.md** packages (open standard, agentskills.io). MCP gives tools; Skills teach what to do with them.

**Slice 2D.0 — schema + parser** (greenfield; spec §11):
- Tables `skills` (scope builtin|user|workspace, name lowercase-hyphen ≤64, description ≤1024, version, checksum, enabled, `bodyStorageId`, `resourcesJson` manifest, `hasScripts`, `metadataJson`) + `skillActivations` (dedup + provenance). Owner-partitioned, `by_scope_name` / `by_owner_enabled` / `by_owner_workspace` indexes.
- SKILL.md parser/validator (`agent/skills/skillParser.ts`, pure, unit-tested): YAML frontmatter, soft validation (warn-and-load except empty description), frontmatter fields name/description/license/compatibility/metadata/allowed-tools (allowed-tools = experimental **space-separated string**, treated as a narrower, never a widener).

**Slice 2D.1 — runtime (3-tier progressive disclosure):**
- **Tier 1 catalog**: context assembler (`agent/context/*`) emits `<available_skills>` (name+description of enabled skills, ~100 tok each). If skills grow, embed descriptions in RAG and cap the lite catalog to top-k; pro/deep get the full catalog.
- **Tier 2 activation**: `activate_skill` tool with **enum** name (prevents hallucinated names); returns SKILL.md body wrapped in `<skill_content name=...>`; dedup per session via `skillActivations`. User-explicit `/skill:name` rides the existing slash-command parser. **Mark `<skill_content>` protected from compaction/pruning** (silent loss = silent degradation).
- **Tier 3 resources**: references/assets read on demand from Convex storage (the spec uses the model's normal file read; expose a minimal `read_skill_resource(name, path)`). `scripts/` are **never executed in Convex** — hydrate into the Daytona sandbox via the existing `runSandboxTask` path (approval/billing/provenance apply automatically). Skill recipe + sandbox lab = synergy.

**Slice 2D.2 — seed builtin skills + command migration:**
- Bundle in repo `packages/convex/skills/` (seed on deploy): `deep-research-guide`, `stat-verification`, `citation-verification`, `citation-apa7`, `academic-id`.
- Migrate the 10 `promptCommands.ts buildPrompt` bodies → builtin skills; the slash-command catalog is generated from the skill catalog (new command = new skill, no deploy).
- **Security**: skills are an instruction-injection vector — guards stay deterministic in code (`guards`), never overridable by skill text; first activation of a `hasScripts` skill shows an informed-consent card.

**Phase 2 verification:** unit tests (fuzzy scorer, citation golden set, skill parser/validator, verdict); `convex dev --once` validates the new tables + feature additions; manual: drop a paper, run `verifyCitations`; activate a skill via `/skill:stat-verification` and confirm the body loads + is compaction-protected.

---

# Phase 3 — Orkestrasi (L)

**Outcome:** the ~3.2k-LOC `deepResearch.ts` monolith becomes contracted subagents (workflow steps), the claim auditor becomes genuinely "pro", a CI eval suite guards the verification quality, and domain skills make the agent pick the right methodology autonomously. Start only after Phase 2 is stable.

## Slice 3.1 — Decompose deep research into subagents (workflow steps)

Subagent = `internalAction` with a typed input/output contract (Agent-Card-style: name, capability, task schema), called via `step.runAction` on the existing `researchWorkflow` (`agent/workflow.ts`, maxParallelism 6). No new orchestrator.

`deepResearchExecuteWorkflow v2` steps (⇄ = parallel):
1. `literatureAgent` — discover→rerank→validateAndRead→assess (extract existing code as-is). Contract: `AcceptedSource[] + extracts`.
2. `counterEvidenceAgent` — existing, now a retryable step.
3a ⇄ `statisticalAgent` — quant-claim detection on accepted sources + context papers → sandbox recompute → `computationChecks` (reuses Phase 1 `agent/sandbox/*`).
3b ⇄ `citationAgent` — 4-step verification on all final sources → `integrityStatus` (reuses Phase 2A). Parallel with 3a (both need only steps 1–2).
4. `writerAgent` — synthesize with `computationChecks` + `integrityStatus` as context.
5. `auditorAgent` — span-level claims (Module 3) → revise → `verificationReport`.

**Coordination rules** (keep it simple): communicate ONLY via schema'd Convex data (`researchSources`, `computationChecks`, …) — no message passing; a verification subagent failing does NOT fail the run (report ships with an explicit "verification incomplete" section); per-subagent budget in `agentRuns.budgetJson` (token + provider calls + sandbox minutes — the AUD-12 reconciliation basis); each subagent writes `agentRunEvents` with its `stepKey` (new eventTypes `compute`, `citation_check`); each subagent activates its own skill (delegation) so domain instructions don't bloat sibling contexts. Chat (lite/pro) stays single-agent.

## Slice 3.2 — Auditor upgrade (Module 3 / AUD-10)

- Claim classification uses `deepModelForAgent(agentKind)` (not hardcoded lite); batch parallel with bounded concurrency; cap configurable per tier.
- `citationChecks`: add `evidenceKind` (`textual | computational | mixed`), `computationCheckIds`, `claimSpan`. Quant claims backed by recompute get `support: "supported"` with `evidenceKind: "computational"` (stronger than textual).
- Agentic-RAG synthesis rule: a factual claim with no supporting extract/computation is written as a hypothesis or removed — the auditor enforces, not just scores.

## Slice 3.3 — Eval suite (CI against a Convex preview)

- (a) golden set 30–50 labeled stat claims → statcheck-pipeline precision; (b) ~50 citations (valid/fabricated/typo) → 4-step accuracy; (c) routing/HITL/sandbox-router contract tests; (d) skill-trigger evals (description fires on relevant prompts, silent otherwise — per agentskills.io evaluating-skills). Verification that isn't measured rots.

## Slice 3.4 — Domain skills + carried-over debt

- Domain packs: `deep-research-medis` (PRISMA, RCT>cohort, retraction/predatory flags), `deep-research-cs-ml`, `deep-research-pendidikan`; selected autonomously by the model from descriptions. User/workspace skill upload via UI + informed-consent for scripted skills.
- Fold in deferred AUD items touched by the refactor: **AUD-08** (RAG on HITL resume — recover the turn's query in `beginResume`), **AUD-15** (tier-scaled evidence floor + show which floor failed), **AUD-16** (server `waiting_hitl` status), **AUD-17** (single-budget context assembler + dedup RAG vs included doc body — also where `<computation_context>`/`<available_skills>` blocks inject), **AUD-07** (count `waiting` active + replace `take(8)` with the index).

---

# Phase 4 — Ekspansi (L)

**Outcome:** Aqsha's verification is callable from any external agent (MCP), and the two remaining flagship computations (replication, meta-analysis) ship. MCP transport is already de-risked.

## Slice 4.1 — MCP server (Convex HTTP actions)

- `/mcp` route in `http.ts` using the **proven** `WebStandardStreamableHTTPServerTransport` (stateless `sessionIdGenerator: undefined` + `enableJsonResponse: true`); auth = per-user API key (new `apiKeys` table → ownerUserId) checked **in the httpAction** (the SDK's Express `requireBearerAuth` is unusable in the isolate); import only `mcp.js` + `webStandardStreamableHttp.js`. Re-add `@modelcontextprotocol/sdk` as an explicit pinned dep.
- Tools v1, each delegating to the SAME internal functions the agent tools use (one impl, two surfaces): `verify_statistics` (Phase 1 runner), `verify_citations` (Phase 2A engine), `run_computation` (taskKind, long jobs return `workflowId` + `get_run_status`), `search_scholarly` (composed OpenAlex/Crossref/arXiv — already cached/rate-limited/normalized).
- All gates auto-apply because every internal path is owner-keyed.

## Slice 4.2 — Replication workflow (feature #2)

- `WorkflowManager` job: pull a reproducibility package (repo data+code) → run in the sandbox → compare headline results → reproduction report. **Egress is the blocker** at this tier (spike B): either upgrade the Daytona tier for an allowlist, or pre-bake the dataset/deps into a per-task snapshot. Surface the constraint; gate behind `runComputation` approval. Provision→hydrate→execute→persist→teardown as workflow steps (teardown guaranteed).

## Slice 4.3 — Meta-analysis workflow (feature #3)

- Effect-size extraction → pooled estimate (`metafor::rma`) → forest/funnel plots → heterogeneity (I², Q) → publication bias (Egger, trim-and-fill). Output = an artifact + `verificationReport`. Reuses the sandbox + verificationReport contract; new R script `agent/sandbox/scripts/metaanalysis.R` (deps already in the snapshot spec).

## Slice 4.4 — Skills ecosystem + optional

- Curated domain skill library as product content (incl. journal-target skills + Indonesian academic conventions — competitor moat); community skill import (validate + review); export Aqsha skills as standard folders (portable to Claude Code/Codex/Gemini CLI). Optional: MCP **client** (consume Zotero / dataset registries — one more tool builder over the per-call injection); evaluate A2A only when a real external-agent partner appears (subagent contracts are already Agent-Card-compatible).

---

## Cross-cutting

- **Deferred debt not yet folded above:** AUD-01 (real `prepareStep` hard-gate for `executeArtifact` — do during any messages.ts tool-surface refactor; Phase 0 only fixed the comment), AUD-09 (verify the non-deep cited-answer path for provider-failure leakage — quick check), AUD-12 (billing reconciliation: actual cost ledger per run + calibrate flat rates), AUD-18 (composer restore-on-error + startThread optimistic echo — apps/web), AUD-19 remainder (drop dead `planResearch` / `reason`, finish `approveTool.workspaceId` injection).
- **Schema additions summary:** Phase 2 — `researchSources.integrityStatus/integrityDetailJson/integrityCheckedAt`, `skills`, `skillActivations`, feature `citation_verify`. Phase 3 — `citationChecks.evidenceKind/computationCheckIds/claimSpan`, `agentRunEvents.eventType` += `compute`/`citation_check`/`skill_activated`, per-subagent `budgetJson`. Phase 4 — `apiKeys`. All additive/optional (greenfield-safe; no backfills).
- **Recommended order:** 2A + 2D in parallel → 2B/2C → stabilize → Phase 3 (3.1 decomposition is the big one; gate with 3.3 evals) → Phase 4 (4.1 MCP first — cheap, de-risked; then 4.2/4.3 compute features).
- **Tech stack (no new external services beyond Daytona):** Convex + @convex-dev/{agent,workflow,rag,rate-limiter,polar}; `@daytona/sdk` (sandbox); `@modelcontextprotocol/sdk` (Phase 4); Agent Skills = SKILL.md parser + 2 tools + 2 tables (no heavy runtime dep). Rejected: external multi-agent frameworks (LangGraph/CrewAI) — Workflow + step contracts give 90% of the value at 10% of the complexity.
- **Gate every slice:** `bun run typecheck && bun run lint && bun run --filter '@aqsha/convex' test` then `npx convex dev --once`; add unit tests for every new pure helper and behavior-preserving refactor.
