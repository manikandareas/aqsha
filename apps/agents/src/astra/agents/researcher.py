from pydantic_ai import Agent, RunContext
from pydantic_ai.models import KnownModelName, Model

from astra.deps import AstraDeps


def build_researcher_agent(
    model: Model | KnownModelName | str = "openai:gpt-5.2",
) -> Agent[AstraDeps, str]:
    agent = Agent(
        model,
        deps_type=AstraDeps,
        output_type=str,
        defer_model_check=True,
        instructions=(
            "You are Astra Researcher. Extract the facts, missing context, assumptions, "
            "and decision points needed before execution. Be concise and cite uncertainty."
        ),
    )

    @agent.instructions
    def add_research_context(ctx: RunContext[AstraDeps]) -> str:
        return f"Runtime context: {ctx.deps.describe()}"

    return agent


researcher_agent = build_researcher_agent()
