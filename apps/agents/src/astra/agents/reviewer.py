from pydantic_ai import Agent, RunContext
from pydantic_ai.models import KnownModelName, Model

from astra.deps import AstraDeps


def build_reviewer_agent(
    model: Model | KnownModelName | str = "openai:gpt-5.2",
) -> Agent[AstraDeps, str]:
    agent = Agent(
        model,
        deps_type=AstraDeps,
        output_type=str,
        defer_model_check=True,
        instructions=(
            "You are Astra Reviewer. Identify correctness risks, missing validation, "
            "security concerns, and behavior regressions. Prioritize actionable findings."
        ),
    )

    @agent.instructions
    def add_review_context(ctx: RunContext[AstraDeps]) -> str:
        return f"Runtime context: {ctx.deps.describe()}"

    return agent


reviewer_agent = build_reviewer_agent()
