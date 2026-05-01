from __future__ import annotations

import asyncio
import base64
import binascii
import re
import sys
from pathlib import Path
from typing import Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.capabilities import MCP, Thinking, WebFetch, WebSearch
from pydantic_ai.models import KnownModelName, Model

from astra.deps import AstraDeps
from astra.settings import AstraSettings
from astra.skills import build_skills_capability

APP_ROOT = Path(__file__).resolve().parents[3]
DEEP_RESEARCH_RENDER_SCRIPT = (
    APP_ROOT / "skills" / "deep-research" / "scripts" / "render_visual_artifacts.py"
)
ARTIFACT_FILE_SUFFIXES = (".md", ".json", ".txt", ".svg", ".html", ".png")
RENDER_TIMEOUT_SECONDS = 30
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
7. For every deep-research output, try to create visual artifact specs from the
   verified evidence ledger when data is sufficient. Use trusted render scripts,
   embed only audited artifacts, and omit visuals when provenance is incomplete.

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
        if not safe_file_name.endswith(ARTIFACT_FILE_SUFFIXES):
            safe_file_name = f"{safe_file_name}.md"

        target_dir = artifact_dir / safe_conversation_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / safe_file_name
        write_error = _write_artifact_content(target_path, content)
        if write_error is not None:
            return write_error

        return f"Saved research artifact to {target_path}"

    @agent.tool(requires_approval=True)
    async def render_research_artifacts(
        ctx: RunContext[AstraDeps],
        evidence_file: str = "evidence.json",
        visuals_file: str = "visuals.json",
    ) -> str:
        """Render audited visual artifacts from local evidence and visual spec files."""

        artifact_dir = ctx.deps.research_artifact_dir
        if artifact_dir is None:
            return "Research artifact storage is not configured."

        target_dir = _conversation_artifact_dir(ctx.deps)
        evidence_path = _resolve_artifact_path(target_dir, evidence_file)
        visuals_path = _resolve_artifact_path(target_dir, visuals_file)

        if evidence_path is None or visuals_path is None:
            return (
                "Evidence and visuals file names must stay within the "
                "conversation artifact directory."
            )
        if not evidence_path.exists():
            return f"Evidence file not found: {evidence_path}"
        if not visuals_path.exists():
            return f"Visual spec file not found: {visuals_path}"

        process = await asyncio.create_subprocess_exec(
            sys.executable,
            str(DEEP_RESEARCH_RENDER_SCRIPT),
            "--evidence",
            str(evidence_path),
            "--visuals",
            str(visuals_path),
            "--out-dir",
            str(target_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=RENDER_TIMEOUT_SECONDS,
            )
        except TimeoutError:
            process.kill()
            await process.communicate()
            return "Visual artifact rendering timed out."

        if process.returncode != 0:
            details = stderr.decode("utf-8", errors="replace").strip()
            return f"Visual artifact rendering failed: {details or 'unknown error'}"

        manifest_path = target_dir / "artifact_manifest.json"
        markdown_path = target_dir / "visual_artifacts.md"
        stdout_text = stdout.decode("utf-8", errors="replace").strip()
        return (
            f"Rendered visual artifacts in {target_dir}. "
            f"Manifest: {manifest_path}. Markdown snippet: {markdown_path}. "
            f"Renderer output: {stdout_text[:1000]}"
        )

    return agent


def _sanitize_path_segment(value: str) -> str:
    sanitized = _SAFE_ARTIFACT_NAME_RE.sub("-", value.strip()).strip(".-")
    return sanitized[:120] or "artifact"


def _conversation_artifact_dir(deps: AstraDeps) -> Path:
    artifact_dir = deps.research_artifact_dir
    if artifact_dir is None:
        raise ValueError("Research artifact storage is not configured.")
    conversation_id = deps.conversation_id or "local"
    return artifact_dir / _sanitize_path_segment(conversation_id)


def _write_artifact_content(target_path: Path, content: str) -> str | None:
    if target_path.suffix != ".png":
        target_path.write_text(content, encoding="utf-8")
        return None

    try:
        target_path.write_bytes(base64.b64decode(content, validate=True))
    except binascii.Error:
        return "PNG artifact content must be base64-encoded."
    return None


def _resolve_artifact_path(base_dir: Path, file_name: str) -> Path | None:
    safe_name = file_name.strip()
    if not safe_name:
        return None
    candidate = (base_dir / safe_name).resolve()
    resolved_base = base_dir.resolve()
    try:
        candidate.relative_to(resolved_base)
    except ValueError:
        return None
    return candidate


astra_agent = build_astra_agent()
