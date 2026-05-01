import argparse
import asyncio

from dotenv import load_dotenv

from astra.agents import build_astra_agent
from astra.deps import AstraDeps
from astra.log_config import configure_file_logging
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
    configure_file_logging(settings)
    configure_observability(settings.enable_logfire)

    agent = build_astra_agent(settings.model, settings=settings)
    deps = AstraDeps(
        user_id=settings.user_id,
        workspace=settings.workspace,
        conversation_id="cli",
        research_artifact_dir=settings.resolved_research_artifact_dir(),
    )
    result = await agent.run(prompt, deps=deps)
    return result.output


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Astra.")
    parser.add_argument("prompt", help="Task brief for Astra.")
    args = parser.parse_args()

    print(asyncio.run(run(args.prompt)))
