from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "SeatSync"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "sqlite:///./seat_sync.db"
    JWT_SECRET_KEY: str = Field(min_length=32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    CORS_ORIGINS: str = "http://127.0.0.1:8000,http://localhost:8000"
    FIRST_ADMIN_EMAIL: str = "admin@seatsync.com"
    FIRST_ADMIN_NAME: str = "SeatSync Admin"
    FIRST_ADMIN_PASSWORD: str = ""

    model_config = SettingsConfigDict(
        env_prefix="SEATSYNC_",
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [value.strip() for value in self.CORS_ORIGINS.split(",") if value.strip()]


settings = Settings()
