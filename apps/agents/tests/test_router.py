from __future__ import annotations

import unittest
from io import StringIO
from unittest.mock import patch

from deep_research_agent.main import kickoff, route_user_intent
from deep_research_agent.models import Message, RouterOutput


class FakeLLM:
    def __init__(self, output: RouterOutput) -> None:
        self.output = output
        self.prompts: list[str] = []

    def call(self, prompt: str) -> RouterOutput:
        self.prompts.append(prompt)
        return self.output


class RouteUserIntentTest(unittest.TestCase):
    def test_returns_casual_chat_response(self) -> None:
        llm = FakeLLM(
            RouterOutput(
                user_intent="casual_chat",
                chat_response="Hi there",
                reasoning="Greeting only.",
            )
        )

        result = route_user_intent(
            user_message="hello",
            message_history=[Message(role="user", content="hello")],
            llm=llm,  # type: ignore[arg-type]
        )

        self.assertEqual(result.user_intent, "casual_chat")
        self.assertEqual(result.chat_response, "Hi there")
        self.assertEqual(len(llm.prompts), 1)

    def test_returns_research_queries(self) -> None:
        llm = FakeLLM(
            RouterOutput(
                user_intent="search",
                search_queries=[
                    "agentic ai market 2026",
                    "deep research agents comparison",
                    "research agent framework citations",
                ],
                reasoning="Factual research request.",
            )
        )

        result = route_user_intent(
            user_message="compare research agents in 2026",
            message_history=[],
            llm=llm,  # type: ignore[arg-type]
        )

        self.assertEqual(result.user_intent, "search")
        self.assertEqual(len(result.search_queries), 3)

    def test_kickoff_console_entrypoint_returns_none(self) -> None:
        with patch("deep_research_agent.main.run_flow", return_value={"ok": True}), patch(
            "sys.stdout", new_callable=StringIO
        ):
            self.assertIsNone(kickoff({"user_message": "hello"}))

    def test_kickoff_console_entrypoint_prints_response_body(self) -> None:
        with patch(
            "deep_research_agent.main.run_flow",
            return_value={"response": "Final answer"},
        ), patch("sys.stdout", new_callable=StringIO) as stdout:
            kickoff({"user_message": "hello"})

        self.assertEqual(stdout.getvalue().strip(), "Final answer")


if __name__ == "__main__":
    unittest.main()
