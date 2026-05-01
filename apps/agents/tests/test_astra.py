from __future__ import annotations

import json
import logging
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import Response
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.capabilities import MCP, WebSearch
from pydantic_ai.models.test import TestModel
from pydantic_ai_skills import SkillsDirectory

from astra.agents import build_astra_agent, build_astra_capabilities
from astra.deps import AstraDeps
from astra.log_config import configure_file_logging
from astra.settings import AstraSettings
from astra.skills import DEFAULT_SKILLS_DIR, build_skills_capability


def make_settings(**overrides: Any) -> AstraSettings:
    values: dict[str, Any] = {
        "model": "openai:gpt-5.2",
        "user_id": "test-user",
        "workspace": "test-workspace",
        "enable_logfire": False,
        "http_host": "127.0.0.1",
        "http_port": 8001,
        "internal_token": "test-token",
        "exa_mcp_url": "https://mcp.exa.ai/mcp",
        "exa_api_key": "",
        "exa_mcp_authorization_token": "",
        "enable_provider_web_search": False,
        "provider_web_search_context_size": "medium",
        "provider_web_search_max_uses": 5,
        "enable_web_fetch": False,
        "web_fetch_max_content_tokens": 12_000,
        "thinking_effort": "medium",
        "research_artifact_dir": ".astra/research",
    }
    values.update(overrides)
    return AstraSettings(**values)


async def test_astra_returns_chat_compatible_text() -> None:
    agent = build_astra_agent(
        TestModel(call_tools=[], custom_output_text="Astra response"),
        settings=make_settings(),
    )
    deps = AstraDeps(user_id="test-user", workspace="test-workspace")

    result = await agent.run("Create a launch plan", deps=deps)

    assert result.output == "Astra response"


async def test_astra_runs_with_skills_capability() -> None:
    agent = Agent(
        TestModel(call_tools=[]),
        instructions="Use available skills when relevant.",
        capabilities=[build_skills_capability()],
    )
    result = await agent.run("Confirm skills are available.")

    assert isinstance(result.output, str)


def test_deep_research_skill_is_discoverable() -> None:
    skills = SkillsDirectory(path=DEFAULT_SKILLS_DIR).skills

    assert any(skill.name == "deep-research" for skill in skills.values())


def test_exa_mcp_capability_requires_auth() -> None:
    without_key = build_astra_capabilities(make_settings(exa_api_key=""))
    with_key = build_astra_capabilities(make_settings(exa_api_key="test-exa-key"))

    assert not any(isinstance(capability, MCP) for capability in without_key)
    assert any(isinstance(capability, MCP) for capability in with_key)


def test_provider_web_search_is_opt_in() -> None:
    disabled = build_astra_capabilities(make_settings(enable_provider_web_search=False))
    enabled = build_astra_capabilities(make_settings(enable_provider_web_search=True))

    assert not any(isinstance(capability, WebSearch) for capability in disabled)
    assert any(isinstance(capability, WebSearch) for capability in enabled)


def test_internal_chat_rejects_invalid_bearer_token(monkeypatch: Any) -> None:
    from astra import server

    monkeypatch.setattr(server.settings, "internal_token", "test-token")
    client = TestClient(server.app)

    response = client.post("/internal/chat", json={"id": "thread-1", "messages": []})

    assert response.status_code == 401


def test_internal_chat_dispatches_astra_with_conversation_context(monkeypatch: Any) -> None:
    from astra import server

    captured: dict[str, Any] = {}

    async def fake_dispatch_request(request: Any, **kwargs: Any) -> Response:
        captured["request_body"] = await request.json()
        captured.update(kwargs)
        return Response("ok")

    monkeypatch.setattr(server.settings, "internal_token", "test-token")
    monkeypatch.setattr(server.VercelAIAdapter, "dispatch_request", fake_dispatch_request)

    client = TestClient(server.app)
    response = client.post(
        "/internal/chat",
        headers={
            "Authorization": "Bearer test-token",
            "x-astra-user-id": "user-1",
            "x-astra-workspace": "workspace-1",
            "x-astra-model": "openai:gpt-5.2",
        },
        json={"id": "thread-1", "messages": []},
    )

    assert response.status_code == 200
    assert captured["agent"] is server.astra_agent
    assert captured["sdk_version"] == 6
    assert captured["model"] == "openai:gpt-5.2"
    assert captured["manage_system_prompt"] == "server"
    assert captured["request_body"]["id"] == "thread-1"

    deps = captured["deps"]
    assert isinstance(deps, AstraDeps)
    assert deps.user_id == "user-1"
    assert deps.workspace == "workspace-1"
    assert deps.conversation_id == "thread-1"
    assert deps.research_artifact_dir == server.settings.resolved_research_artifact_dir()


def test_file_logging_writes_jsonl(tmp_path: Path) -> None:
    settings = make_settings(
        enable_file_logging=True,
        log_dir=tmp_path.as_posix(),
        log_file_name="astra-test.log",
    )

    log_path = configure_file_logging(settings)
    assert log_path is not None
    assert log_path == tmp_path / "astra-test.log"

    logging.getLogger("astra.tests").error(
        "Forced test error",
        extra={"conversation_id": "thread-1"},
    )
    for handler in logging.getLogger().handlers:
        handler.flush()

    log_content = log_path.read_text(encoding="utf-8")

    assert "Forced test error" in log_content
    assert '"conversation_id": "thread-1"' in log_content


def test_internal_chat_logs_unhandled_dispatch_errors(
    monkeypatch: Any,
    caplog: Any,
) -> None:
    from astra import server

    async def fake_dispatch_request(_request: Any, **_kwargs: Any) -> Response:
        raise RuntimeError("forced dispatch failure")

    caplog.set_level(logging.ERROR, logger="astra.server")
    monkeypatch.setattr(server.settings, "internal_token", "test-token")
    monkeypatch.setattr(server.VercelAIAdapter, "dispatch_request", fake_dispatch_request)

    client = TestClient(server.app)
    response = client.post(
        "/internal/chat",
        headers={"Authorization": "Bearer test-token"},
        json={"id": "thread-1", "messages": []},
    )

    body = response.json()

    assert response.status_code == 500
    assert body["error"]["code"] == "agents_service_error"
    assert body["error"]["requestId"]
    assert any(
        record.getMessage() == "Unhandled agents request error"
        and getattr(record, "conversation_id", None) == "thread-1"
        for record in caplog.records
    )


def test_audit_evidence_script_passes_and_fails(tmp_path: Path) -> None:
    script = DEFAULT_SKILLS_DIR / "deep-research" / "scripts" / "audit_evidence.py"
    report = tmp_path / "report.md"
    evidence = tmp_path / "evidence.json"

    report.write_text("Supported claim [S1].", encoding="utf-8")
    evidence.write_text(
        json.dumps(
            {
                "sources": [
                    {
                        "source_id": "S1",
                        "title": "Source One",
                        "source_type": "official",
                        "quality_tier": "A",
                        "url": "https://example.com/source-one",
                        "verification_status": "verified",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    passed = subprocess.run(
        [sys.executable, str(script), str(report), str(evidence)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert passed.returncode == 0

    report.write_text("Unsupported claim [S2].", encoding="utf-8")
    failed = subprocess.run(
        [sys.executable, str(script), str(report), str(evidence)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert failed.returncode == 1
    assert "unknown_citations" in failed.stdout

    report.write_text("Supported claim [S1].", encoding="utf-8")
    named_args = subprocess.run(
        [
            sys.executable,
            str(script),
            "--report",
            str(report),
            "--evidence",
            str(evidence),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert named_args.returncode == 0
