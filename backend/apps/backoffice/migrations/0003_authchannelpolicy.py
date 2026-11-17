import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("backoffice", "0002_featureflag"),
        ("accounts", "0004_user_email_verified_emailotp"),
    ]

    operations = [
        migrations.CreateModel(
            name="AuthChannelPolicy",
            fields=[
                (
                    "id",
                    models.PositiveSmallIntegerField(
                        default=1, editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "mode",
                    models.CharField(
                        choices=[
                            ("email", "Email"),
                            ("sms", "SMS"),
                            ("both", "Email et SMS"),
                            ("none", "Désactivés"),
                        ],
                        default="both",
                        max_length=8,
                    ),
                ),
                ("revision", models.PositiveIntegerField(default=1)),
                ("reason", models.CharField(blank=True, max_length=255)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="auth_channel_policy_changes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "auth_channel_policy",
            },
        ),
        migrations.AddConstraint(
            model_name="authchannelpolicy",
            constraint=models.CheckConstraint(
                condition=models.Q(("id", 1)), name="auth_channel_singleton"
            ),
        ),
    ]
