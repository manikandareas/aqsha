from __future__ import annotations

import re
from typing import Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.capabilities import MCP, Thinking, WebFetch, WebSearch
from pydantic_ai.models import KnownModelName, Model

from astra.deps import AstraDeps
from astra.settings import AstraSettings
from astra.skills import build_skills_capability

ASTRA_INSTRUCTIONS = """\
You are Astra, Aqsha's primary AI agent.

You are the single public agent surface for chat, planning, and research. Keep the
conversation useful and direct. For normal questions, answer plainly without forcing
a research workflow.

For research-heavy requests such as academic research, literature review, technical
research, market analysis, competitive analysis, policy/regulatory analysis, or any
source-grounded report, you must use the deep-research skill:
1. Call load_skill("deep-research") before doing the research work.
2. Follow the skill's progressive workflow: scope, search strategy, source discovery,
   screening, extraction, synthesis, PROCEED/REFINE/PIVOT, verification, and final report.
3. Use stable citation IDs like [S1], [S2], and [S3].
4. Separate evidence from inference.
5. Label uncertainty and contradictory evidence.
6. Never fabricate sources, citations, papers, links, datasets, quotes, or numeric results.

When tools are available, prefer source discovery through Exa MCP or provider web
search, then fetch important URLs before using them as evidence. Direct web snippets
are not enough for high-confidence claims.

If a request needs human judgment, scope confirmation, or a PIVOT decision, ask for
that confirmation instead of pretending the evidence is settled.
"""

_SAFE_ARTIFACT_NAME_RE = re.compile(r"[^a-zA-Z0-9._-]+")


def build_astra_capabilities(settings: AstraSettings) -> list[Any]:
    """Build Astra capabilities from runtime settings."""

    capabilities: list[Any] = [
        Thinking(settings.thinking_effort),
        build_skills_capability(),
    ]

    if settings.enable_web_fetch:
        capabilities.append(
            WebFetch(
                builtin=True,
                local=None,
                enable_citations=True,
                max_content_tokens=settings.web_fetch_max_content_tokens,
            )
        )

    if settings.enable_provider_web_search:
        capabilities.append(
            WebSearch(
                builtin=True,
                local=False,
                search_context_size=settings.provider_web_search_context_size,
                max_uses=settings.provider_web_search_max_uses,
            )
        )

    exa_headers: dict[str, str] = {}
    if settings.exa_api_key:
        exa_headers["x-api-key"] = settings.exa_api_key

    if settings.exa_api_key or settings.exa_mcp_authorization_token:
        capabilities.append(
            MCP(
                settings.exa_mcp_url,
                headers=exa_headers or None,
                authorization_token=settings.exa_mcp_authorization_token or None,
                allowed_tools=["web_search_exa", "web_fetch_exa"],
                description="Exa MCP tools for source discovery and source fetching.",
            )
        )

    return capabilities


def build_astra_agent(
    model: Model | KnownModelName | str = "openai:gpt-5.2",
    *,
    settings: AstraSettings | None = None,
) -> Agent[AstraDeps, str]:
    """Build Astra as the single public chat-compatible agent."""

    runtime_settings = settings or AstraSettings()
    agent = Agent(
        model,
        deps_type=AstraDeps,
        output_type=str,
        defer_model_check=True,
        instructions=ASTRA_INSTRUCTIONS,
        capabilities=build_astra_capabilities(runtime_settings),
    )

    @agent.instructions
    def add_runtime_context(ctx: RunContext[AstraDeps]) -> str:
        return f"Runtime context: {ctx.deps.describe()}"

    @agent.tool(requires_approval=True)
    async def save_research_artifact(
        ctx: RunContext[AstraDeps],
        file_name: str,
        content: str,
    ) -> str:
        """Save optional local research notes or evidence ledgers for the current conversation."""

        artifact_dir = ctx.deps.research_artifact_dir
        if artifact_dir is None:
            return "Research artifact storage is not configured."

        conversation_id = ctx.deps.conversation_id or "local"
        safe_conversation_id = _sanitize_path_segment(conversation_id)
        safe_file_name = _sanitize_path_segment(file_name)
        if not safe_file_name.endswith((".md", ".json", ".txt")):
            safe_file_name = f"{safe_file_name}.md"

        target_dir = artifact_dir / safe_conversation_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / safe_file_name
        target_path.write_text(content, encoding="utf-8")

        return f"Saved research artifact to {target_path}"

    return agent


def _sanitize_path_segment(value: str) -> str:
    sanitized = _SAFE_ARTIFACT_NAME_RE.sub("-", value.strip()).strip(".-")
    return sanitized[:120] or "artifact"


astra_agent = build_astra_agent()
