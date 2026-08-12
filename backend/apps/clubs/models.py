import uuid

from django.conf import settings
from django.db import models


class Club(models.Model):
    VISIBILITY = [("open", "Ouvert"), ("invite", "Sur invitation")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    city = models.CharField(max_length=80, blank=True)
    description = models.CharField(max_length=280, blank=True)
    language = models.CharField(max_length=2, default="fr")
    visibility = models.CharField(max_length=10, choices=VISIBILITY, default="open")
    member_limit = models.PositiveIntegerField(default=50)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_clubs"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "clubs"
        ordering = ["-updated_at"]


class ClubMembership(models.Model):
    ROLES = [("owner", "Fondateur"), ("admin", "Administrateur"), ("member", "Membre")]
    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="club_memberships",
    )
    role = models.CharField(max_length=10, choices=ROLES, default="member")
    points = models.PositiveIntegerField(default=0)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "club_memberships"
        constraints = [
            models.UniqueConstraint(fields=["club", "user"], name="unique_club_member")
        ]


class ClubInvitation(models.Model):
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name="invitations")
    inviter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="club_invitations_sent",
    )
    status = models.CharField(max_length=10, default="pending")
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "club_invitations"


class ClubEvent(models.Model):
    STATUSES = [("scheduled", "Planifié"), ("completed", "Terminé")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=100)
    description = models.CharField(max_length=280, blank=True)
    starts_at = models.DateTimeField()
    capacity = models.PositiveIntegerField(default=16)
    points_reward = models.PositiveIntegerField(default=10)
    status = models.CharField(max_length=12, choices=STATUSES, default="scheduled")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="club_events_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "club_events"
        ordering = ["starts_at"]


class ClubEventParticipant(models.Model):
    event = models.ForeignKey(
        ClubEvent, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="club_event_participations",
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "club_event_participants"
        constraints = [
            models.UniqueConstraint(
                fields=["event", "user"], name="unique_club_event_participant"
            )
        ]
