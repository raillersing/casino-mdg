from django.urls import path

from .views import (
    PilotGateSummaryView,
    PilotParticipantStatusView,
    PilotParticipantsView,
    ProductEventCreateView,
    ProductEventSummaryView,
)

urlpatterns = [
    path("events/", ProductEventCreateView.as_view(), name="product-event"),
    path("summary/", ProductEventSummaryView.as_view(), name="product-event-summary"),
    path("pilot-gate/", PilotGateSummaryView.as_view(), name="pilot-gate-summary"),
    path(
        "pilot-participants/",
        PilotParticipantsView.as_view(),
        name="pilot-participants",
    ),
    path(
        "pilot-participants/<int:participant_id>/",
        PilotParticipantStatusView.as_view(),
        name="pilot-participant-status",
    ),
]
