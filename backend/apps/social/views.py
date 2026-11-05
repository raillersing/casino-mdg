from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.backoffice.services import record_audit
from apps.games.models import GameTable, TableSeat
from apps.games.services import join_table

from .models import (
    ChatMessage,
    DirectConversation,
    DirectMessage,
    Friendship,
    TableInvitation,
)

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


class TableInvitationAcceptView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, token):
        with transaction.atomic():
            try:
                invitation = (
                    TableInvitation.objects.select_for_update()
                    .select_related("table")
                    .get(token=token)
                )
            except TableInvitation.DoesNotExist:
                return Response({"detail": "Invitation introuvable."}, status=404)
            now = timezone.now()
            if invitation.expires_at <= now:
                if invitation.status == "pending":
                    invitation.status = "expired"
                    invitation.save(update_fields=["status"])
                return Response({"detail": "Cette invitation a expiré."}, status=410)
            if invitation.status == "accepted":
                if invitation.invitee_id == request.user.pk:
                    return Response(
                        {"table_id": str(invitation.table_id), "created": False},
                        status=200,
                    )
                return Response({"detail": "Invitation déjà utilisée."}, status=409)
            try:
                seat, created = join_table(invitation.table, request.user)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=409)
            invitation.invitee = request.user
            invitation.status = "accepted"
            invitation.save(update_fields=["invitee", "status"])
            record_audit(
                request.user,
                "table.invitation.accepted",
                invitation,
                {"table_id": str(invitation.table_id), "created": created},
            )
            return Response(
                {
                    "table_id": str(invitation.table_id),
                    "table_code": invitation.table.table_code,
                    "seat_index": seat.seat_index,
                    "created": created,
                },
                status=201,
            )


User = get_user_model()


class FriendshipListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        # Accepted friends
        friendships = Friendship.objects.filter(
            Q(requester=user) | Q(addressee=user),
            status="accepted",
        ).select_related("requester", "addressee")

        friends_data = []
        for f in friendships:
            friend = f.addressee if f.requester_id == user.pk else f.requester
            active_seat = (
                TableSeat.objects.filter(user=friend)
                .select_related("table")
                .first()
            )
            friends_data.append(
                {
                    "friendship_id": f.pk,
                    "id": friend.pk,
                    "display_name": friend.display_name,
                    "avatar": getattr(friend, "avatar", ""),
                    "level": getattr(friend, "level", 1),
                    "is_online": bool(
                        friend.last_login
                        and (timezone.now() - friend.last_login).total_seconds() < 600
                    ),
                    "current_table": {
                        "id": str(active_seat.table.pk),
                        "name": active_seat.table.name,
                        "game_type": active_seat.table.game_type,
                    }
                    if active_seat
                    else None,
                }
            )

        # Pending received requests
        pending_received = Friendship.objects.filter(
            addressee=user, status="pending"
        ).select_related("requester")
        received_data = [
            {
                "friendship_id": f.pk,
                "id": f.requester.pk,
                "display_name": f.requester.display_name,
                "avatar": getattr(f.requester, "avatar", ""),
                "created_at": f.created_at.isoformat(),
            }
            for f in pending_received
        ]

        # Pending sent requests
        pending_sent = Friendship.objects.filter(
            requester=user, status="pending"
        ).select_related("addressee")
        sent_data = [
            {
                "friendship_id": f.pk,
                "id": f.addressee.pk,
                "display_name": f.addressee.display_name,
                "avatar": getattr(f.addressee, "avatar", ""),
                "created_at": f.created_at.isoformat(),
            }
            for f in pending_sent
        ]

        return Response(
            {
                "friends": friends_data,
                "pending_received": received_data,
                "pending_sent": sent_data,
            }
        )

    def post(self, request):
        user = request.user
        target_query = str(request.data.get("target", "")).strip()
        if not target_query:
            return Response(
                {"detail": "Le pseudo ou identifiant est requis."}, status=400
            )

        target_user = User.objects.filter(
            Q(display_name__iexact=target_query) | Q(phone=target_query)
        ).first()
        if not target_user and target_query.isdigit():
            target_user = User.objects.filter(pk=int(target_query)).first()

        if not target_user:
            return Response({"detail": "Joueur introuvable."}, status=404)
        if target_user.pk == user.pk:
            return Response(
                {"detail": "Vous ne pouvez pas vous ajouter vous-même."}, status=400
            )

        existing = Friendship.objects.filter(
            Q(requester=user, addressee=target_user)
            | Q(requester=target_user, addressee=user)
        ).first()

        if existing:
            if existing.status == "accepted":
                return Response({"detail": "Vous êtes déjà amis."}, status=409)
            if existing.status == "pending":
                if existing.addressee_id == user.pk:
                    existing.status = "accepted"
                    existing.save(update_fields=["status", "updated_at"])
                    return Response(
                        {"detail": "Demande acceptée en retour !"}, status=200
                    )
                return Response(
                    {"detail": "Une demande est déjà en attente."}, status=409
                )
            if existing.status == "blocked":
                return Response(
                    {"detail": "Impossible d'envoyer la demande."}, status=403
                )
            existing.requester = user
            existing.addressee = target_user
            existing.status = "pending"
            existing.save(
                update_fields=["requester", "addressee", "status", "updated_at"]
            )
            return Response({"detail": "Demande d'ami envoyée !"}, status=201)

        Friendship.objects.create(
            requester=user, addressee=target_user, status="pending"
        )
        return Response(
            {"detail": "Demande d'ami envoyée avec succès !"}, status=201
        )


class FriendshipActionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, friendship_id, action):
        user = request.user
        try:
            friendship = Friendship.objects.get(pk=friendship_id)
        except Friendship.DoesNotExist:
            return Response({"detail": "Relation introuvable."}, status=404)

        if user.pk not in (friendship.requester_id, friendship.addressee_id):
            return Response({"detail": "Accès refusé."}, status=403)

        if action == "accept":
            if friendship.addressee_id != user.pk:
                return Response(
                    {"detail": "Seul le destinataire peut accepter."}, status=403
                )
            friendship.status = "accepted"
            friendship.save(update_fields=["status", "updated_at"])
            return Response({"detail": "Demande d'ami acceptée !"})

        elif action == "reject":
            if friendship.addressee_id != user.pk:
                return Response({"detail": "Action non autorisée."}, status=403)
            friendship.status = "rejected"
            friendship.save(update_fields=["status", "updated_at"])
            return Response({"detail": "Demande refusée."})

        elif action == "block":
            friendship.status = "blocked"
            friendship.save(update_fields=["status", "updated_at"])
            return Response({"detail": "Utilisateur bloqué."})

        elif action == "unfriend":
            friendship.delete()
            return Response({"detail": "Ami retiré."})

        return Response({"detail": "Action inconnue."}, status=400)


class FriendTableInviteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, friend_id):
        user = request.user
        table_id = request.data.get("table_id")
        if not table_id:
            return Response({"detail": "Identifiant de table requis."}, status=400)

        try:
            table = GameTable.objects.get(pk=table_id)
        except GameTable.DoesNotExist:
            return Response({"detail": "Table introuvable."}, status=404)

        try:
            friend = User.objects.get(pk=friend_id)
        except User.DoesNotExist:
            return Response({"detail": "Ami introuvable."}, status=404)

        is_friend = Friendship.objects.filter(
            Q(requester=user, addressee=friend, status="accepted")
            | Q(requester=friend, addressee=user, status="accepted")
        ).exists()

        if not is_friend:
            return Response(
                {"detail": "Cet utilisateur ne fait pas partie de vos amis."},
                status=403,
            )

        invitation = TableInvitation.objects.create(
            table=table,
            inviter=user,
            invitee=friend,
            expires_at=timezone.now() + timedelta(hours=24),
        )
        return Response(
            {
                "token": str(invitation.token),
                "table_id": str(table.pk),
                "friend_name": friend.display_name,
                "expires_at": invitation.expires_at.isoformat(),
            },
            status=201,
        )


class DirectConversationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        conversations = DirectConversation.objects.filter(
            Q(user1=user) | Q(user2=user)
        ).select_related("user1", "user2")

        data = []
        for conv in conversations:
            other = conv.user2 if conv.user1_id == user.pk else conv.user1
            last_msg = conv.messages.order_by("-created_at").first()
            unread = conv.messages.filter(is_read=False).exclude(sender=user).count()
            data.append(
                {
                    "id": str(conv.id),
                    "other_user": {
                        "id": other.pk,
                        "display_name": other.display_name,
                        "avatar": getattr(other, "avatar", ""),
                        "is_online": bool(
                            other.last_login
                            and (timezone.now() - other.last_login).total_seconds()
                            < 600
                        ),
                    },
                    "last_message": {
                        "body": last_msg.body,
                        "sender_id": last_msg.sender_id,
                        "created_at": last_msg.created_at.isoformat(),
                    }
                    if last_msg
                    else None,
                    "unread_count": unread,
                    "updated_at": conv.updated_at.isoformat(),
                }
            )
        return Response({"conversations": data})

    def post(self, request):
        user = request.user
        target_id = request.data.get("target_user_id")
        if not target_id:
            return Response(
                {"detail": "Identifiant utilisateur requis."}, status=400
            )

        try:
            target_user = User.objects.get(pk=target_id)
        except User.DoesNotExist:
            return Response({"detail": "Utilisateur introuvable."}, status=404)

        if target_user.pk == user.pk:
            return Response(
                {"detail": "Action impossible avec soi-même."}, status=400
            )

        u1, u2 = (
            (user, target_user)
            if user.pk < target_user.pk
            else (target_user, user)
        )
        conv, _ = DirectConversation.objects.get_or_create(user1=u1, user2=u2)

        return Response(
            {
                "id": str(conv.id),
                "other_user": {
                    "id": target_user.pk,
                    "display_name": target_user.display_name,
                    "avatar": getattr(target_user, "avatar", ""),
                },
            },
            status=200,
        )


class DirectConversationMessagesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        user = request.user
        try:
            conv = DirectConversation.objects.select_related(
                "user1", "user2"
            ).get(id=conversation_id)
        except DirectConversation.DoesNotExist:
            return Response({"detail": "Conversation introuvable."}, status=404)

        if user.pk not in (conv.user1_id, conv.user2_id):
            return Response({"detail": "Accès refusé."}, status=403)

        conv.messages.filter(is_read=False).exclude(sender=user).update(
            is_read=True
        )

        messages = conv.messages.order_by("created_at")[:100]
        return Response(
            {
                "results": [
                    {
                        "id": str(m.id),
                        "sender_id": m.sender_id,
                        "body": m.body,
                        "created_at": m.created_at.isoformat(),
                    }
                    for m in messages
                ]
            }
        )

    def post(self, request, conversation_id):
        user = request.user
        try:
            conv = DirectConversation.objects.get(id=conversation_id)
        except DirectConversation.DoesNotExist:
            return Response({"detail": "Conversation introuvable."}, status=404)

        if user.pk not in (conv.user1_id, conv.user2_id):
            return Response({"detail": "Accès refusé."}, status=403)

        body = str(request.data.get("body", "")).strip()
        if not body or len(body) > 1000:
            return Response({"detail": "Message invalide."}, status=400)

        msg = DirectMessage.objects.create(
            conversation=conv,
            sender=user,
            body=body,
        )
        conv.save(update_fields=["updated_at"])

        return Response(
            {
                "id": str(msg.id),
                "sender_id": msg.sender_id,
                "body": msg.body,
                "created_at": msg.created_at.isoformat(),
            },
            status=201,
        )
