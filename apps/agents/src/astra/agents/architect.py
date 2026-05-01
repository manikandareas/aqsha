from pydantic_ai import Agent, RunContext
from pydantic_ai.models import KnownModelName, Model

from astra.deps import AstraDeps


def build_architect_agent(
    model: Model | KnownModelName | str = "openai:gpt-5.2",
) -> Agent[AstraDeps, str]:
    agent = Agent(
        model,
        deps_type=AstraDeps,
        output_type=str,
        defer_model_check=True,
        instructions=(
            "You are Astra Architect. Convert researched context into a minimal, "
            "sequenced implementation plan. Prefer simple designs and explicit boundaries."
        ),
    )

    @agent.instructions
    def add_architecture_context(ctx: RunContext[AstraDeps]) -> str:
        return f"Runtime context: {ctx.deps.describe()}"

    return agent


architect_agent = build_architect_agent()
