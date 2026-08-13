from django.urls import path

from .views import (
    PilotActionView,
    PilotFeedbackSummaryView,
    PilotFeedbackView,
    SupportTicketStaffView,
    SupportTicketView,
)

urlpatterns = [
    path("tickets/", SupportTicketView.as_view(), name="support-tickets"),
    path(
        "tickets/staff/", SupportTicketStaffView.as_view(), name="support-tickets-staff"
    ),
    path(
        "tickets/staff/<int:ticket_id>/",
        SupportTicketStaffView.as_view(),
        name="support-ticket-status",
    ),
    path("feedback/", PilotFeedbackView.as_view(), name="pilot-feedback"),
    path(
        "feedback/summary/",
        PilotFeedbackSummaryView.as_view(),
        name="pilot-feedback-summary",
    ),
    path("pilot-actions/", PilotActionView.as_view(), name="pilot-actions"),
    path(
        "pilot-actions/<int:action_id>/",
        PilotActionView.as_view(),
        name="pilot-action-status",
    ),
]
