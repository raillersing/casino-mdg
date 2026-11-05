import requests
from django.conf import settings


def engine_activity():
    response = requests.get(
        settings.GAME_ENGINE_INTERNAL_URL.rstrip("/") + "/internal/live-activity",
        headers={"X-Game-Engine-Secret": settings.GAME_ENGINE_RESULT_SECRET},
        timeout=3,
    )
    response.raise_for_status()
    tables = response.json().get("tables")
    if not isinstance(tables, dict):
        raise ValueError("Invalid engine activity")
    return tables
