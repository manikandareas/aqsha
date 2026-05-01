# @aqsha/agents — Agent Notes

## Runtime
- Python 3.11+ package managed with `uv` from `apps/agents/pyproject.toml`.
- Keep this app independent from the Bun workspaces unless a caller explicitly wires it in.

## Architecture
- Package name is `astra`.
- Public imports are exported from `src/astra/__init__.py`.
- Astra is the only public agent. Agent construction lives in `src/astra/agents/astra.py`.
- Shared runtime dependencies live in `src/astra/deps.py`.
- Agent Skills capability construction lives in `src/astra/skills.py`.
- Repo-local Agent Skills live in `skills/`; each skill must be a trusted directory with `SKILL.md`.
- Settings and environment parsing live in `src/astra/settings.py`.
- CLI entrypoint lives in `src/astra/cli.py`.
- FastAPI keeps the existing `/internal/chat` contract and dispatches to Astra via `VercelAIAdapter`.
- Keep this app standalone. Do not add `apps/api`, `apps/web`, or database integration unless explicitly requested.
- File logging is configured by `src/astra/log_config.py` and defaults to `.astra/logs/astra.log`.

## Pydantic AI Practices
- Use provider-prefixed model strings, for example `openai:gpt-5.2`.
- Use `deps_type=AstraDeps` for shared context instead of loose globals.
- Attach Agent Skills with `build_skills_capability()` from `src/astra/skills.py`; do not configure separate skill directories in individual agents.
- Attach Exa MCP only through Astra capability settings and expose only `web_search_exa` and `web_fetch_exa`.
- Keep provider-native web search opt-in via settings because model/provider support varies.
- Use `@agent.tool` only when the function accepts `RunContext` as the first argument.
- Use `@agent.tool_plain` only when the function does not need `RunContext`.
- Do not reintroduce public specialist agents for research, architecture, or review. Model those behaviors through Astra instructions, tools, and skills.
- Tests should use `agent.override(model=TestModel())` or `FunctionModel`; do not call provider models in unit tests.
- When adding new request handlers or background work, log unhandled exceptions with context but never include secrets, bearer tokens, or full chat bodies.

## Agent Skills
- Use `pydantic-ai-skills` `SkillsCapability`; the installed Pydantic AI version supports capabilities.
- Skills use progressive disclosure: metadata is added to agent context first, then agents can call `load_skill`, `read_skill_resource`, or `run_skill_script`.
- Treat skill scripts as executable code. Only commit or load trusted skills, and review scripts before making them available to agents.
- The default research skill is `skills/deep-research`. Astra must load it for source-grounded research, literature review, market analysis, policy/regulatory research, competitive analysis, and evidence synthesis.
- Deep research reports should create visual artifact specs whenever the evidence ledger has enough structured data. Use trusted local skill scripts to render/audit artifacts; do not generate arbitrary plotting code in v1.

## Commands
```bash
uv sync --extra dev
uv run astra "Research the current state of AI agent evaluation"
uv run pytest
uv run ruff check .
uv run pyright
```
