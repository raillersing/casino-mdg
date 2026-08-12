import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [("accounts", "0002_otp_request_uuid")]
    operations = [
        migrations.CreateModel(
            name="GameTable",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("table_code", models.CharField(max_length=32, unique=True)),
                ("name", models.CharField(max_length=80)),
                (
                    "game_type",
                    models.CharField(
                        choices=[
                            ("poker", "Poker"),
                            ("belote", "Belote"),
                            ("rami", "Rami"),
                        ],
                        max_length=20,
                    ),
                ),
                ("stakes", models.CharField(default="Gratuit", max_length=40)),
                ("max_players", models.PositiveSmallIntegerField(default=4)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("open", "Ouverte"),
                            ("running", "En cours"),
                            ("finished", "Terminée"),
                        ],
                        default="open",
                        max_length=20,
                    ),
                ),
                ("is_private", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_tables",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "game_tables", "ordering": ["-updated_at"]},
        ),
        migrations.CreateModel(
            name="TableSeat",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("seat_index", models.PositiveSmallIntegerField()),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                (
                    "table",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="seats",
                        to="games.gametable",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="table_seats",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "table_seats"},
        ),
        migrations.AddConstraint(
            model_name="tableseat",
            constraint=models.UniqueConstraint(
                fields=("table", "user"), name="unique_table_player"
            ),
        ),
        migrations.AddConstraint(
            model_name="tableseat",
            constraint=models.UniqueConstraint(
                fields=("table", "seat_index"), name="unique_table_seat"
            ),
        ),
    ]
