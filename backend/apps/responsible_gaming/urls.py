from django.urls import path

from .views import (
    BackofficeResponsibleGamingListView,
    ResponsibleGamingCoolingOffView,
    ResponsibleGamingSelfExclusionView,
    ResponsibleGamingStatusView,
)

urlpatterns = [
    path("status/", ResponsibleGamingStatusView.as_view(), name="rg-status"),
    path("limits/", ResponsibleGamingStatusView.as_view(), name="rg-limits"),
    path("cooling-off/", ResponsibleGamingCoolingOffView.as_view(), name="rg-cooling-off"),
    path("self-exclude/", ResponsibleGamingSelfExclusionView.as_view(), name="rg-self-exclude"),
    path("backoffice/exclusions/", BackofficeResponsibleGamingListView.as_view(), name="backoffice-rg-exclusions"),
]
