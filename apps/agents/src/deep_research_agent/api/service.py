from __future__ import annotations

import queue
import threading
from collections.abc import Iterator
from typing import Any

from deep_research_agent.api.events import AgentStreamEvent, EventFactory
from deep_research_agent.api.schemas import ChatStreamRequest
from deep_research_agent.main import run_flow

QueueItem = AgentStreamEvent | None


class ChatStreamService:
    def stream(self, request: ChatStreamRequest) -> Iterator[str]:
        events: queue.Queue[QueueItem] = queue.Queue()
        factory = EventFactory(run_id=request.runId, thread_id=request.threadId)

        def emit(
            event_type: str,
            *,
            status: str = "running",
            title: str | None = None,
            data: dict[str, Any] | None = None,
        ) -> None:
            events.put(
                factory.create(
                    event_type,
                    status=status,  # type: ignore[arg-type]
                    title=title,
                    data=data,
                )
            )

        def event_sink(raw_event: dict[str, Any]) -> None:
            events.put(
                factory.create(
                    str(raw_event["type"]),
                    status=raw_event.get("status", "running"),
                    title=raw_event.get("title"),
                    visibility=raw_event.get("visibility", "public"),
                    data=raw_event.get("data") or {},
                )
            )

        def worker() -> None:
            try:
                emit(
                    "run.started",
                    title="Run started",
                    data={"depthMode": request.depthMode},
                )
                result = run_flow(
                    {
                        "id": request.threadId,
                        "user_message": request.message,
                        "depth_mode": request.depthMode,
                        "message_history": request.messageHistory,
                    },
                    event_sink=event_sink,
                )
                emit(
                    "run.completed",
                    status="completed",
                    title="Run completed",
                    data={"result": self.as_dict(result)},
                )
            except Exception as error:
                emit(
                    "run.failed",
                    status="failed",
                    title="Run failed",
                    data={"message": str(error)},
                )
            finally:
                events.put(None)

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

        while True:
            event = events.get()
            if event is None:
                break
            yield event.to_sse()

        thread.join()

    def as_dict(self, result: Any) -> dict[str, Any]:
        return result if isinstance(result, dict) else {"result": result}
