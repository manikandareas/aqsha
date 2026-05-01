import argparse
import asyncio

from dotenv import load_dotenv

from astra.agents import build_astra_agent
from astra.deps import AstraDeps
from astra.settings import AstraSettings


def configure_observability(enabled: bool) -> None:
    if not enabled:
        return

    import logfire

    logfire.configure()
    logfire.instrument_pydantic_ai()


async def run(prompt: str) -> str:
    load_dotenv()

    settings = AstraSettings()
    configure_observability(settings.enable_logfire)

    agent = build_astra_agent(settings.model)
    deps = AstraDeps(user_id=settings.user_id, workspace=settings.workspace)
    result = await agent.run(prompt, deps=deps)
    return result.output.model_dump_json(indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Astra multi-agent orchestrator.")
    parser.add_argument("prompt", help="Task brief for Astra.")
    args = parser.parse_args()

    print(asyncio.run(run(args.prompt)))
