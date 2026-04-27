from __future__ import annotations

import json
import os
import threading
import types
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Iterator

try:
    import psycopg
    from psycopg import Connection
    from psycopg.rows import dict_row
    from psycopg.types.json import Jsonb
except ImportError:  # pragma: no cover - exercised only when dependency is absent.
    psycopg = None  # type: ignore[assignment]
    Connection = Any  # type: ignore[misc,assignment]
    Jsonb = Any  # type: ignore[misc,assignment]
    dict_row = None  # type: ignore[assignment]


AGENT_NAMESPACE = uuid.UUID("0c2944a3-0190-4df9-a855-1bf5bc0f93c8")
VALID_EVENT_STATUSES = {"pending", "running", "completed", "failed"}
VALID_EVENT_SOURCES = {
    "api",
    "flow",
    "crewai_event_bus",
    "llm_hook",
    "tool_hook",
    "ag_ui",
    "system",
}
VALID_EVENT_SCOPES = {
    "run",
    "flow",
    "crew",
    "task",
    "agent",
    "tool",
    "mcp",
    "llm",
    "message",
    "stream",
    "error",
}
OUTPUT_EVENT_KINDS = {
    "planning.output": "research_plan",
    "research_batch.output": "research_batch",
    "evidence_review.output": "evidence_review",
    "research_answer.output": "research_answer",
}

current_agent_persistence: ContextVar[AgentRunPersistence | None] = ContextVar(
    "current_agent_persistence",
    default=None,
)


def stable_uuid(value: str, *, prefix: str) -> str:
    try:
        return str(uuid.UUID(value))
    except (TypeError, ValueError):
        return str(uuid.uuid5(AGENT_NAMESPACE, f"{prefix}:{value}"))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def json_safe(value: Any) -> Any:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, type | types.FunctionType | types.MethodType):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, list | tuple | set):
        return [json_safe(item) for item in value]
    if hasattr(value, "model_dump"):
        try:
            return json_safe(value.model_dump(mode="json"))
        except Exception:
            return str(value)
    if hasattr(value, "__dict__"):
        try:
            return json_safe(
                {
                    key: item
                    for key, item in vars(value).items()
                    if not key.startswith("_")
                }
            )
        except Exception:
            return str(value)
    return str(value)


def title_from_message(message: str | None) -> str:
    if not message:
        return "New research thread"
    compact = " ".join(message.split())
    if len(compact) <= 80:
        return compact
    return f"{compact[:77]}..."


