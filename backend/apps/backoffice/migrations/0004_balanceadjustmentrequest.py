import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("backoffice", "0003_authchannelpolicy"),
        ("wallet", "0002_rename_wallet_trans_user_created_idx_wallet_tran_user_id_1da2e3_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="BalanceAdjustmentRequest",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False,
                        primary_key=True, serialize=False,
                    ),
                ),
                ("amount", models.PositiveBigIntegerField()),
                ("reason", models.TextField()),
                ("idempotency_key", models.CharField(max_length=160, unique=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "En attente"),
                            ("approved", "Approuvée"),
                            ("rejected", "Rejetée"),
                        ],
                        default="pending", max_length=12,
                    ),
                ),
                ("decision_reason", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("decided_at", models.DateTimeField(blank=True, null=True)),
                (
                    "player",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="sim_grant_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "requested_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="sim_grants_requested",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "decided_by",
                    models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="sim_grants_decided",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "transaction",
                    models.ForeignKey(
                        blank=True, null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="approved_sim_grants",
                        to="wallet.wallettransaction",
                    ),
                ),
            ],
            options={
                "db_table": "backoffice_sim_grants",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="balanceadjustmentrequest",
            constraint=models.CheckConstraint(
                condition=models.Q(("amount__gt", 0), ("amount__lte", 1000000)),
                name="sim_grant_amount_bounded",
            ),
        ),
    ]
