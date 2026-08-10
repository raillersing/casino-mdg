"""
URL configuration for Casino MDG backend.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
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
