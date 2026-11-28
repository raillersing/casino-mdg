from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


class OTPRequestThrottle(SimpleRateThrottle):
    scope = "otp_request"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class OTPVerifyThrottle(SimpleRateThrottle):
    scope = "otp_verify"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class GuestCreationThrottle(AnonRateThrottle):
    """Limit new disposable identities; token refresh is a separate route."""

    scope = "guest_creation"
    rate = "5/minute"
