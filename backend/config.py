"""Runtime settings for the open data extraction agent."""

from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import Field
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
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    frontend_url: str = "http://localhost:5173"

    data_extraction_provider: str = "mock"
    data_extraction_model: str = "mock-extractor"

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-3-5-haiku-latest"
    google_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-1.5-flash"
    openrouter_api_key: Optional[str] = None
    openrouter_model: str = "openai/gpt-4o-mini"

    storage_provider: str = "local"
    local_storage_dir: Path = Path("./storage")
    session_store: Path = Path("./storage/sessions.json")
    max_upload_mb: int = 50

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def provider_key_available(self) -> bool:
        provider = self.data_extraction_provider.lower()
        if provider == "mock":
            return True
        if provider == "openai":
            return bool(self.openai_api_key)
        if provider == "anthropic":
            return bool(self.anthropic_api_key)
        if provider == "gemini":
            return bool(self.gemini_api_key or self.google_api_key)
        if provider == "openrouter":
            return bool(self.openrouter_api_key)
        return False


@lru_cache
def get_settings() -> Settings:
    return Settings()

