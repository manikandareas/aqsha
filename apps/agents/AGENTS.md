# `apps/agents` — Astra agent service (Claude Agent SDK)

Standalone Node/Bun service implementing the agent side of
`docs/claude-agent-sdk-app-plan.md`. It runs Astra on
`@anthropic-ai/claude-agent-sdk` (Hono HTTP surface, in-process MCP tools,
SDK sessions per thread) and is deliberately **not** wired to `apps/web` yet.

## Commands

```bash
bun run dev          # watch mode (memory store)
bun run start        # run once
bun run test         # vitest (91 tests)
bun run typecheck    # tsc --noEmit
# From the repo root: bun run dev:agents / bun run test:agents
```

## Architecture (mirrors plan §4.2)

```
src/
  server.ts            Hono: POST /runs, /runs/:id/{resume,cancel},
                       POST /interactions/:id/respond, GET /commands, /healthz
  main.ts              entrypoint; store backend selected by AGENTS_STORE
  config.ts            env-driven config (models D6, budgets, hold window)
  runs/
    runManager.ts      active-run registry, concurrency cap, execute/interrupt/
                       resume loop, /deep interception, cancel
    sdkRunner.ts       the ONLY file touching the SDK's query() at runtime
  agent/
    astra.ts           query() options per tier (model, maxTurns, allow-list)
    systemPrompt.ts    ported Astra instructions (lite/pro/deep)
    toolPolicy.ts      tool allow-lists; executeArtifact excluded on turn 1
    contextAssembly.ts artifact/manifest/RAG/history prompt blocks + budgets
    interactions.ts    HITL broker: hold-window approvals, askUser interrupt
    hooks.ts           PreToolUse executeArtifact gate + run-event hooks
    streamBridge.ts    SDK stream → batched message/text + result summary
  tools/               in-process MCP server "aqsha" (research, citations,
                       artifacts, workspace, askUser, sandbox)
  citations/           ported integrity engine + heuristic bibliography parser
  providers/           Exa / Jina / Crossref / arXiv / OpenAlex (fetch + TTL
                       cache + arXiv pacer); billing/limits stay in Convex
  subagents/           deep-research AgentDefinitions + domain-pack delegation
  commands/            SKILL.md → CommandDescriptor registry (+ /deep)
  store/               AgentStore interface; MemoryStore (dev/tests) and
                       ConvexStore (Phase-1 contract, see below)
.claude/skills/        the 10 builtin skills (also slash commands)
```

## Key invariants (do not break)

- **executeArtifact double gate**: excluded from the initial-turn allow-list
  (`toolPolicy.ts`) AND verified by the `PreToolUse` hook against an approved
  `proposeArtifact` interaction (`hooks.ts`). Never relax either layer.
- **Never `bypassPermissions`** — it ignores `allowedTools` (plan §4.4).
- **HITL state lives in the store**, never only in process memory. The SDK
  session file is a resume optimization; losing it must degrade to the
  history-rebuild path in `contextAssembly.ts`.
- **Approval hold-window** (`AGENTS_HOLD_WINDOW_MS`, default 45s): fast user
  responses resolve in-place via `canUseTool`; timeouts interrupt the run
  (status `waiting_hitl`) and `POST /interactions/:id/respond` resumes it.
- `cwd` for `query()` is `config.appRoot` and must stay stable across
  restarts/deploys or session resume breaks.

## Convex contract (Phase 1, not yet implemented in packages/convex)

`store/convexStore.ts` defines `SERVICE_FUNCTIONS` — the exact
`agent/service:*` function paths the service will call once the first-party
tables of plan §4.5 land in `packages/convex`. Implement those endpoints with
matching args (every call carries `serviceToken`), then set
`AGENTS_STORE=convex` + `CONVEX_URL`.

## Environment

| Var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required for live runs (D5) |
| `AGENTS_PORT` | `8787` | HTTP port |
| `AGENTS_SERVICE_TOKEN` | — | bearer token for all routes except `/healthz` |
| `AGENTS_STORE` | `memory` | `memory` \| `convex` |
| `ASTRA_LITE_MODEL` / `ASTRA_PRO_MODEL` | `claude-haiku-4-5` / `claude-sonnet-4-6` | tiers (D6) |
| `ASTRA_DEEP_LITE_MODEL` / `ASTRA_DEEP_PRO_MODEL` | chat models | deep tiers |
| `AGENTS_HOLD_WINDOW_MS` | `45000` | HITL hold-window |
| `ASTRA_MAX_RUN_BUDGET_USD` | `20` | per-dispatch cost guard (no SDK maxBudgetUsd) |
| `CLAUDE_CODE_ENABLE_TELEMETRY` / `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTEL: inherited by the SDK child process |
| `EXA_API_KEY`, `JINA_API_KEY`, `OPENALEX_API_KEY`, `CROSSREF_MAILTO` | — | providers |
| `DAYTONA_API_KEY`, `DAYTONA_STATVERIFY_SNAPSHOT` | — | sandbox (Phase 4) |

## Status vs plan phases

- ✅ Phase 0/1 service core: scaffold, Hono + auth, run lifecycle, stream
  bridge, ported research/citation tools, context assembly, skills as
  commands, session persistence + history-rebuild fallback.
- ✅ Phase 2 HITL redesign: `pendingInteractions` model, hold-window,
  interrupt/resume, unified respond endpoint, artifact/workspace flows,
  executeArtifact gate, command registry.
- ✅ Phase 3: deep research as DURABLE multi-phase orchestration
  (`runs/runManager.ts executeDeepRun` + `agent/deepPhases.ts`): five isolated
  query() phases (plan → literature → counter_evidence → citation_verify →
  write) with per-phase state in the store (`researchPhaseStates`); only the
  parallel `literature-searcher` remains a subagent. Re-dispatch replays only
  non-done phases; HITL resumes the interrupted phase's own session.
- ✅ Phase 4 (engine): Daytona statistical-verification engine ported to
  `src/sandbox/` (classifiers + R scripts + vendor + claim extraction);
  `buildSandboxService` runs it when `DAYTONA_API_KEY` +
  `DAYTONA_STATVERIFY_SNAPSHOT` are set, else `not_configured`. Per-dispatch
  cost guard via `ASTRA_MAX_RUN_BUDGET_USD`; OTEL via inherited env.
- ✅ Convex side: first-party tables + `agent/service:*` endpoints (28) +
  web data-hooks behind `NEXT_PUBLIC_AGENT_BACKEND=sdk`.

Bibliography extraction for `verifyCitations` is currently a deterministic
parser (`citations/bibliography.ts`); the legacy LLM extraction pass can be
layered on later without changing the tool contract.
