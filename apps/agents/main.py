from __future__ import annotations

import asyncio
import os
import uuid
from typing import Any

import uvicorn
from ag_ui.core import RunAgentInput
from ag_ui.core.events import (
    CustomEvent,
    EventType,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StateSnapshotEvent,
    StepFinishedEvent,
    StepStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)
from ag_ui.encoder import EventEncoder
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from deep_research_agent.crewai_event_listener import install_agent_event_listener
from deep_research_agent.main import normalize_flow_inputs, run_flow_stream
from deep_research_agent.persistence import (
    agent_persistence_context,
    create_agent_persistence,
    json_safe,
)

load_dotenv()
install_agent_event_listener()

app = FastAPI()
MAX_PROGRESS_ITEMS = 80
AGENT_STEP_NAME = "DeepResearch"
STREAM_TIMEOUT_SECONDS = 0.25


def _initial_progress_state() -> dict[str, Any]:
    return {
        "status": "running",
        "phase": "starting",
        "currentStep": "Starting deep research",
        "events": [],
        "streamChunks": [],
        "streamedResponse": "",
        "response": None,
        "chat_response": None,
        "suggested_search_queries": [],
        "search_queries": [],
    }


def _message_content(message: Any) -> str:
    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            text = getattr(item, "text", None)
            if isinstance(text, str):
                parts.append(text)
        return "\n".join(parts)
    return ""


def _serialize_chat_messages(input_data: RunAgentInput) -> list[dict[str, Any]]:
    return [
        message.model_dump(mode="json", by_alias=True, exclude_none=True)
        for message in input_data.messages
        if getattr(message, "role", None) in {"user", "assistant"}
    ]


def _copilotkit_actions(input_data: RunAgentInput) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": tool.model_dump(
                mode="json",
                by_alias=True,
                exclude_none=True,
            ),
        }
        for tool in input_data.tools
    ]


def _latest_user_message(input_data: RunAgentInput) -> str | None:
    for message in reversed(input_data.messages):
        if getattr(message, "role", None) != "user":
            continue

        content = _message_content(message)
        if content:
            return content

    return None


def _prepare_inputs(input_data: RunAgentInput) -> dict[str, Any]:
    state = input_data.state if isinstance(input_data.state, dict) else {}
    inputs = normalize_flow_inputs(
        {
            **state,
            "id": input_data.thread_id,
            "messages": _serialize_chat_messages(input_data),
            "copilotkit": {"actions": _copilotkit_actions(input_data)},
        }
    )

    user_message = _latest_user_message(input_data)
    if "user_message" not in inputs and user_message:
        inputs["user_message"] = user_message

    return inputs

def _extract_request_ids(input_data: RunAgentInput) -> tuple[str | None, str | None]:
    state = input_data.state if isinstance(input_data.state, dict) else {}
    forwarded_props = (
        input_data.forwarded_props
        if isinstance(input_data.forwarded_props, dict)
        else {}
    )

    user_id = _first_metadata_value(
        [state, forwarded_props],
        ["user_id", "userId", "user.id"],
    )
    workspace_id = _first_metadata_value(
        [state, forwarded_props],
        ["workspace_id", "workspaceId", "workspace.id"],
    )

    return user_id, workspace_id

def _first_metadata_value(
    sources: list[dict[str, Any]],
    keys: list[str],
) -> str | None:
    for source in sources:
        for key in keys:
            value = _metadata_value(source, key)
            if isinstance(value, str) and value:
                return value
    return None

def _metadata_value(source: dict[str, Any], key: str) -> Any:
    current: Any = source
    for part in key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current

def _request_payload(input_data: RunAgentInput, inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "threadId": input_data.thread_id,
        "runId": input_data.run_id,
        "parentRunId": input_data.parent_run_id,
        "state": json_safe(input_data.state),
        "messages": _serialize_chat_messages(input_data),
        "toolCount": len(input_data.tools),
        "context": json_safe(input_data.context),
        "forwardedProps": json_safe(input_data.forwarded_props),
        "normalizedInputs": json_safe(inputs),
    }


def _encode_state(encoder: EventEncoder, progress_state: dict[str, Any]) -> str:
    return encoder.encode(
        StateSnapshotEvent(type=EventType.STATE_SNAPSHOT, snapshot=progress_state)
    )


def _encode_text_delta(
    encoder: EventEncoder,
    *,
    message_id: str,
    delta: str,
) -> str:
    return encoder.encode(
        TextMessageContentEvent(
            type=EventType.TEXT_MESSAGE_CONTENT,
            message_id=message_id,
            delta=delta,
        )
    )


