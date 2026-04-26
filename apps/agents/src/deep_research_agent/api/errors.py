from __future__ import annotations

from fastapi import HTTPException, Request

from deep_research_agent.api.settings import settings


def require_internal_token(request: Request) -> None:
    if not settings.agents_api_token:
        return

    expected = f"Bearer {settings.agents_api_token}"
    if request.headers.get("authorization") != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
