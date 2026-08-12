from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Club,
    ClubEvent,
    ClubEventParticipant,
    ClubInvitation,
    ClubMembership,
)


def membership_for(club, user):
    return ClubMembership.objects.filter(club=club, user=user).first()


def club_payload(club, user):
    membership = membership_for(club, user)
    return {
        "id": str(club.id),
        "name": club.name,
        "city": club.city,
        "description": club.description,
        "language": club.language,
        "visibility": club.visibility,
        "member_count": club.memberships.count(),
        "member_limit": club.member_limit,
        "joined": membership is not None,
        "role": membership.role if membership else None,
    }


def members_payload(club):
    return [
        {
            "user_id": str(membership.user_id),
            "display_name": membership.user.display_name,
            "role": membership.role,
            "joined_at": membership.joined_at.isoformat(),
        }
        for membership in club.memberships.select_related("user").order_by("joined_at")
    ]


def event_payload(event, user):
    return {
        "id": str(event.id),
        "title": event.title,
        "description": event.description,
        "starts_at": event.starts_at.isoformat(),
        "capacity": event.capacity,
        "participant_count": event.participants.count(),
        "points_reward": event.points_reward,
        "status": event.status,
        "joined": event.participants.filter(user=user).exists(),
    }


class ClubListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        clubs = Club.objects.filter(visibility="open")
        clubs |= Club.objects.filter(memberships__user=request.user)
        return Response(
            {"results": [club_payload(club, request.user) for club in clubs.distinct()]}
        )

    def post(self, request):
        name = str(request.data.get("name", "")).strip()
        if not name:
            return Response({"detail": "Le nom du club est obligatoire."}, status=400)
        visibility = request.data.get("visibility", "open")
        if visibility not in {"open", "invite"}:
            return Response({"detail": "Visibilité de club invalide."}, status=400)
        club = Club.objects.create(
            name=name[:80],
            city=str(request.data.get("city", ""))[:80],
            description=str(request.data.get("description", ""))[:280],
            language=(
                request.data.get("language", "fr")
                if request.data.get("language") in {"fr", "mg"}
                else "fr"
            ),
            visibility=visibility,
            owner=request.user,
        )
        ClubMembership.objects.create(club=club, user=request.user, role="owner")
        return Response(club_payload(club, request.user), status=201)


class ClubJoinView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, club_id):
        try:
            club = Club.objects.get(pk=club_id)
        except Club.DoesNotExist:
            return Response({"detail": "Club introuvable."}, status=404)
        if club.visibility != "open":
            return Response(
                {"detail": "Ce club est accessible sur invitation."}, status=403
            )
        membership, created = ClubMembership.objects.get_or_create(
            club=club, user=request.user
        )
        if created and club.memberships.count() > club.member_limit:
            membership.delete()
            return Response({"detail": "Ce club est complet."}, status=409)
        return Response(
            club_payload(club, request.user), status=201 if created else 200
        )


class ClubInvitationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, club_id):
        try:
            club = Club.objects.get(pk=club_id)
        except Club.DoesNotExist:
            return Response({"detail": "Club introuvable."}, status=404)
        membership = membership_for(club, request.user)
        if not membership or membership.role not in {"owner", "admin"}:
            return Response(
                {"detail": "Seuls les responsables peuvent inviter."}, status=403
            )
        invitation = ClubInvitation.objects.create(
            club=club,
            inviter=request.user,
            expires_at=timezone.now() + timedelta(hours=72),
        )
        return Response(
            {
                "token": str(invitation.token),
                "expires_at": invitation.expires_at.isoformat(),
            },
            status=201,
        )


class ClubInvitationAcceptView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, token):
        with transaction.atomic():
            try:
                invitation = (
                    ClubInvitation.objects.select_for_update()
                    .select_related("club")
                    .get(token=token)
                )
            except ClubInvitation.DoesNotExist:
                return Response(
                    {"detail": "Invitation de club introuvable."}, status=404
                )
            if (
                invitation.status != "pending"
                or invitation.expires_at <= timezone.now()
            ):
                invitation.status = "expired"
                invitation.save(update_fields=["status"])
                return Response(
                    {"detail": "Cette invitation de club a expiré."}, status=410
                )
            membership, created = ClubMembership.objects.get_or_create(
                club=invitation.club, user=request.user
            )
            if (
                created
                and invitation.club.memberships.count() > invitation.club.member_limit
            ):
                membership.delete()
                return Response({"detail": "Ce club est complet."}, status=409)
            invitation.status = "accepted"
            invitation.save(update_fields=["status"])
            return Response(
                club_payload(invitation.club, request.user),
                status=201 if created else 200,
            )


class ClubMembersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_club(self, club_id):
        try:
            return Club.objects.get(pk=club_id)
        except Club.DoesNotExist:
            return None

    def get(self, request, club_id):
        club = self.get_club(club_id)
        if not club:
            return Response({"detail": "Club introuvable."}, status=404)
        if not membership_for(club, request.user):
            return Response(
                {"detail": "Vous ne faites pas partie de ce club."}, status=403
            )
        return Response({"results": members_payload(club)})

    def mutate(self, request, club_id):
        club = self.get_club(club_id)
        if not club:
            return Response({"detail": "Club introuvable."}, status=404)
        actor = membership_for(club, request.user)
        if not actor or actor.role not in {"owner", "admin"}:
            return Response(
                {"detail": "Permission administrateur requise."}, status=403
            )
        try:
            target = ClubMembership.objects.get(
                club=club, user_id=request.data.get("user_id")
            )
        except ClubMembership.DoesNotExist:
            return Response({"detail": "Membre introuvable."}, status=404)
        if target.role == "owner" or target.user_id == request.user.pk:
            return Response(
                {"detail": "Le fondateur ne peut pas être modifié ici."}, status=409
            )
        if actor.role == "admin" and target.role == "admin":
            return Response(
                {"detail": "Seul le fondateur peut gérer un administrateur."},
                status=403,
            )
        if request.method == "PATCH":
            role = request.data.get("role")
            if role not in {"admin", "member"}:
                return Response({"detail": "Rôle invalide."}, status=400)
            target.role = role
            target.save(update_fields=["role"])
            return Response({"user_id": str(target.user_id), "role": target.role})
        target.delete()
        return Response(status=204)

    def patch(self, request, club_id):
        return self.mutate(request, club_id)

    def delete(self, request, club_id):
        return self.mutate(request, club_id)


class ClubEventsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_club(self, club_id):
        try:
            return Club.objects.get(pk=club_id)
        except Club.DoesNotExist:
            return None

    def get(self, request, club_id):
        club = self.get_club(club_id)
        if not club or not membership_for(club, request.user):
            return Response({"detail": "Accès club requis."}, status=403)
        events = club.events.filter(status="scheduled")
        return Response(
            {"results": [event_payload(event, request.user) for event in events]}
        )

    def post(self, request, club_id):
        club = self.get_club(club_id)
        actor = membership_for(club, request.user) if club else None
        if not club:
            return Response({"detail": "Club introuvable."}, status=404)
        if not actor or actor.role not in {"owner", "admin"}:
            return Response({"detail": "Permission responsable requise."}, status=403)
        title = str(request.data.get("title", "")).strip()
        if not title or not request.data.get("starts_at"):
            return Response({"detail": "Titre et date obligatoires."}, status=400)
        try:
            starts_at = timezone.datetime.fromisoformat(str(request.data["starts_at"]))
            if timezone.is_naive(starts_at):
                starts_at = timezone.make_aware(starts_at)
            capacity = min(max(int(request.data.get("capacity", 16)), 2), 250)
            points_reward = min(max(int(request.data.get("points_reward", 10)), 0), 100)
        except (TypeError, ValueError):
            return Response({"detail": "Paramètres d’événement invalides."}, status=400)
        if starts_at <= timezone.now():
            return Response({"detail": "La date doit être dans le futur."}, status=400)
        event = ClubEvent.objects.create(
            club=club,
            title=title[:100],
            description=str(request.data.get("description", ""))[:280],
            starts_at=starts_at,
            capacity=capacity,
            points_reward=points_reward,
            created_by=request.user,
        )
        return Response(event_payload(event, request.user), status=201)


class ClubEventJoinView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, event_id):
        try:
            event = ClubEvent.objects.select_related("club").get(pk=event_id)
        except ClubEvent.DoesNotExist:
            return Response({"detail": "Événement introuvable."}, status=404)
        if not membership_for(event.club, request.user):
            return Response(
                {"detail": "Vous ne faites pas partie de ce club."}, status=403
            )
        if event.status != "scheduled" or event.starts_at <= timezone.now():
            return Response({"detail": "Les inscriptions sont fermées."}, status=409)
        participant, created = ClubEventParticipant.objects.get_or_create(
            event=event, user=request.user
        )
        if created and event.participants.count() > event.capacity:
            participant.delete()
            return Response({"detail": "Cet événement est complet."}, status=409)
        return Response(
            event_payload(event, request.user), status=201 if created else 200
        )
