from __future__ import annotations

from fastapi import Depends, FastAPI, Request
from fastapi.responses import StreamingResponse

from deep_research_agent.api.errors import require_internal_token
from deep_research_agent.api.schemas import ChatStreamRequest, HealthResponse
from deep_research_agent.api.service import ChatStreamService

app = FastAPI(title="Aqsha Agents Runtime")
chat_stream_service = ChatStreamService()


def verify_internal_request(request: Request) -> None:
    require_internal_token(request)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True)


@app.post("/v1/chat/stream")
def chat_stream(
    payload: ChatStreamRequest,
    _: None = Depends(verify_internal_request),
) -> StreamingResponse:
    return StreamingResponse(
        chat_stream_service.stream(payload),
        media_type="text/event-stream",
    )
