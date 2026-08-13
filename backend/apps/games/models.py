import uuid

from django.conf import settings
from django.db import models

from .modes import GAME_MODES, HUMAN_MATCH


class GameTable(models.Model):
    GAME_TYPES = [("poker", "Poker"), ("belote", "Belote"), ("rami", "Rami")]
    STATUSES = [("open", "Ouverte"), ("running", "En cours"), ("finished", "Terminée")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    table_code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=80)
    game_type = models.CharField(max_length=20, choices=GAME_TYPES)
    stakes = models.CharField(max_length=40, default="Gratuit")
    max_players = models.PositiveSmallIntegerField(default=4)
    status = models.CharField(max_length=20, choices=STATUSES, default="open")
    mode = models.CharField(max_length=24, choices=GAME_MODES, default=HUMAN_MATCH)
    is_private = models.BooleanField(default=False)
    club = models.ForeignKey(
        "clubs.Club",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="tables",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_tables",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "game_tables"
        ordering = ["-updated_at"]

    @property
    def player_count(self):
        return self.seats.count()


class TableSeat(models.Model):
    table = models.ForeignKey(GameTable, on_delete=models.CASCADE, related_name="seats")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="table_seats"
    )
    seat_index = models.PositiveSmallIntegerField()
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "table_seats"
        constraints = [
            models.UniqueConstraint(
                fields=["table", "user"], name="unique_table_player"
            ),
            models.UniqueConstraint(
                fields=["table", "seat_index"], name="unique_table_seat"
            ),
        ]


class BotSimulationSession(models.Model):
    STATUS_CHOICES = [
        ("queued", "En attente"),
        ("running", "En cours"),
        ("completed", "Terminée"),
        ("cancelled", "Annulée"),
    ]
    PROFILE_CHOICES = [
        ("tutorial", "Tutoriel"),
        ("balanced", "Équilibré"),
        ("expert", "Expert"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bot_simulation_sessions",
    )
    table = models.OneToOneField(
        "GameTable", on_delete=models.CASCADE, related_name="bot_simulation"
    )
    game_type = models.CharField(max_length=20, choices=GameTable.GAME_TYPES)
    profile = models.CharField(
        max_length=20, choices=PROFILE_CHOICES, default="balanced"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    idempotency_key = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "bot_simulation_sessions"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "idempotency_key"],
                name="unique_bot_simulation_request",
            )
        ]


class BotSimulationParticipant(models.Model):
    session = models.ForeignKey(
        BotSimulationSession, on_delete=models.CASCADE, related_name="bots"
    )
    bot_key = models.CharField(max_length=40)
    display_name = models.CharField(max_length=80)
    seat_index = models.PositiveSmallIntegerField()
    profile = models.CharField(
        max_length=20, choices=BotSimulationSession.PROFILE_CHOICES
    )
    is_bot = models.BooleanField(default=True)

    class Meta:
        db_table = "bot_simulation_participants"
        constraints = [
            models.UniqueConstraint(
                fields=["session", "seat_index"], name="unique_bot_simulation_seat"
            ),
            models.UniqueConstraint(
                fields=["session", "bot_key"], name="unique_bot_simulation_bot"
            ),
        ]


class GameResult(models.Model):
    OUTCOMES = [("win", "Victoire"), ("loss", "Défaite"), ("draw", "Égalité")]
    game_id = models.UUIDField(unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="game_results"
    )
    game_type = models.CharField(max_length=20, choices=GameTable.GAME_TYPES)
    outcome = models.CharField(max_length=10, choices=OUTCOMES)
    amount = models.PositiveBigIntegerField(default=0)
    transaction = models.ForeignKey(
        "wallet.WalletTransaction",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="game_results",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "game_results"
        ordering = ["-created_at"]


class DailyRewardClaim(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="daily_reward_claims",
    )
    mission_key = models.CharField(max_length=40)
    mission_date = models.DateField()
    amount = models.PositiveBigIntegerField()
    transaction = models.ForeignKey(
        "wallet.WalletTransaction",
        on_delete=models.PROTECT,
        related_name="daily_reward_claims",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "daily_reward_claims"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "mission_key", "mission_date"],
                name="unique_daily_reward_claim",
            )
        ]


class InstantGameDefinition(models.Model):
    STATUSES = [("active", "Active"), ("paused", "En pause")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=100)
    game_type = models.CharField(max_length=30)
    version = models.CharField(max_length=30)
    cost = models.PositiveBigIntegerField(default=0)
    max_prize = models.PositiveBigIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUSES, default="active")
    rules = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "instant_game_definitions"
        ordering = ["slug"]


class InstantPlay(models.Model):
    STATUSES = [("completed", "Terminée"), ("failed", "Échouée")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="instant_plays"
    )
    game = models.ForeignKey(
        InstantGameDefinition, on_delete=models.PROTECT, related_name="plays"
    )
    idempotency_key = models.CharField(max_length=120, unique=True)
    status = models.CharField(max_length=20, choices=STATUSES)
    result_kind = models.CharField(max_length=40)
    result_label = models.CharField(max_length=120)
    cost = models.PositiveBigIntegerField(default=0)
    prize = models.PositiveBigIntegerField(default=0)
    transaction = models.ForeignKey(
        "wallet.WalletTransaction",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="instant_plays",
    )
    audit = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "instant_plays"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]


class DrawDefinition(models.Model):
    STATUSES = [
        ("open", "Ouvert"),
        ("closed", "Clôturé"),
        ("drawn", "Tiré"),
        ("settled", "Réglé"),
        ("cancelled", "Annulé"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=100)
    draw_type = models.CharField(max_length=30)
    version = models.CharField(max_length=30)
    status = models.CharField(max_length=20, choices=STATUSES, default="open")
    entry_cost = models.PositiveBigIntegerField(default=0)
    closes_at = models.DateTimeField()
    rules = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "draw_definitions"
        ordering = ["closes_at"]


class DrawEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    draw = models.ForeignKey(
        DrawDefinition, on_delete=models.PROTECT, related_name="entries"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="draw_entries"
    )
    idempotency_key = models.CharField(max_length=120, unique=True)
    numbers = models.JSONField(default=list)
    transaction = models.ForeignKey(
        "wallet.WalletTransaction",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="draw_entries",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "draw_entries"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["draw", "user"])]


class DrawResult(models.Model):
    draw = models.OneToOneField(
        DrawDefinition, on_delete=models.PROTECT, related_name="result"
    )
    numbers = models.JSONField(default=list)
    commitment = models.CharField(max_length=128)
    proof = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "draw_results"


class PlayerPresence(models.Model):
    STATUS_CHOICES = [("online", "En ligne"), ("searching", "Recherche")]
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="game_presence"
    )
    game_type = models.CharField(
        max_length=20, choices=GameTable.GAME_TYPES, null=True, blank=True
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="online")
    last_seen_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "game_player_presence"
        indexes = [models.Index(fields=["game_type", "last_seen_at"])]


class MatchmakingTicket(models.Model):
    STATUS_CHOICES = [
        ("queued", "En file"),
        ("matched", "Associé"),
        ("cancelled", "Annulé"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="matchmaking_tickets",
    )
    game_type = models.CharField(max_length=20, choices=GameTable.GAME_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    matched_table = models.ForeignKey(
        GameTable,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="matchmaking_tickets",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "matchmaking_tickets"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "game_type"],
                condition=models.Q(status="queued"),
                name="one_queued_ticket_per_game",
            )
        ]
        indexes = [models.Index(fields=["game_type", "status", "created_at"])]
