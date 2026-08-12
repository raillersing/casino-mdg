from django.urls import path

from .views import PilotGateSummaryView, ProductEventCreateView, ProductEventSummaryView

urlpatterns = [
    path("events/", ProductEventCreateView.as_view(), name="product-event"),
    path("summary/", ProductEventSummaryView.as_view(), name="product-event-summary"),
    path("pilot-gate/", PilotGateSummaryView.as_view(), name="pilot-gate-summary"),
]
