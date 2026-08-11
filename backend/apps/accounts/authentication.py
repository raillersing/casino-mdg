import os
from datetime import datetime, timezone

import jwt
from rest_framework import authentication, exceptions

from .models import User


def encode_token(user, token_type="access", lifetime_seconds=900):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(user.pk), "type": token_type, "iat": now, "exp": now.timestamp() + lifetime_seconds},
        os.getenv("JWT_SECRET", "dev-jwt-secret"),
        algorithm="HS256",
    )


class JWTAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).split()
        if not header:
            return None
        if len(header) != 2 or header[0].lower() != self.keyword.lower().encode():
            raise exceptions.AuthenticationFailed("Format Authorization invalide")
        try:
            payload = jwt.decode(header[1], os.getenv("JWT_SECRET", "dev-jwt-secret"), algorithms=["HS256"])
            if payload.get("type") != "access":
                raise exceptions.AuthenticationFailed("Token non utilisable")
            user = User.objects.get(pk=payload["sub"], is_active=True)
        except (jwt.InvalidTokenError, User.DoesNotExist, KeyError) as exc:
            raise exceptions.AuthenticationFailed("Token invalide ou expiré") from exc
        return user, header[1]

    def authenticate_header(self, request):
        return self.keyword
