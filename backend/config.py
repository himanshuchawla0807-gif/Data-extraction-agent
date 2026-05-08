"""Runtime settings for the open data extraction agent."""

from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Data Extraction Agent Open"
    app_env: str = "development"
    host: str = "0.0.0.0"
    port: int = 8101
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174"
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1):\d+$"
    frontend_url: str = "http://localhost:5173"

    data_extraction_provider: str = "opencode"
    data_extraction_model: str = "opencode"

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-5.5"
    openai_reasoning_effort: Optional[str] = "medium"
    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-3-5-haiku-latest"
    google_api_key: Optional[str] = None
    google_generative_ai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.5-pro"
    openrouter_api_key: Optional[str] = None
    openrouter_model: str = ""
    opencode_api_provider: str = "anthropic"
    opencode_model: str = ""
    opencode_command: str = "opencode"
    opencode_timeout_seconds: int = 300
    opencode_browser_enabled: bool = True

    storage_provider: str = "local"
    local_storage_dir: Path = Path("./storage")
    local_embedding_dir: Path = Path.home() / ".users" / "embeddings" / "data-extraction-agent-open"
    session_store: Path = Path("./storage/sessions.json")
    max_document_chars: int = 120000
    max_upload_mb: int = 50

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def provider_key_available(self) -> bool:
        provider = self.selected_opencode_api_provider()
        if provider == "openai":
            return bool(self.openai_api_key)
        if provider == "anthropic":
            return bool(self.anthropic_api_key)
        if provider == "gemini":
            return bool(self.gemini_api_key or self.google_api_key or self.google_generative_ai_api_key)
        if provider == "openrouter":
            return bool(self.openrouter_api_key)
        if provider in {"custom", "opencode", ""}:
            return True
        return False

    def effective_model(self) -> str:
        return self.opencode_model or "opencode-default"

    def selected_opencode_api_provider(self) -> str:
        provider = (self.opencode_api_provider or "").lower().strip()
        if provider:
            return provider
        route = (self.opencode_model or "").lower().strip()
        if route.startswith("anthropic/"):
            return "anthropic"
        if route.startswith(("gemini/", "google/", "google-vertex/")):
            return "gemini"
        if route.startswith("openai/"):
            return "openai"
        if route.startswith("openrouter/"):
            return "openrouter"
        return "custom"


@lru_cache
def get_settings() -> Settings:
    return Settings()
