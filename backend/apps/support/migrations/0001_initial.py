import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [("accounts", "0002_otp_request_uuid")]
    operations = [
        migrations.CreateModel(
            name="SupportTicket",
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
                    "category",
                    models.CharField(
                        choices=[
                            ("account", "Compte"),
                            ("wallet", "Wallet"),
                            ("game", "Partie"),
                            ("other", "Autre"),
                        ],
                        max_length=20,
                    ),
                ),
                ("subject", models.CharField(max_length=120)),
                ("description", models.TextField(max_length=2000)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("open", "Ouvert"),
                            ("in_progress", "En cours"),
                            ("closed", "Fermé"),
                        ],
                        default="open",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="support_tickets",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "support_tickets", "ordering": ["-created_at"]},
        )
    ]
