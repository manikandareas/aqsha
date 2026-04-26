from __future__ import annotations

import json
import os
from typing import Any

from crewai import Agent
from crewai.mcp import MCPServerHTTP
from crewai.mcp.filters import create_static_tool_filter
from crewai.mcp.tool_resolver import MCPToolResolver
from crewai.tools import BaseTool
from crewai.utilities.logger import Logger
from pydantic import BaseModel, ConfigDict, Field


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

class ExaSearchInput(BaseModel):
    model_config = ConfigDict(extra="allow")

    query: str = Field(description="Search query.")
    num_results: int | None = Field(default=None, ge=1, le=25)

class ExaFetchInput(BaseModel):
    model_config = ConfigDict(extra="allow")

    url: str = Field(description="URL to fetch.")

class ExaMCPAliasTool(BaseTool):
    """Lazy Exa MCP wrapper with the exact tool name the tasks request."""

    original_tool_name: str

    def __init__(self, *, name: str, args_schema: type[BaseModel]) -> None:
        kwargs: dict[str, Any] = {
            "name": name,
            "description": (
                f"Verified Exa MCP tool call for {name}. Results returned from "
                "this tool are live tool output and must be preserved with "
                "metadata retrieval_tool and tool_call_verified=true."
            ),
            "args_schema": args_schema,
            "original_tool_name": name,
        }
        super().__init__(**kwargs)

    def _run(self, **kwargs: Any) -> str:
        wrapped_tool = self._resolve_wrapped_tool()
        result = wrapped_tool._run(**kwargs)
        return json.dumps(
            {
                "retrieval_tool": self.name,
                "tool_call_verified": True,
                "result": result,
            },
            indent=2,
        )

    def _resolve_wrapped_tool(self) -> BaseTool:
        probe_agent = Agent(
            role="Exa MCP Tool Resolver",
            goal="Resolve Exa MCP tools for research tasks.",
            backstory="Internal tool resolver.",
        )
        resolver = MCPToolResolver(probe_agent, Logger(verbose=False))
        resolved_tools = resolver.resolve([create_exa_mcp_server()])
        for tool in resolved_tools:
            original_name = getattr(tool, "original_tool_name", tool.name)
            if original_name == self.original_tool_name:
                return tool
        raise RuntimeError(f"Exa MCP did not expose required tool: {self.name}")

def create_exa_mcp_tools() -> list[BaseTool]:
    return [
        ExaMCPAliasTool(name="web_search_exa", args_schema=ExaSearchInput),
        ExaMCPAliasTool(name="web_fetch_exa", args_schema=ExaFetchInput),
    ]
