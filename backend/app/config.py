from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ — every relative path below resolves against this, whatever the cwd.
BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Practice Project API"
    database_url: str = "sqlite:///./app.db"
    # Comma-separated list, e.g. "http://localhost:3000,http://127.0.0.1:3000"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    uploads_dir: Path = Path("storage/uploads")
    meetings_dir: Path = Path("storage/meetings")

    # LLM settings — all optional; app works without them (AI features disabled).
    llm_provider: str | None = None  # openai | anthropic | google | none
    llm_model: str | None = None
    llm_api_key: str | None = None

    @field_validator("database_url")
    @classmethod
    def _anchor_sqlite(cls, value: str) -> str:
        # sqlite:///./app.db would otherwise depend on the directory uvicorn was started from.
        prefix = "sqlite:///"
        if value.startswith(prefix) and not value.startswith(prefix + "/") and ":memory:" not in value:
            return prefix + str((BACKEND_DIR / value[len(prefix):]).resolve())
        return value

    @field_validator("uploads_dir", "meetings_dir")
    @classmethod
    def _anchor_dir(cls, value: Path) -> Path:
        return value if value.is_absolute() else (BACKEND_DIR / value).resolve()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
