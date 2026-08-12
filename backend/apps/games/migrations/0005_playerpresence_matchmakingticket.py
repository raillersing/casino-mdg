from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [("games", "0004_drawdefinition_instantgamedefinition_drawresult_and_more")]

    operations = [
        migrations.CreateModel(
            name="PlayerPresence",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("game_type", models.CharField(blank=True, choices=[("poker", "Poker"), ("belote", "Belote"), ("rami", "Rami")], max_length=20, null=True)),
                ("status", models.CharField(choices=[("online", "En ligne"), ("searching", "Recherche")], default="online", max_length=20)),
                ("last_seen_at", models.DateTimeField()),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="game_presence", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "game_player_presence"},
        ),
        migrations.CreateModel(
            name="MatchmakingTicket",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("game_type", models.CharField(choices=[("poker", "Poker"), ("belote", "Belote"), ("rami", "Rami")], max_length=20)),
                ("status", models.CharField(choices=[("queued", "En file"), ("matched", "Associé"), ("cancelled", "Annulé")], default="queued", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("matched_table", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="matchmaking_tickets", to="games.gametable")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="matchmaking_tickets", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "matchmaking_tickets"},
        ),
        migrations.AddIndex(model_name="playerpresence", index=models.Index(fields=["game_type", "last_seen_at"], name="game_player_game_ty_03bfc7_idx")),
        migrations.AddIndex(model_name="matchmakingticket", index=models.Index(fields=["game_type", "status", "created_at"], name="matchmaking_game_ty_2cf27d_idx")),
        migrations.AddConstraint(model_name="matchmakingticket", constraint=models.UniqueConstraint(condition=models.Q(status="queued"), fields=("user", "game_type"), name="one_queued_ticket_per_game")),
    ]
