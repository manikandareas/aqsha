from pydantic_ai import Agent, RunContext
from pydantic_ai.models import KnownModelName, Model

from astra.agents.architect import build_architect_agent
from astra.agents.researcher import build_researcher_agent
from astra.agents.reviewer import build_reviewer_agent
from astra.deps import AstraDeps
from astra.types import AstraPlan


def build_astra_agent(
    model: Model | KnownModelName | str = "openai:gpt-5.2",
) -> Agent[AstraDeps, AstraPlan]:
    """Build Astra's DeepAgent-style orchestrator."""

    researcher_agent = build_researcher_agent(model)
    architect_agent = build_architect_agent(model)
    reviewer_agent = build_reviewer_agent(model)

    agent = Agent(
        model,
        deps_type=AstraDeps,
        output_type=AstraPlan,
        defer_model_check=True,
        instructions=(
            "You are Astra, Aqsha's multi-agent orchestrator. Keep control of the task, "
            "delegate to specialist agents when useful, synthesize their outputs, and return "
            "a validated AstraPlan. Prefer minimal, executable plans over broad theory."
        ),
    )

    @agent.instructions
    def add_runtime_context(ctx: RunContext[AstraDeps]) -> str:
        return f"Runtime context: {ctx.deps.describe()}"

    @agent.tool
    async def research(ctx: RunContext[AstraDeps], brief: str) -> str:
        """Delegate discovery work to Astra Researcher."""

        result = await researcher_agent.run(brief, deps=ctx.deps, usage=ctx.usage)
        return result.output

    @agent.tool
    async def design(ctx: RunContext[AstraDeps], brief: str) -> str:
        """Delegate implementation planning to Astra Architect."""

        result = await architect_agent.run(brief, deps=ctx.deps, usage=ctx.usage)
        return result.output

    @agent.tool
    async def review(ctx: RunContext[AstraDeps], brief: str) -> str:
        """Delegate risk analysis and validation design to Astra Reviewer."""

        result = await reviewer_agent.run(brief, deps=ctx.deps, usage=ctx.usage)
        return result.output

    return agent


astra_agent = build_astra_agent()
