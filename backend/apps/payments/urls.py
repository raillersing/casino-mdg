urlpatterns = []
from django.urls import path

from .views import PaymentWebhookView

urlpatterns = [path("webhooks/<str:provider>/", PaymentWebhookView.as_view(), name="payment-webhook")]
