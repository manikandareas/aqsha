from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from deep_research_agent.models import Message


class ChatStreamRequest(BaseModel):
    runId: str
    threadId: str
    workspaceId: str
    userId: str
    message: str = Field(min_length=1)
    depthMode: Literal["standard", "deep"] = "standard"
    messageHistory: list[Message] = Field(default_factory=list)


class HealthResponse(BaseModel):
    ok: bool
