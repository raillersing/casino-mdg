from django.urls import path

from .views import PilotFeedbackSummaryView, PilotFeedbackView, SupportTicketView

urlpatterns = [
    path("tickets/", SupportTicketView.as_view(), name="support-tickets"),
    path("feedback/", PilotFeedbackView.as_view(), name="pilot-feedback"),
    path(
        "feedback/summary/",
        PilotFeedbackSummaryView.as_view(),
        name="pilot-feedback-summary",
    ),
]
