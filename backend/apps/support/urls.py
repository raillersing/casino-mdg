from django.urls import path

from .views import SupportTicketView

urlpatterns = [path("tickets/", SupportTicketView.as_view(), name="support-tickets")]
