import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("games", "0012_gametable_access_code_gametable_rules_config_and_more"),
    ]
    operations = [
        migrations.CreateModel(
            name="HumanGameActivity",
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
                (
                    "game_type",
                    models.CharField(
                        max_length=20,
                        choices=[
                            ("poker", "Poker"),
                            ("belote", "Belote"),
                            ("rami", "Rami"),
                            ("ludo", "Ludo"),
                            ("domino", "Domino"),
                        ],
                    ),
                ),
                ("day", models.DateField()),
                ("first_seen_at", models.DateTimeField()),
                ("last_seen_at", models.DateTimeField(db_index=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        fields=("user", "game_type", "day"),
                        name="unique_human_game_day",
                    )
                ],
                "indexes": [
                    models.Index(
                        fields=["game_type", "last_seen_at"],
                        name="human_game_activity_window",
                    )
                ],
            },
        )
    ]
