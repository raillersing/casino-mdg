from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Club, ClubInvitation, ClubMembership


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
