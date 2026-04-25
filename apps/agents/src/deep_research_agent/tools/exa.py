from __future__ import annotations

import os

from crewai.mcp import MCPServerHTTP
from crewai.mcp.filters import create_static_tool_filter


def create_exa_mcp_server() -> MCPServerHTTP:
    exa_api_key = os.getenv("EXA_API_KEY")
    if not exa_api_key:
        raise ValueError("EXA_API_KEY is required to use Exa MCP")

    return MCPServerHTTP(
        url="https://mcp.exa.ai/mcp",
        headers={"x-api-key": exa_api_key},
        tool_filter=create_static_tool_filter(
            allowed_tool_names=["web_search_exa", "web_fetch_exa"]
        ),
        cache_tools_list=True,
    )
