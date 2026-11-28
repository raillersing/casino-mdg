"""
Django settings for Casino MDG backend.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

from .production_guard import enforce_production_settings

load_dotenv()
enforce_production_settings(os.environ)

BASE_DIR = Path(__file__).resolve().parent.parent

# ─── Security ─────────────────────────────────────────────────
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-key-change-in-prod")
DEBUG = os.getenv("DEBUG", "False").lower() == "true"
raw_allowed_hosts = [
    h.strip() for h in os.getenv("ALLOWED_HOSTS", "*").split(",") if h.strip()
]
if (
    "*" in raw_allowed_hosts
    or not raw_allowed_hosts
    or "votre-domaine.com" in raw_allowed_hosts
):
    ALLOWED_HOSTS = ["*"]
else:
    ALLOWED_HOSTS = list(
        set(raw_allowed_hosts + ["localhost", "127.0.0.1", "backend", "testserver"])
    )

# ─── Apps ─────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "corsheaders",
    "django_otp",
    "django_otp.plugins.otp_totp",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.wallet",
    "apps.games",
    "apps.social",
    "apps.support",
    "apps.notifications",
    "apps.clubs",
    "apps.kyc",
    "apps.payments",
    "apps.backoffice",
    "apps.analytics",
    "apps.responsible_gaming",
]

AUTH_USER_MODEL = "accounts.User"

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ─── Middleware ───────────────────────────────────────────────
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "config.middleware.RequestIDMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ─── Database ────────────────────────────────────────────────
db_engine = os.getenv("DB_ENGINE", "django.db.backends.postgresql")
DATABASES = {
    "default": {
        "ENGINE": db_engine,
        "NAME": os.getenv("DB_NAME", "casino_mdg"),
        "USER": os.getenv("DB_USER", "postgres"),
        "PASSWORD": os.getenv("DB_PASSWORD", "postgres"),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "CONN_MAX_AGE": int(os.getenv("DB_CONN_MAX_AGE", "60")),
    }
}
if "postgresql" in db_engine:
    DATABASES["default"]["OPTIONS"] = {
        "connect_timeout": 5,
    }

# SMTP is disabled for email OTP unless explicitly configured by the operator.
# Never use the console/file backend for authentication in a deployed instance.
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True").lower() == "true"
EMAIL_USE_SSL = os.getenv("EMAIL_USE_SSL", "False").lower() == "true"
EMAIL_TIMEOUT = 8
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "")
EMAIL_OTP_ENABLED = os.getenv("EMAIL_OTP_ENABLED", "False").lower() == "true"

# ─── Caches ──────────────────────────────────────────────────
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        "OPTIONS": {
            "socket_connect_timeout": 5,
            "socket_timeout": 5,
        },
    }
}

# ─── Celery ──────────────────────────────────────────────────
CELERY_BROKER_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672//")
CELERY_RESULT_BACKEND = os.getenv("REDIS_URL", "redis://localhost:6379/1")
CELERY_TIMEZONE = "Indian/Antananarivo"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60

# ─── Internationalization ────────────────────────────────────
LANGUAGE_CODE = "fr"
TIME_ZONE = "Indian/Antananarivo"
USE_I18N = True
USE_TZ = True

LANGUAGES = [
    ("fr", "Français"),
    ("mg", "Malagasy"),
]

# ─── Static / Media ──────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ─── REST Framework ──────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/minute",
        "user": "1000/minute",
        "otp_request": "5/minute",
        "otp_verify": "10/minute",
    },
}

# ─── CORS ────────────────────────────────────────────────────
cors_origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
if not cors_origins_env.strip() or cors_origins_env.strip() == "*":
    CORS_ALLOW_ALL_ORIGINS = True
    CORS_ALLOWED_ORIGINS = []
else:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = [o.strip() for o in cors_origins_env.split(",") if o.strip()]

# ─── Game Engine WebSocket ──────────────────────────────────
GAME_ENGINE_WS_URL = os.getenv("GAME_ENGINE_WS_URL", "ws://localhost:8080")
GAME_ENGINE_INTERNAL_URL = os.getenv(
    "GAME_ENGINE_INTERNAL_URL", "http://game-engine:8080"
)
GAME_ENGINE_BOT_SECRET = os.getenv(
    "GAME_ENGINE_BOT_SECRET", "dev-game-engine-bot-secret-change-me"
)
GAME_ENGINE_RESULT_SECRET = os.getenv(
    "GAME_ENGINE_RESULT_SECRET", "dev-game-engine-result-secret-change-me"
)
PAYMENT_WEBHOOK_SECRET = os.getenv(
    "PAYMENT_WEBHOOK_SECRET", "dev-webhook-secret-change-me"
)
# Generic HMAC sandbox webhooks are never a live-money settlement protocol.
PAYMENT_SANDBOX_WEBHOOKS_ENABLED = (
    os.getenv("PAYMENT_SANDBOX_WEBHOOKS_ENABLED", "False").lower() == "true"
)

# ─── Default primary key ─────────────────────────────────────
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── Security headers (prod) ────────────────────────────────
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Proxy SSL header (behind Nginx / Cloudflare / reverse proxy)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Endpoints exempt from SSL redirects (health checks and monitoring)
SECURE_REDIRECT_EXEMPT = [
    r"^healthz/?$",
    r"^readyz/?$",
    r"^metrics/?$",
    r"^api/v1/ping/?$",
    # Private engine RPC: authenticated shared-secret endpoints only.
    # Production ingress blocks /api/v1/games/internal/ from the public network.
    r"^api/v1/games/internal/sessions/[0-9]+/$",
    r"^api/v1/games/internal/tables/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/finance/$",
    r"^api/v1/games/internal/human-activity/$",
    r"^api/v1/games/internal/bots/session-complete/$",
    r"^api/v1/games/internal/settle-round/$",
]

if not DEBUG and os.getenv("SECURE_SSL_REDIRECT", "False").lower() == "true":
    SECURE_SSL_REDIRECT = True
    # Roll out HSTS gradually; do not opt unrelated subdomains in by default.
    SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "300"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
else:
    SECURE_SSL_REDIRECT = False

# Real-time table expiry; the worker never expires tables while the engine is unavailable.
TABLE_EMPTY_EXPIRY_SECONDS = int(os.getenv("TABLE_EMPTY_EXPIRY_SECONDS", "120"))
TABLE_WAITING_EXPIRY_SECONDS = int(os.getenv("TABLE_WAITING_EXPIRY_SECONDS", "900"))
TABLE_RUNNING_EXPIRY_SECONDS = int(os.getenv("TABLE_RUNNING_EXPIRY_SECONDS", "120"))
CELERY_BEAT_SCHEDULE = {
    "reconcile-game-tables": {
        "task": "apps.games.tasks.reconcile_game_tables",
        "schedule": 30.0,
    }
}

TABLE_RESERVATION_EXPIRY_SECONDS = int(
    os.getenv("TABLE_RESERVATION_EXPIRY_SECONDS", "120")
)
