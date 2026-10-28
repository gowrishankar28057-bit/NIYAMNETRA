import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BASE_DIR.parent


def _bool(name, default):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _database_url():
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{BASE_DIR / 'instance' / 'neyamnetra.db'}"
    # Hosted providers still hand out the legacy scheme.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")
    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    DEMO_MODE = _bool("DEMO_MODE", True)
    SESSION_HOURS = int(os.environ.get("SESSION_HOURS", "8"))
    COOKIE_SECURE = _bool("COOKIE_SECURE", False)
    MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "10"))
    MAX_CONTENT_LENGTH = (MAX_UPLOAD_MB + 1) * 1024 * 1024
    CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
    FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", str(REPO_DIR / "frontend" / "dist")))
    # Image quality thresholds (see app/quality.py for how they combine).
    QUALITY_BLUR_EFFECT_FAIL = float(os.environ.get("QUALITY_BLUR_EFFECT_FAIL", "0.45"))
    QUALITY_BLUR_EFFECT_WARN = float(os.environ.get("QUALITY_BLUR_EFFECT_WARN", "0.30"))
    QUALITY_LAPLACIAN_FAIL = float(os.environ.get("QUALITY_LAPLACIAN_FAIL", "60"))
    QUALITY_LAPLACIAN_WARN = float(os.environ.get("QUALITY_LAPLACIAN_WARN", "150"))
    QUALITY_MIN_SHORT_SIDE = int(os.environ.get("QUALITY_MIN_SHORT_SIDE", "500"))
    QUALITY_WARN_SHORT_SIDE = int(os.environ.get("QUALITY_WARN_SHORT_SIDE", "800"))
    QUALITY_MIN_CONTRAST = float(os.environ.get("QUALITY_MIN_CONTRAST", "18"))
    # Reporting period start for the official dashboard (ISO date).
    REPORTING_PERIOD_START = os.environ.get("REPORTING_PERIOD_START", "2026-07-01")
    AUTO_SEED = _bool("AUTO_SEED", True)


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SQLALCHEMY_ENGINE_OPTIONS = {}
    DEMO_MODE = True
    AUTO_SEED = False
