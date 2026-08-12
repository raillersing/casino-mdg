import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [("accounts", "0003_alter_user_managers_alter_user_last_login")]
    operations = [
        migrations.CreateModel(
            name="ProductEvent",
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
                ("event_name", models.CharField(max_length=80)),
                ("anonymous_id", models.CharField(blank=True, max_length=128)),
                ("session_id", models.CharField(blank=True, max_length=128)),
                ("mode", models.CharField(blank=True, max_length=40)),
                ("game_type", models.CharField(blank=True, max_length=40)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="product_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "product_events"},
        ),
        migrations.AddIndex(
            model_name="productevent",
            index=models.Index(
                fields=["event_name", "created_at"],
                name="product_ev_event_n_55d08d_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="productevent",
            index=models.Index(
                fields=["session_id", "created_at"],
                name="product_ev_session_3f14f4_idx",
            ),
        ),
    ]
