# @aqsha/agents — Agent Notes

## Runtime
- Python 3.11+ package managed with `uv` from `apps/agents/pyproject.toml`.
- Keep this app independent from the Bun workspaces unless a caller explicitly wires it in.

## Architecture
- Package name is `astra`.
- Public imports are exported from `src/astra/__init__.py`.
- Agent construction lives in `src/astra/agents/`.
- Shared runtime dependencies live in `src/astra/deps.py`.
- Settings and environment parsing live in `src/astra/settings.py`.
- CLI entrypoint lives in `src/astra/cli.py`.

## Pydantic AI Practices
- Use provider-prefixed model strings, for example `openai:gpt-5.2`.
- Use `deps_type=AstraDeps` for shared context instead of loose globals.
- Use `@agent.tool` only when the function accepts `RunContext` as the first argument.
- Use `@agent.tool_plain` only when the function does not need `RunContext`.
- For multi-agent delegation, expose specialist agents as tools on the orchestrator and pass `usage=ctx.usage`.
- Tests should use `agent.override(model=TestModel())` or `FunctionModel`; do not call provider models in unit tests.

## Commands
```bash
uv sync --extra dev
uv run astra "Plan a launch for Aqsha"
uv run pytest
uv run ruff check .
uv run pyright
```
