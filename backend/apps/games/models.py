import uuid

from django.conf import settings
from django.db import models


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
    is_private = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_tables")
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
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="table_seats")
    seat_index = models.PositiveSmallIntegerField()
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "table_seats"
        constraints = [
            models.UniqueConstraint(fields=["table", "user"], name="unique_table_player"),
            models.UniqueConstraint(fields=["table", "seat_index"], name="unique_table_seat"),
        ]
