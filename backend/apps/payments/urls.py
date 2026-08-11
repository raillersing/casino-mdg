urlpatterns = []
from django.urls import path

from .views import PaymentIntentView, PaymentWebhookView

urlpatterns = [path("webhooks/<str:provider>/", PaymentWebhookView.as_view(), name="payment-webhook"), path("intents/", PaymentIntentView.as_view(), name="payment-intents")]
