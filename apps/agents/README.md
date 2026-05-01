# Astra Agents

`apps/agents` is Aqsha's standalone Python agent runtime. It uses Pydantic AI,
Agent Skills through `pydantic-ai-skills`, FastAPI for the internal HTTP server,
and `VercelAIAdapter` so the existing API/web chat stack can keep using the
Vercel AI SDK stream contract.

This app intentionally stays independent from `apps/api`, `apps/web`, and the
database. The only runtime contract consumed by the rest of the monorepo is:

```text
POST /internal/chat
```

## Architecture

Astra is the only public agent.

```text
apps/api or CLI
        |
        v
FastAPI /internal/chat
        |
        v
VercelAIAdapter
        |
        v
Astra
        |
        +-- Agent Skills: deep-research
        +-- Exa MCP: web_search_exa, web_fetch_exa
        +-- WebFetch
        +-- Provider WebSearch when explicitly enabled
```

The previous `chat`, `researcher`, `architect`, and `reviewer` agents are folded
into Astra's instructions, tools, and skills. Astra returns normal chat text so
it remains compatible with Vercel AI SDK streaming.

## Deep Research Skill

The local skill lives at:

```text
skills/deep-research/
├── SKILL.md
├── references/
└── scripts/
```

Astra must load `deep-research` for research-heavy requests such as academic
research, technical investigations, market analysis, policy/regulatory analysis,
competitive analysis, and evidence synthesis. The skill requires:

- scoped research questions;
- search strategy and source discovery;
- source screening and evidence cards;
- synthesis with explicit uncertainty;
- visual artifact specs when the evidence ledger has enough data;
- `PROCEED / REFINE / PIVOT` decisions;
- citation and visual provenance verification before final reporting.

Normal chat does not force the deep-research workflow.

Deep research can save `evidence.json`, `visuals.json`, Matplotlib-generated
SVGs, an `artifact_manifest.json`, and a `visual_artifacts.md` snippet under the
local research artifact directory. The final answer remains Markdown and embeds
only artifacts whose audit status is `passed`.

## Runtime Settings

Settings use the `ASTRA_` prefix and are read from `.env`.

```env
ASTRA_MODEL=openai:gpt-5.2
ASTRA_USER_ID=local-dev
ASTRA_WORKSPACE=aqsha
ASTRA_ENABLE_LOGFIRE=false
ASTRA_ENABLE_FILE_LOGGING=true
ASTRA_LOG_DIR=.astra/logs
ASTRA_LOG_FILE_NAME=astra.log
ASTRA_LOG_LEVEL=INFO
ASTRA_LOG_MAX_BYTES=5000000
ASTRA_LOG_BACKUP_COUNT=5
ASTRA_INTERNAL_TOKEN=replace-with-shared-secret
ASTRA_HTTP_HOST=127.0.0.1
ASTRA_HTTP_PORT=8001

ASTRA_EXA_MCP_URL=https://mcp.exa.ai/mcp
ASTRA_EXA_API_KEY=
ASTRA_EXA_MCP_AUTHORIZATION_TOKEN=
ASTRA_ENABLE_PROVIDER_WEB_SEARCH=false
ASTRA_PROVIDER_WEB_SEARCH_CONTEXT_SIZE=medium
ASTRA_PROVIDER_WEB_SEARCH_MAX_USES=5
ASTRA_ENABLE_WEB_FETCH=true
ASTRA_WEB_FETCH_MAX_CONTENT_TOKENS=12000
ASTRA_THINKING_EFFORT=medium
ASTRA_RESEARCH_ARTIFACT_DIR=.astra/research

OPENAI_API_KEY=
```

Exa MCP is attached only when `ASTRA_EXA_API_KEY` or
`ASTRA_EXA_MCP_AUTHORIZATION_TOKEN` is configured. WebFetch is enabled by
default and has a local fallback. Provider-native web search is off by default
because support depends on the selected model/provider.

## Error Logs

File logging is enabled by default. Server and CLI errors are written as JSONL
to:

```text
apps/agents/.astra/logs/astra.log
```

The file rotates according to `ASTRA_LOG_MAX_BYTES` and
`ASTRA_LOG_BACKUP_COUNT`. Unhandled FastAPI request errors include a `request_id`,
path, user, workspace, model, and conversation ID when available. The HTTP 500
response also returns the `requestId`, so it can be matched to the log file.

## Setup

```bash
cd apps/agents
uv sync --extra dev
cp .env.example .env
```

For Logfire observability:

```bash
uv sync --extra dev --extra observability
```

## CLI

The CLI uses the same Astra runtime as the FastAPI server.

```bash
uv run astra "Research the current state of AI agent evaluation"
```

## Server

```bash
uv run astra-server
```

Equivalent:

```bash
uv run uvicorn astra.server:app --host 127.0.0.1 --port 8001
```

### `POST /internal/chat`

Headers:

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer <ASTRA_INTERNAL_TOKEN>` |
| `x-astra-user-id` | No | Caller user ID forwarded into `AstraDeps` |
| `x-astra-workspace` | No | Workspace forwarded into `AstraDeps` |
| `x-astra-model` | No | Per-request model override |

The endpoint extracts the Vercel AI request `id` as `conversation_id`, but does
not change the request body before dispatching to `VercelAIAdapter`.

## Local Artifacts

Astra can save optional local research artifacts under `.astra/`. This directory
is ignored by git and is not part of the API/web contract. The streamed chat
response remains the user-facing source of truth.

## Verification

```bash
uv run pytest
uv run ruff check .
uv run pyright
PYTHONPATH=src .venv/bin/python -m compileall src tests
```
