import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("support", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="PilotFeedback",
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
                ("rating", models.PositiveSmallIntegerField()),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("gameplay", "Expérience de jeu"),
                            ("connection", "Connexion"),
                            ("clarity", "Clarté"),
                            ("other", "Autre"),
                        ],
                        max_length=20,
                    ),
                ),
                ("message", models.TextField(max_length=1000)),
                ("game_type", models.CharField(blank=True, max_length=40)),
                ("table_id", models.CharField(blank=True, max_length=120)),
                ("session_id", models.CharField(blank=True, max_length=128)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="pilot_feedback",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "pilot_feedback", "ordering": ["-created_at"]},
        )
    ]
