from pydantic_settings import BaseSettings, SettingsConfigDict


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
    http_host: str = "127.0.0.1"
    http_port: int = 8001
    internal_token: str = ""