class AgentRunPersistence:
    def __init__(
        self,
        *,
        database_url: str,
        thread_id: str,
        run_id: str,
        user_id: str | None,
        workspace_id: str | None,
    ) -> None:
        if psycopg is None:
            raise RuntimeError("psycopg is required for agent database persistence.")

        self.database_url = database_url
        self.thread_id = stable_uuid(thread_id, prefix="thread")
        self.run_id = stable_uuid(run_id, prefix="run")
        self.user_id = user_id
        self.workspace_id = workspace_id
        self._conn: Connection | None = None
        self._lock = threading.Lock()
        self._sequence = 0
        self.enabled = True

    def start(
        self,
        *,
        user_message: str | None,
        depth_mode: str,
        request_payload: dict[str, Any],
    ) -> None:
        self._conn = psycopg.connect(
            self.database_url,
            row_factory=dict_row,
        )
        self._conn.autocommit = False
        self._hydrate_thread_ownership()

        if not self.user_id or not self.workspace_id:
            self.close()
            raise RuntimeError(
                "Agent persistence requires user_id and workspace_id in state or "
                "forwardedProps for new threads."
            )

        with self._conn.transaction():
            self._execute(
                """
                insert into agent_threads (
                  id, workspace_id, user_id, title, depth_mode, status, updated_at
                )
                values (%s, %s, %s, %s, %s, 'active', now())
                on conflict (id) do update set
                  depth_mode = excluded.depth_mode,
                  updated_at = now()
                """,
                (
                    self.thread_id,
                    self.workspace_id,
                    self.user_id,
                    title_from_message(user_message),
                    depth_mode,
                ),
            )
            self._execute(
                """
                insert into agent_runs (
                  id, thread_id, workspace_id, user_id, status, depth_mode,
                  started_at, updated_at
                )
                values (%s, %s, %s, %s, 'running', %s, now(), now())
                on conflict (id) do update set
                  status = 'running',
                  error_message = null,
                  error_metadata = null,
                  started_at = coalesce(agent_runs.started_at, now()),
                  completed_at = null,
                  updated_at = now()
                """,
                (
                    self.run_id,
                    self.thread_id,
                    self.workspace_id,
                    self.user_id,
                    depth_mode,
                ),
            )
            if user_message:
                self.insert_message(
                    role="user",
                    content=user_message,
                    metadata={"source": "ag_ui_request"},
                    commit=False,
                )

        self.record_event(
            {
                "type": "api.run.started",
                "status": "running",
                "title": "Agent run started",
                "visibility": "internal",
                "data": request_payload,
            },
            source="api",
            scope="run",
        )

    def record_event(
        self,
        event: dict[str, Any],
        *,
        source: str = "flow",
        scope: str | None = None,
        raw_type: str | None = None,
        raw_payload: Any | None = None,
    ) -> None:
        if self._conn is None:
            return

        event_type = str(event.get("type") or raw_type or "event")
        event_scope = scope or infer_scope(event_type)
        status = str(event.get("status") or "running")
        if status not in VALID_EVENT_STATUSES:
            status = "running"
        if source not in VALID_EVENT_SOURCES:
            source = "system"
        if event_scope not in VALID_EVENT_SCOPES:
            event_scope = "run"

        payload = json_safe(event.get("data") if "data" in event else event)
        raw = json_safe(raw_payload if raw_payload is not None else event)
        title = str(event.get("title") or event_type)
        visibility = str(event.get("visibility") or "public")
        if visibility not in {"public", "internal"}:
            visibility = "internal"
        parent_event_id = event.get("parent_event_id") or event.get("parentEventId")
        if parent_event_id:
            parent_event_id = stable_uuid(str(parent_event_id), prefix="event")

        with self._lock:
            self._sequence += 1
            sequence = self._sequence
            self._execute(
                """
                insert into agent_events (
                  id, run_id, thread_id, workspace_id, sequence, type, source,
                  raw_type, scope, status, title, visibility, step_name, agent_role,
                  task_name, tool_name, parent_event_id, payload, raw_payload,
                  occurred_at
                )
                values (
                  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s
                )
                """,
                (
                    str(uuid.uuid4()),
                    self.run_id,
                    self.thread_id,
                    self.workspace_id,
                    sequence,
                    event_type,
                    source,
                    raw_type,
                    event_scope,
                    status,
                    title,
                    visibility,
                    event.get("step_name") or event.get("stepName"),
                    event.get("agent_role") or event.get("agentRole"),
                    event.get("task_name") or event.get("taskName"),
                    event.get("tool_name") or event.get("toolName"),
                    parent_event_id,
                    Jsonb(payload),
                    Jsonb(raw),
                    utc_now(),
                ),
            )
            self._conn.commit()

        output_kind = OUTPUT_EVENT_KINDS.get(event_type)
        if output_kind and isinstance(payload, dict):
            self.insert_output(kind=output_kind, payload=payload)

    def record_chunk(self, chunk: dict[str, Any]) -> None:
        self.record_event(
            {
                "type": "stream.chunk",
                "status": "running",
                "title": str(
                    chunk.get("task_name")
                    or chunk.get("agent_role")
                    or "Streaming response"
                ),
                "visibility": "internal",
                "data": chunk,
                "task_name": chunk.get("task_name"),
                "agent_role": chunk.get("agent_role"),
            },
            source="ag_ui",
            scope="stream",
        )

    def complete(self, result: Any, *, assistant_message: str | None) -> None:
        if self._conn is None:
            return
        with self._conn.transaction():
            if assistant_message:
                self.insert_message(
                    role="assistant",
                    content=assistant_message,
                    metadata={"source": "agent_result"},
                    commit=False,
                )
                self.insert_output(
                    kind="final_response",
                    payload={"content": assistant_message, "result": json_safe(result)},
                    commit=False,
                )
            self._execute(
                """
                update agent_runs
                set status = 'completed', completed_at = now(), updated_at = now()
                where id = %s
                """,
                (self.run_id,),
            )
            self._execute(
                "update agent_threads set updated_at = now() where id = %s",
                (self.thread_id,),
            )
        self.record_event(
            {
                "type": "api.run.completed",
                "status": "completed",
                "title": "Agent run completed",
                "visibility": "internal",
                "data": {"result": json_safe(result)},
            },
            source="api",
            scope="run",
        )

    def fail(self, error: Exception) -> None:
        if self._conn is None:
            return
        error_payload = {
            "type": error.__class__.__name__,
            "message": str(error),
        }
        with self._conn.transaction():
            self.insert_output(kind="error", payload=error_payload, commit=False)
            self._execute(
                """
                update agent_runs
                set status = 'failed',
                    error_message = %s,
                    error_metadata = %s,
                    completed_at = now(),
                    updated_at = now()
                where id = %s
                """,
                (str(error), Jsonb(error_payload), self.run_id),
            )
        self.record_event(
            {
                "type": "api.run.failed",
                "status": "failed",
                "title": "Agent run failed",
                "visibility": "internal",
                "data": error_payload,
            },
            source="api",
            scope="error",
        )

    def insert_message(
        self,
        *,
        role: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        commit: bool = True,
    ) -> None:
        if self._conn is None:
            return
        self._execute(
            """
            insert into agent_messages (
              id, thread_id, workspace_id, user_id, run_id, role, content, metadata
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(uuid.uuid4()),
                self.thread_id,
                self.workspace_id,
                self.user_id,
                self.run_id,
                role,
                content,
                Jsonb(json_safe(metadata or {})),
            ),
        )
        if commit:
            self._conn.commit()

    def insert_output(
        self,
        *,
        kind: str,
        payload: dict[str, Any],
        commit: bool = True,
    ) -> None:
        if self._conn is None:
            return
        self._execute(
            """
            insert into agent_run_outputs (
              id, run_id, thread_id, workspace_id, kind, payload
            )
            values (%s, %s, %s, %s, %s, %s)
            """,
            (
                str(uuid.uuid4()),
                self.run_id,
                self.thread_id,
                self.workspace_id,
                kind,
                Jsonb(json_safe(payload)),
            ),
        )
        if commit:
            self._conn.commit()

    def close(self) -> None:
        if self._conn is None:
            return
        self._conn.close()
        self._conn = None

    def _hydrate_thread_ownership(self) -> None:
        if self._conn is None or (self.user_id and self.workspace_id):
            return
        row = self._conn.execute(
            "select user_id, workspace_id from agent_threads where id = %s",
            (self.thread_id,),
        ).fetchone()
        if row:
            self.user_id = self.user_id or str(row["user_id"])
            self.workspace_id = self.workspace_id or str(row["workspace_id"])

    def _execute(self, query: str, params: tuple[Any, ...]) -> Any:
        if self._conn is None:
            raise RuntimeError("Agent persistence connection is not open.")
        return self._conn.execute(query, params)


class DisabledAgentPersistence:
    enabled = False

    def start(self, **_: Any) -> None:
        return None

    def record_event(self, *_: Any, **__: Any) -> None:
        return None

    def record_chunk(self, *_: Any, **__: Any) -> None:
        return None

    def complete(self, *_: Any, **__: Any) -> None:
        return None

    def fail(self, *_: Any, **__: Any) -> None:
        return None

    def close(self) -> None:
        return None


def create_agent_persistence(
    *,
    thread_id: str,
    run_id: str,
    user_id: str | None,
    workspace_id: str | None,
) -> AgentRunPersistence | DisabledAgentPersistence:
    if os.getenv("AGENTS_PERSISTENCE_DISABLED") in {"1", "true", "TRUE"}:
        return DisabledAgentPersistence()

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return DisabledAgentPersistence()
    return AgentRunPersistence(
        database_url=database_url,
        thread_id=thread_id,
        run_id=run_id,
        user_id=user_id,
        workspace_id=workspace_id,
    )


@contextmanager
def agent_persistence_context(
    persistence: AgentRunPersistence | DisabledAgentPersistence,
) -> Iterator[None]:
    token = current_agent_persistence.set(
        persistence if getattr(persistence, "enabled", False) else None
    )
    try:
        yield
    finally:
        current_agent_persistence.reset(token)


def infer_scope(event_type: str) -> str:
    prefix = event_type.split(".", 1)[0]
    if prefix in VALID_EVENT_SCOPES:
        return prefix
    if prefix == "router":
        return "flow"
    if prefix in {"planning", "synthesis", "citation_audit"}:
        return "task"
    if prefix in {"research_batch", "evidence_review", "research_answer"}:
        return "task"
    if prefix == "assistant":
        return "message"
    return "run"


def dumps_compact(value: Any) -> str:
    return json.dumps(json_safe(value), separators=(",", ":"), sort_keys=True)
