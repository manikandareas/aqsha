from __future__ import annotations

import json
import logging
import subprocess
import sys
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from fastapi import Response
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pydantic_ai import Agent
from pydantic_ai.capabilities import MCP, WebSearch
from pydantic_ai.models.test import TestModel
from pydantic_ai_skills import SkillsDirectory
from starlette.responses import StreamingResponse

from astra.agents import build_astra_agent, build_astra_capabilities
from astra.artifacts import (
    ArtifactManifest,
    EvidenceLedger,
    VisualSpec,
    audit_visual_spec,
    compose_visual_markdown,
)
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


async def test_streaming_response_errors_are_logged(caplog: Any) -> None:
    from astra import server

    async def broken_stream() -> AsyncIterator[bytes]:
        yield b'{"type":"start"}\n'
        raise RuntimeError("forced stream failure")

    caplog.set_level(logging.ERROR, logger="astra.server")
    response = server.wrap_streaming_response_errors(
        StreamingResponse(broken_stream()),
        context={"request_id": "req-1", "conversation_id": "thread-1"},
    )

    try:
        async for _chunk in response.body_iterator:  # type: ignore[attr-defined]
            pass
    except RuntimeError:
        pass

    assert any(
        record.getMessage() == "Astra streaming response error"
        and getattr(record, "request_id", None) == "req-1"
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


def test_visual_spec_schema_accepts_supported_visuals() -> None:
    spec = VisualSpec.model_validate(_valid_visuals_payload())

    assert len(spec.visuals) == 3
    assert {visual.kind for visual in spec.visuals} == {
        "timeline",
        "claims_evidence",
        "research_gap_matrix",
    }


def test_visual_spec_schema_rejects_unsupported_visual() -> None:
    payload = {"visuals": [{"kind": "pie_chart", "visual_id": "bad", "title": "Bad"}]}

    try:
        VisualSpec.model_validate(payload)
    except ValidationError as error:
        assert "union_tag_invalid" in str(error)
    else:
        raise AssertionError("unsupported visual kind should fail validation")


def test_visual_audit_rejects_unknown_source_and_metric_mismatch() -> None:
    evidence = EvidenceLedger.from_raw(_valid_evidence_payload())
    bad_payload = _valid_visuals_payload()
    timeline = bad_payload["visuals"][0]
    timeline["items"][0]["source_ids"] = ["S999"]
    timeline["items"][0]["citation_count"]["value"] = 99
    spec = VisualSpec.model_validate(bad_payload)

    report = audit_visual_spec(evidence, spec)

    assert "evidence-timeline" in report.failed_visual_ids
    assert {issue.code for issue in report.issues} >= {"unknown_source", "metric_mismatch"}


def test_render_visual_artifacts_creates_manifest_svg_and_markdown(tmp_path: Path) -> None:
    evidence_path = tmp_path / "evidence.json"
    visuals_path = tmp_path / "visuals.json"
    evidence_path.write_text(json.dumps(_valid_evidence_payload()), encoding="utf-8")
    visuals_path.write_text(json.dumps(_valid_visuals_payload()), encoding="utf-8")
    script = DEFAULT_SKILLS_DIR / "deep-research" / "scripts" / "render_visual_artifacts.py"

    rendered = subprocess.run(
        [
            sys.executable,
            str(script),
            "--evidence",
            str(evidence_path),
            "--visuals",
            str(visuals_path),
            "--out-dir",
            str(tmp_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert rendered.returncode == 0
    manifest = json.loads((tmp_path / "artifact_manifest.json").read_text(encoding="utf-8"))
    assert [record["audit_status"] for record in manifest["artifacts"]] == [
        "passed",
        "passed",
        "passed",
    ]
    timeline_svg = tmp_path / "artifacts" / "evidence-timeline.svg"
    assert timeline_svg.exists()
    assert "Evidence Timeline" in timeline_svg.read_text(encoding="utf-8")
    markdown = (tmp_path / "visual_artifacts.md").read_text(encoding="utf-8")
    assert "![Evidence Timeline](artifacts/evidence-timeline.svg)" in markdown


def test_compose_visual_markdown_embeds_only_passed_artifacts() -> None:
    manifest = ArtifactManifest.model_validate(
        {
            "artifacts": [
                {
                    "visual_id": "passed",
                    "kind": "timeline",
                    "title": "Passed Timeline",
                    "caption": "Audited.",
                    "path": "artifacts/passed.svg",
                    "source_ids": ["S1"],
                    "audit_status": "passed",
                },
                {
                    "visual_id": "failed",
                    "kind": "timeline",
                    "title": "Failed Timeline",
                    "caption": "Bad.",
                    "source_ids": ["S999"],
                    "audit_status": "failed",
                    "issues": ["unknown source"],
                },
            ]
        }
    )

    markdown = compose_visual_markdown(manifest)

    assert "![Passed Timeline](artifacts/passed.svg)" in markdown
    assert "![Failed Timeline]" not in markdown
    assert "Omitted `failed`" in markdown


def test_audit_visuals_script_fails_for_invalid_visual_spec(tmp_path: Path) -> None:
    evidence_path = tmp_path / "evidence.json"
    visuals_path = tmp_path / "visuals.json"
    evidence_path.write_text(json.dumps(_valid_evidence_payload()), encoding="utf-8")
    bad_payload = _valid_visuals_payload()
    bad_payload["visuals"][2]["cells"][0]["source_ids"] = ["S404"]
    visuals_path.write_text(json.dumps(bad_payload), encoding="utf-8")
    script = DEFAULT_SKILLS_DIR / "deep-research" / "scripts" / "audit_visuals.py"

    audited = subprocess.run(
        [
            sys.executable,
            str(script),
            "--evidence",
            str(evidence_path),
            "--visuals",
            str(visuals_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert audited.returncode == 1
    assert "unknown_source" in audited.stdout


def _valid_evidence_payload() -> dict[str, Any]:
    return {
        "sources": [
            {
                "source_id": "S1",
                "title": "Trial One",
                "authors_or_organization": "Research Team",
                "year": 2024,
                "date_published": "2024-01-01",
                "source_type": "randomized trial",
                "journal_or_publisher": "Journal A",
                "topics": ["weight loss"],
                "verification_status": "verified",
            },
            {
                "source_id": "S2",
                "title": "Review Two",
                "authors_or_organization": "Review Group",
                "year": 2025,
                "date_published": "2025-02-01",
                "source_type": "systematic review",
                "journal_or_publisher": "Journal B",
                "topics": ["glycemic control"],
                "verification_status": "verified",
            },
        ],
        "claims": [
            {
                "claim_id": "C1",
                "claim_text": "Intervention improves outcomes versus no intervention.",
                "supporting_sources": ["S1", "S2"],
                "counterevidence": [],
                "evidence_strength": "high",
                "confidence": "high",
                "verification_status": "verified",
            }
        ],
        "visual_metrics": [
            {"metric_id": "citations-s1", "value": 9, "source_ids": ["S1"]},
            {"metric_id": "citations-s2", "value": 4, "source_ids": ["S2"]},
            {"metric_id": "gap-weight-loss-rct", "value": 2, "source_ids": ["S1", "S2"]},
        ],
    }


def _valid_visuals_payload() -> dict[str, Any]:
    return {
        "visuals": [
            {
                "visual_id": "evidence-timeline",
                "kind": "timeline",
                "title": "Evidence Timeline",
                "caption": "Timeline of verified included sources.",
                "source_ids": ["S1", "S2"],
                "items": [
                    {
                        "label": "S1",
                        "year": 2024,
                        "source_ids": ["S1"],
                        "citation_count": {"metric_id": "citations-s1", "value": 9},
                    },
                    {
                        "label": "S2",
                        "year": 2025,
                        "source_ids": ["S2"],
                        "citation_count": {"metric_id": "citations-s2", "value": 4},
                    },
                ],
            },
            {
                "visual_id": "claims-evidence",
                "kind": "claims_evidence",
                "title": "Claims Evidence",
                "caption": "Audited claims and supporting source IDs.",
                "source_ids": ["S1", "S2"],
                "rows": [
                    {
                        "claim_id": "C1",
                        "claim": "Intervention improves outcomes versus no intervention.",
                        "evidence_strength": "high",
                        "reasoning": "Supported by verified included sources.",
                        "supporting_sources": ["S1", "S2"],
                        "counterevidence": [],
                    }
                ],
            },
            {
                "visual_id": "research-gaps",
                "kind": "research_gap_matrix",
                "title": "Research Gaps",
                "caption": "Matrix of evidence density by topic and design.",
                "source_ids": ["S1", "S2"],
                "rows": ["Weight Loss"],
                "columns": ["RCT"],
                "cells": [
                    {
                        "row_label": "Weight Loss",
                        "column_label": "RCT",
                        "value": {"metric_id": "gap-weight-loss-rct", "value": 2},
                        "source_ids": ["S1", "S2"],
                    }
                ],
            },
        ]
    }
