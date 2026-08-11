"""
URL configuration for Casino MDG backend.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.db import connection


def healthz(request):
    return JsonResponse({"status": "ok"})


def readyz(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        return JsonResponse({"status": "unready", "database": "unavailable"}, status=503)
    return JsonResponse({"status": "ok", "database": "ok"})

urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    path("readyz/", readyz, name="readyz"),
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/wallet/", include("apps.wallet.urls")),
    path("api/v1/games/", include("apps.games.urls")),
    path("api/v1/social/", include("apps.social.urls")),
    path("api/v1/support/", include("apps.support.urls")),
    path("api/v1/kyc/", include("apps.kyc.urls")),
    path("api/v1/payments/", include("apps.payments.urls")),
    path("api/v1/backoffice/", include("apps.backoffice.urls")),
]
