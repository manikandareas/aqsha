from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("agent_server_main", ROOT / "main.py")
assert spec is not None
assert spec.loader is not None
main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main)


def agent_request_payload() -> dict[str, Any]:
    return {
        "threadId": "thread-1",
        "runId": "run-1",
        "state": {},
        "messages": [{"id": "msg-1", "role": "user", "content": "hello"}],
        "tools": [],
        "context": [],
        "forwardedProps": {},
    }


def post_agent_request() -> Any:
    return TestClient(main.app).post("/", json=agent_request_payload())


def test_agui_endpoint_streams_progress_state_and_text(monkeypatch) -> None:
    def fake_run_flow_stream(
        inputs: dict[str, Any] | None = None,
        event_sink=None,
        chunk_sink=None,
    ) -> dict[str, str]:
        assert inputs is not None
        assert inputs["user_message"] == "hello"
        event_sink(
            {
                "type": "router.started",
                "status": "running",
                "title": "Routing message",
                "data": {"message": "hello"},
            }
        )
        chunk_sink(
            {
                "content": "Hello",
                "chunk_type": "text",
                "task_name": "chat",
                "agent_role": "assistant",
            }
        )
        event_sink(
            {
                "type": "assistant.message.completed",
                "status": "completed",
                "title": "Assistant message ready",
                "data": {"content": "Hello there", "chat_response": "Hello there"},
            }
        )
        return {"chat_response": "Hello there"}

    monkeypatch.setattr(main, "run_flow_stream", fake_run_flow_stream)

    response = post_agent_request()

    body = response.text
    assert response.status_code == 200
    assert '"type":"RUN_STARTED"' in body
    assert '"type":"TEXT_MESSAGE_CONTENT"' in body
    assert '"delta":"Hello"' in body
    assert '"type":"STATE_SNAPSHOT"' in body
    assert '"phase":"routing"' in body
    assert '"status":"completed"' in body

def test_agui_endpoint_closes_text_message_before_run_error(monkeypatch) -> None:
    def fake_run_flow_stream(
        inputs: dict[str, Any] | None = None,
        event_sink=None,
        chunk_sink=None,
    ) -> dict[str, str]:
        event_sink(
            {
                "type": "router.started",
                "status": "running",
                "title": "Routing message",
                "data": {},
            }
        )
        raise RuntimeError("boom")

    monkeypatch.setattr(main, "run_flow_stream", fake_run_flow_stream)

    response = post_agent_request()

    body = response.text
    text_end_index = body.index('"type":"TEXT_MESSAGE_END"')
    run_error_index = body.index('"type":"RUN_ERROR"')

    assert response.status_code == 200
    assert text_end_index < run_error_index
    assert '"message":"boom"' in body
