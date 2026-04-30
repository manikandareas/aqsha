import secrets

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request, status
from pydantic_ai.ui.vercel_ai import VercelAIAdapter

from astra.agents.chat import build_chat_agent
from astra.cli import configure_observability
from astra.deps import AstraDeps
from astra.settings import AstraSettings

load_dotenv()
settings = AstraSettings()
configure_observability(settings.enable_logfire)
chat_agent = build_chat_agent(settings.model)

app = FastAPI(title="Astra Agents", docs_url=None, redoc_url=None)


def require_internal_auth(authorization: str | None) -> None:
    if not settings.internal_token:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ASTRA_INTERNAL_TOKEN is required",
        )

    expected = f"Bearer {settings.internal_token}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
        )


@app.post("/internal/chat")
async def internal_chat(
    request: Request,
    authorization: str | None = Header(default=None),
    x_astra_user_id: str | None = Header(default=None),
    x_astra_workspace: str | None = Header(default=None),
    x_astra_model: str | None = Header(default=None),
):
    require_internal_auth(authorization)

    deps = AstraDeps(
        user_id=x_astra_user_id or settings.user_id,
        workspace=x_astra_workspace or settings.workspace,
    )

    return await VercelAIAdapter.dispatch_request(
        request,
        agent=chat_agent,
        sdk_version=6,
        deps=deps,
        model=x_astra_model or settings.model,
        manage_system_prompt="server",
    )


def main() -> None:
    import uvicorn

    uvicorn.run(
        "astra.server:app",
        host=settings.http_host,
        port=settings.http_port,
    )
