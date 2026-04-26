from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

EventStatus = Literal["pending", "running", "completed", "failed"]
EventVisibility = Literal["public", "internal"]


class AgentStreamEvent(BaseModel):
    id: str
    runId: str
    threadId: str
    sequence: int
    type: str
    status: EventStatus
    title: str
    createdAt: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    visibility: EventVisibility = "public"
    data: dict[str, Any] = Field(default_factory=dict)

    def to_sse(self) -> str:
        return f"event: agent.event\ndata: {json.dumps(self.model_dump())}\n\n"


class EventFactory:
    def __init__(self, *, run_id: str, thread_id: str) -> None:
        self.run_id = run_id
        self.thread_id = thread_id
        self.sequence = 0

    def create(
        self,
        event_type: str,
        *,
        status: EventStatus = "running",
        title: str | None = None,
        visibility: EventVisibility = "public",
        data: dict[str, Any] | None = None,
    ) -> AgentStreamEvent:
        self.sequence += 1
        return AgentStreamEvent(
            id=f"{self.run_id}:{self.sequence}",
            runId=self.run_id,
            threadId=self.thread_id,
            sequence=self.sequence,
            type=event_type,
            status=status,
            title=title or event_type,
            visibility=visibility,
            data=data or {},
        )
