import logging
import secrets
from collections.abc import Awaitable, Callable
from typing import cast
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
from starlette.responses import Response

from astra.agents import build_astra_agent
from astra.cli import configure_observability
from astra.deps import AstraDeps
from astra.log_config import configure_file_logging
from astra.settings import AstraSettings

load_dotenv()
settings = AstraSettings()
log_path = configure_file_logging(settings)
configure_observability(settings.enable_logfire)
astra_agent = build_astra_agent(settings.model, settings=settings)
logger = logging.getLogger(__name__)
if log_path is not None:
    logger.info("Astra file logging configured", extra={"log_file": log_path.as_posix()})

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


async def extract_conversation_id(request: Request) -> str | None:
    try:
        body = await request.json()
    except ValueError:
        return None

    if not isinstance(body, dict):
        return None

    body_dict = cast(dict[str, object], body)
    conversation_id = body_dict.get("id")
    if isinstance(conversation_id, str) and conversation_id.strip():
        return conversation_id
    return None


@app.middleware("http")
async def log_unhandled_errors(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    request_id = uuid4().hex
    request.state.astra_request_id = request_id

    try:
        return await call_next(request)
    except Exception:
        astra_context = getattr(request.state, "astra_context", {})
        logger.exception(
            "Unhandled agents request error",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                **astra_context,
            },
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "agents_service_error",
                    "message": "Agents service failed. Check the Astra log file for details.",
                    "requestId": request_id,
                }
            },
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
    conversation_id = await extract_conversation_id(request)
    request.state.astra_context = {
        "conversation_id": conversation_id or "none",
        "user_id": x_astra_user_id or settings.user_id,
        "workspace": x_astra_workspace or settings.workspace,
        "model": x_astra_model or settings.model,
    }

    deps = AstraDeps(
        user_id=x_astra_user_id or settings.user_id,
        workspace=x_astra_workspace or settings.workspace,
        conversation_id=conversation_id,
        research_artifact_dir=settings.resolved_research_artifact_dir(),
    )

    return await VercelAIAdapter.dispatch_request(
        request,
        agent=astra_agent,
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
