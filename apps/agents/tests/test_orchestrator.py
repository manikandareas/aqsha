from pydantic_ai.models.test import TestModel

from astra.agents import build_astra_agent
from astra.deps import AstraDeps
from astra.types import AstraPlan


async def test_astra_orchestrator_returns_structured_plan() -> None:
    agent = build_astra_agent(TestModel())
    deps = AstraDeps(user_id="test-user", workspace="test-workspace")

    result = await agent.run("Create a launch plan", deps=deps)

    assert isinstance(result.output, AstraPlan)
