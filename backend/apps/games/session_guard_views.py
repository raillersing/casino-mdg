"""Authenticated engine-only account state check for WebSocket revocation.

The Game Engine calls this endpoint at handshake and during live sessions.
Never expose the shared secret or account status to browser clients.
"""

import hmac

from django.conf import settings
from django.http import JsonResponse
from rest_framework import permissions
from rest_framework.views import APIView

from apps.accounts.models import User


class InternalPlayerSessionView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = []

    def dispatch(self, request, *args, **kwargs):
        expected = getattr(settings, "GAME_ENGINE_RESULT_SECRET", "")
        presented = request.headers.get("X-Game-Engine-Secret", "")
        if not expected or not hmac.compare_digest(expected, presented):
            response = JsonResponse({"detail": "Non autorisé."}, status=403)
            response["Cache-Control"] = "no-store"
            return response
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, player_id):
        account = (
            User.objects.filter(pk=player_id)
            .values("is_active", "token_version")
            .first()
        )
        if account is None:
            response = JsonResponse({"detail": "Compte introuvable."}, status=404)
        else:
            response = JsonResponse(
                {
                    "active": account["is_active"],
                    "token_version": account["token_version"],
                }
            )
        response["Cache-Control"] = "no-store"
        return response
