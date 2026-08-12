from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import NotificationPreference

FIELDS = ("game_invites", "matchmaking", "table_turns", "product_updates")


def preferences_payload(preferences):
    return {field: getattr(preferences, field) for field in FIELDS}


class NotificationPreferencesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        preferences, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return Response(preferences_payload(preferences))

    def patch(self, request):
        preferences, _ = NotificationPreference.objects.get_or_create(user=request.user)
        for field in FIELDS:
            if field in request.data:
                value = request.data[field]
                if not isinstance(value, bool):
                    return Response(
                        {"detail": f"La préférence {field} doit être booléenne."},
                        status=400,
                    )
                setattr(preferences, field, value)
        preferences.save(update_fields=[*FIELDS, "updated_at"])
        return Response(preferences_payload(preferences))
