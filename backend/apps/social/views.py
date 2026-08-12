from datetime import timedelta

from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.backoffice.services import record_audit
from apps.games.models import GameTable, TableSeat

from .models import ChatMessage, TableInvitation

BLOCKED_WORDS = {"spam", "scam"}


def can_access(table, user):
    return (
        TableSeat.objects.filter(table=table, user=user).exists()
        or table.created_by_id == user.pk
    )


class TableChatView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_table(self, request, table_id):
        try:
            table = GameTable.objects.get(pk=table_id)
        except GameTable.DoesNotExist:
            return None
        return table if can_access(table, request.user) else False

    def get(self, request, table_id):
        table = self.get_table(request, table_id)
        if table is None:
            return Response({"detail": "Table introuvable."}, status=404)
        if table is False:
            return Response({"detail": "Accès refusé."}, status=403)
        messages = ChatMessage.objects.filter(
            table=table, is_hidden=False
        ).select_related("author")[:100]
        return Response(
            {
                "results": [
                    {
                        "id": item.pk,
                        "author": item.author.display_name,
                        "body": item.body,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in messages
                ]
            }
        )

    def post(self, request, table_id):
        table = self.get_table(request, table_id)
        if table is None:
            return Response({"detail": "Table introuvable."}, status=404)
        if table is False:
            return Response({"detail": "Accès refusé."}, status=403)
        body = str(request.data.get("body", "")).strip()
        if not body or len(body) > 500:
            return Response({"detail": "Message invalide."}, status=400)
        if any(word in body.lower().split() for word in BLOCKED_WORDS):
            ChatMessage.objects.create(
                table=table, author=request.user, body=body, is_hidden=True
            )
            return Response({"detail": "Message bloqué par la modération."}, status=400)
        message = ChatMessage.objects.create(
            table=table, author=request.user, body=body
        )
        return Response(
            {
                "id": message.pk,
                "author": message.author.display_name,
                "body": message.body,
                "created_at": message.created_at.isoformat(),
            },
            status=201,
        )


class TableInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, table_id):
        try:
            table = GameTable.objects.get(pk=table_id)
        except GameTable.DoesNotExist:
            return Response({"detail": "Table introuvable."}, status=404)
        if not can_access(table, request.user):
            return Response({"detail": "Seul un joueur peut inviter."}, status=403)
        invitation = TableInvitation.objects.create(
            table=table,
            inviter=request.user,
            expires_at=timezone.now() + timedelta(hours=24),
        )
        record_audit(
            request.user,
            "table.invitation.created",
            invitation,
            {"table_id": str(table.pk)},
        )
        return Response(
            {
                "token": str(invitation.token),
                "expires_at": invitation.expires_at.isoformat(),
            },
            status=201,
        )
