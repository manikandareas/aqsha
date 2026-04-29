# Astra Agents

`apps/agents` is the Python home for Astra, a Pydantic AI multi-agent boilerplate using a DeepAgent-style pattern: one orchestrator keeps control, delegates work to specialist agents through tools, and returns a structured execution brief.

## Structure

```text
apps/agents
├── pyproject.toml
├── src/astra
│   ├── __init__.py
│   ├── __main__.py
│   ├── cli.py
│   ├── deps.py
│   ├── settings.py
│   ├── types.py
│   └── agents
│       ├── __init__.py
│       ├── architect.py
│       ├── orchestrator.py
│       ├── researcher.py
│       └── reviewer.py
└── tests
    └── test_orchestrator.py
```

## Setup

```bash
cd apps/agents
uv sync --extra dev
cp .env.example .env
```

Set `ASTRA_MODEL` to any provider-prefixed Pydantic AI model string, for example `openai:gpt-5.2`, `anthropic:claude-sonnet-4-6`, or `google-gla:gemini-3-pro-preview`.

Provider API keys can also live in `.env`, for example `OPENAI_API_KEY=...`. The CLI loads `.env` before constructing the model provider.

## Run

```bash
uv run astra "Design a multi-agent research workflow for Aqsha"
```

## Verify

```bash
uv run ruff check .
uv run pyright
uv run pytest
```

## Pattern

Astra follows a pragmatic multi-agent split:

- `orchestrator`: owns the full task loop and final structured output.
- `researcher`: gathers facts, assumptions, and unknowns.
- `architect`: turns findings into an implementation plan.
- `reviewer`: stress-tests risks, edge cases, and validation steps.

The orchestrator delegates via Pydantic AI tools and shares usage accounting with specialist runs using `usage=ctx.usage`.
