from django.urls import path

from .views import ProductEventCreateView, ProductEventSummaryView

urlpatterns = [
    path("events/", ProductEventCreateView.as_view(), name="product-event"),
    path("summary/", ProductEventSummaryView.as_view(), name="product-event-summary"),
]
