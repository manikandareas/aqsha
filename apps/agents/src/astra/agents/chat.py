from pydantic_ai import Agent, RunContext
from pydantic_ai.models import KnownModelName, Model

from astra.deps import AstraDeps

CHAT_INSTRUCTIONS = (
    "You are Aqsha's concise, thoughtful assistant. Help the user reason clearly "
    "and provide practical next steps. Prefer direct, useful answers over broad theory."
)


def build_chat_agent(
    model: Model | KnownModelName | str = "openai:gpt-5.2",
) -> Agent[AstraDeps, str]:
    """Build Astra's conversational chat agent."""

    agent = Agent(
        model,
        deps_type=AstraDeps,
        defer_model_check=True,
        instructions=CHAT_INSTRUCTIONS,
    )

    @agent.instructions
    def add_runtime_context(ctx: RunContext[AstraDeps]) -> str:
        return f"Runtime context: {ctx.deps.describe()}"

    return agent


chat_agent = build_chat_agent()
