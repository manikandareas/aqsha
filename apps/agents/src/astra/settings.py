from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_ROOT = Path(__file__).resolve().parents[2]


class AstraSettings(BaseSettings):
    """Runtime settings for Astra."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="ASTRA_",
        extra="ignore",
    )

    model: str = "openai:gpt-5.2"
    user_id: str = "local-dev"
    workspace: str = "aqsha"
    enable_logfire: bool = False
    enable_file_logging: bool = True
    http_host: str = "127.0.0.1"
    http_port: int = 8001
    internal_token: str = ""
    exa_mcp_url: str = "https://mcp.exa.ai/mcp"
    exa_api_key: str = ""
    exa_mcp_authorization_token: str = ""
    enable_provider_web_search: bool = False
    provider_web_search_context_size: Literal["low", "medium", "high"] = "medium"
    provider_web_search_max_uses: int = 5
    enable_web_fetch: bool = True
    web_fetch_max_content_tokens: int = 12_000
    thinking_effort: Literal["minimal", "low", "medium", "high", "xhigh"] = "medium"
    research_artifact_dir: str = ".astra/research"
    log_dir: str = ".astra/logs"
    log_file_name: str = "astra.log"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    log_max_bytes: int = 5_000_000
    log_backup_count: int = 5

    def resolved_research_artifact_dir(self) -> Path:
        path = Path(self.research_artifact_dir).expanduser()
        if path.is_absolute():
            return path
        return APP_ROOT / path

    def resolved_log_dir(self) -> Path:
        path = Path(self.log_dir).expanduser()
        if path.is_absolute():
            return path
        return APP_ROOT / path