def _encode_text_end(encoder: EventEncoder, message_id: str) -> str:
    return encoder.encode(
        TextMessageEndEvent(
            type=EventType.TEXT_MESSAGE_END,
            message_id=message_id,
        )
    )


@app.post("/")
async def agentic_chat_endpoint(input_data: RunAgentInput, request: Request):
    encoder = EventEncoder(accept=request.headers.get("accept"))

    async def stream():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[Any] = asyncio.Queue()
        message_id = str(uuid.uuid4())
        progress_state = _initial_progress_state()
        inputs = _prepare_inputs(input_data)
        if inputs.get("userId"):
            progress_state["userId"] = inputs["userId"]
        if inputs.get("workspaceId"):
            progress_state["workspaceId"] = inputs["workspaceId"]
        user_id, workspace_id = _extract_request_ids(input_data)
        persistence = create_agent_persistence(
            thread_id=input_data.thread_id,
            run_id=input_data.run_id,
            user_id=user_id,
            workspace_id=workspace_id,
        )

        def put(item: Any) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, item)

        def event_sink(event: dict[str, Any]) -> None:
            persistence.record_event(event, source="flow")
            if event.get("visibility") == "internal":
                return
            put({"kind": "flow_event", "event": event})

        def chunk_sink(chunk: dict[str, Any]) -> None:
            persistence.record_chunk(chunk)
            put({"kind": "flow_chunk", "chunk": chunk})

        def run_agent() -> Any:
            with agent_persistence_context(persistence):
                return run_flow_stream(
                    inputs,
                    event_sink=event_sink,
                    chunk_sink=chunk_sink,
                )

        try:
            yield encoder.encode(
                RunStartedEvent(
                    type=EventType.RUN_STARTED,
                    thread_id=input_data.thread_id,
                    run_id=input_data.run_id,
                )
            )
            yield encoder.encode(
                StepStartedEvent(type=EventType.STEP_STARTED, step_name=AGENT_STEP_NAME)
            )
            yield encoder.encode(
                TextMessageStartEvent(
                    type=EventType.TEXT_MESSAGE_START,
                    message_id=message_id,
                    role="assistant",
                )
            )
            yield _encode_state(encoder, progress_state)

            persistence.start(
                user_message=str(inputs.get("user_message") or ""),
                depth_mode=str(inputs.get("depth_mode") or "standard"),
                request_payload=_request_payload(input_data, inputs),
            )
            task = asyncio.create_task(asyncio.to_thread(run_agent))

            while not task.done():
                try:
                    item = await asyncio.wait_for(
                        queue.get(),
                        timeout=STREAM_TIMEOUT_SECONDS,
                    )
                except asyncio.TimeoutError:
                    continue
                for encoded_event in _encode_stream_item(
                    encoder=encoder,
                    item=item,
                    progress_state=progress_state,
                    message_id=message_id,
                ):
                    yield encoded_event

            while not queue.empty():
                for encoded_event in _encode_stream_item(
                    encoder=encoder,
                    item=queue.get_nowait(),
                    progress_state=progress_state,
                    message_id=message_id,
                ):
                    yield encoded_event

            result = task.result()
            text = ""
            if isinstance(result, dict):
                text = str(result.get("response") or result.get("chat_response") or "")
                progress_state.update(
                    {
                        key: value
                        for key, value in result.items()
                        if key in {"response", "chat_response"}
                    }
                )
            elif result is not None:
                text = str(result)

            if text:
                streamed_response = str(progress_state.get("streamedResponse") or "")
                if not streamed_response or text not in streamed_response:
                    yield _encode_text_delta(encoder, message_id=message_id, delta=text)
                progress_state["response"] = text
                progress_state["messages"] = [
                    *_serialize_chat_messages(input_data),
                    {"id": message_id, "role": "assistant", "content": text},
                ]

            persistence.complete(result, assistant_message=text or None)
            progress_state["status"] = "completed"
            progress_state["phase"] = "completed"
            progress_state["currentStep"] = "Research completed"
            yield _encode_text_end(encoder, message_id)
            yield _encode_state(encoder, progress_state)
            yield encoder.encode(
                StepFinishedEvent(
                    type=EventType.STEP_FINISHED,
                    step_name=AGENT_STEP_NAME,
                )
            )
            yield encoder.encode(
                RunFinishedEvent(
                    type=EventType.RUN_FINISHED,
                    thread_id=input_data.thread_id,
                    run_id=input_data.run_id,
                    result=result,
                )
            )
        except Exception as error:
            try:
                persistence.fail(error)
            except Exception:
                pass
            progress_state["status"] = "failed"
            progress_state["phase"] = "failed"
            progress_state["currentStep"] = "Research failed"
            progress_state["response"] = str(error)
            yield _encode_text_delta(
                encoder,
                message_id=message_id,
                delta=str(error),
            )
            yield _encode_text_end(encoder, message_id)
            yield _encode_state(encoder, progress_state)
            yield encoder.encode(
                RunErrorEvent(
                    type=EventType.RUN_ERROR,
                    message=str(error),
                    code=error.__class__.__name__,
                )
            )
        finally:
            persistence.close()

    return StreamingResponse(stream(), media_type=encoder.get_content_type())


