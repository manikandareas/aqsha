from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from deep_research_agent.api.events import EventFactory
from deep_research_agent.api.main import app


class ApiTest(unittest.TestCase):
    def test_event_factory_orders_events(self) -> None:
        factory = EventFactory(run_id="run_1", thread_id="thread_1")

        first = factory.create("run.started")
        second = factory.create("router.completed", status="completed")

        self.assertEqual(first.sequence, 1)
        self.assertEqual(second.sequence, 2)
        self.assertEqual(second.status, "completed")

    def test_chat_stream_returns_sse(self) -> None:
        def fake_run_flow(inputs, event_sink=None):
            self.assertEqual(inputs["user_message"], "hello")
            if event_sink:
                event_sink(
                    {
                        "type": "router.completed",
                        "status": "completed",
                        "title": "Casual chat selected",
                        "data": {"route": "casual_chat"},
                    }
                )
                event_sink(
                    {
                        "type": "assistant.message.completed",
                        "status": "completed",
                        "title": "Assistant message ready",
                        "data": {"content": "Hi"},
                    }
                )
            return {"chat_response": "Hi"}

        client = TestClient(app)

        with patch("deep_research_agent.api.service.run_flow", fake_run_flow):
            response = client.post(
                "/v1/chat/stream",
                json={
                    "runId": "run_1",
                    "threadId": "thread_1",
                    "workspaceId": "workspace_1",
                    "userId": "user_1",
                    "message": "hello",
                    "depthMode": "standard",
                    "messageHistory": [],
                },
            )

        self.assertEqual(response.status_code, 200)
        frames = [
            json.loads(frame.split("data: ", 1)[1])
            for frame in response.text.strip().split("\n\n")
        ]
        self.assertEqual(
            [frame["type"] for frame in frames],
            [
                "run.started",
                "router.completed",
                "assistant.message.completed",
                "run.completed",
            ],
        )


if __name__ == "__main__":
    unittest.main()
