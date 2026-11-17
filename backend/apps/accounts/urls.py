from django.urls import path

from .methods_views import PublicAuthMethodsView

from .email_views import (
    RequestEmailBindingView,
    RequestEmailOTPView,
    VerifyEmailBindingView,
    VerifyEmailOTPView,
)
from .views import (
    GuestTokenView,
    MeView,
    RefreshTokenView,
    RegisterDeviceView,
    RequestOTPView,
    VerifyOTPView,
)

urlpatterns = [
    path("methods/", PublicAuthMethodsView.as_view(), name="auth-methods"),
    path("otp/request/", RequestOTPView.as_view(), name="otp-request"),
    path("email/request/", RequestEmailOTPView.as_view(), name="email-otp-request"),
    path("email/verify/", VerifyEmailOTPView.as_view(), name="email-otp-verify"),
    path(
        "me/email/request/",
        RequestEmailBindingView.as_view(),
        name="email-bind-request",
    ),
    path(
        "me/email/verify/", VerifyEmailBindingView.as_view(), name="email-bind-verify"
    ),
    path("otp/verify/", VerifyOTPView.as_view(), name="otp-verify"),
    path("guest/", GuestTokenView.as_view(), name="guest-token"),
    path("me/", MeView.as_view(), name="me"),
    path("refresh/", RefreshTokenView.as_view(), name="refresh-token"),
    path("devices/", RegisterDeviceView.as_view(), name="register-device"),
]