def _encode_stream_item(
    *,
    encoder: EventEncoder,
    item: dict[str, Any],
    progress_state: dict[str, Any],
    message_id: str,
) -> list[str]:
    kind = item.get("kind")
    if kind == "flow_event":
        event = item["event"]
        if event.get("visibility") == "internal":
            return []
        _apply_flow_event(progress_state, event)
        return [
            encoder.encode(
                CustomEvent(
                    type=EventType.CUSTOM,
                    name=event["type"],
                    value=event,
                )
            ),
            _encode_state(encoder, progress_state),
        ]

    if kind == "flow_chunk":
        chunk = item["chunk"]
        content = str(chunk.get("content") or "")
        if not content:
            return []

        _apply_flow_chunk(progress_state, chunk)
        return [
            _encode_text_delta(
                encoder,
                message_id=message_id,
                delta=content,
            ),
            _encode_state(encoder, progress_state),
        ]

    return []


def _apply_flow_event(progress_state: dict[str, Any], event: dict[str, Any]) -> None:
    event_type = str(event.get("type", "event"))
    status = str(event.get("status", "running"))
    title = str(event.get("title") or event_type)
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    progress_state["currentStep"] = title
    progress_state["phase"] = _phase_from_event_type(event_type)
    if status == "failed":
        progress_state["status"] = "failed"
    elif progress_state.get("status") != "failed":
        progress_state["status"] = "running"

    if "searchQueries" in data:
        progress_state["suggested_search_queries"] = data["searchQueries"]
    if "queries" in data:
        progress_state["activeQueries"] = data["queries"]
    if "queriesUsed" in data:
        progress_state["search_queries"] = data["queriesUsed"]
    if "candidateCount" in data:
        progress_state["candidateCount"] = data["candidateCount"]
    if "evidenceCount" in data:
        progress_state["evidenceCount"] = data["evidenceCount"]
    if "response" in data:
        progress_state["response"] = data["response"]
    if "chat_response" in data:
        progress_state["chat_response"] = data["chat_response"]

    event_summary = {
        "type": event_type,
        "status": status,
        "title": title,
        "data": data,
    }
    progress_state["events"] = [
        *progress_state.get("events", []),
        event_summary,
    ][-MAX_PROGRESS_ITEMS:]


def _apply_flow_chunk(progress_state: dict[str, Any], chunk: dict[str, Any]) -> None:
    content = str(chunk.get("content") or "")
    progress_state["streamedResponse"] = (
        str(progress_state.get("streamedResponse") or "") + content
    )
    progress_state["phase"] = "streaming"
    progress_state["currentStep"] = (
        str(chunk.get("task_name") or chunk.get("agent_role") or "Streaming response")
    )
    progress_state["streamChunks"] = [
        *progress_state.get("streamChunks", []),
        {
            "content": content,
            "chunkType": chunk.get("chunk_type"),
            "taskName": chunk.get("task_name"),
            "agentRole": chunk.get("agent_role"),
        },
    ][-MAX_PROGRESS_ITEMS:]


def _phase_from_event_type(event_type: str) -> str:
    if event_type.startswith("router."):
        return "routing"
    if event_type.startswith("planning."):
        return "planning"
    if event_type.startswith("evidence."):
        return "evidence"
    if event_type.startswith("synthesis."):
        return "synthesis"
    if event_type.startswith("citation_audit."):
        return "citation_audit"
    if event_type.startswith("assistant."):
        return "answer"
    return "running"


def main() -> None:
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
    )


if __name__ == "__main__":
    main()
