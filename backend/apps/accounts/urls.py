from django.urls import path

from .views import MeView, RegisterDeviceView, RequestOTPView, VerifyOTPView

urlpatterns = [
    path("otp/request/", RequestOTPView.as_view(), name="otp-request"),
    path("otp/verify/", VerifyOTPView.as_view(), name="otp-verify"),
    path("me/", MeView.as_view(), name="me"),
    path("devices/", RegisterDeviceView.as_view(), name="register-device"),
]
