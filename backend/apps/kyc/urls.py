from django.urls import path

from .views import KYCStatusView

urlpatterns = [path("status/", KYCStatusView.as_view(), name="kyc-status")]
