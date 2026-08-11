import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_otp_request_uuid"),
        ("games", "0001_initial"),
        ("wallet", "0001_initial"),
    ]

    operations = [migrations.CreateModel(name="GameResult", fields=[
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
        ("game_id", models.UUIDField(unique=True)),
        ("game_type", models.CharField(choices=[("poker", "Poker"), ("belote", "Belote"), ("rami", "Rami")], max_length=20)),
        ("outcome", models.CharField(choices=[("win", "Victoire"), ("loss", "Défaite"), ("draw", "Égalité")], max_length=10)),
        ("amount", models.PositiveBigIntegerField(default=0)),
        ("metadata", models.JSONField(blank=True, default=dict)),
        ("created_at", models.DateTimeField(auto_now_add=True)),
        ("transaction", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="game_results", to="wallet.wallettransaction")),
        ("user", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="game_results", to=settings.AUTH_USER_MODEL)),
    ], options={"db_table": "game_results", "ordering": ["-created_at"]})]
