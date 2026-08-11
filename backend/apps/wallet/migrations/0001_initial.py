import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [("accounts", "0001_initial")]
    operations = [
        migrations.CreateModel(
            name="LedgerAccount",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("account_type", models.CharField(choices=[("player", "Joueur"), ("platform", "Plateforme"), ("bonus", "Bonus"), ("escrow", "Séquestre")], max_length=20)),
                ("currency_code", models.CharField(default="SIM", max_length=3)),
                ("balance", models.BigIntegerField(default=0)),
                ("held_balance", models.BigIntegerField(default=0)),
                ("status", models.CharField(default="active", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="ledger_accounts", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "ledger_accounts"},
        ),
        migrations.CreateModel(
            name="WalletTransaction",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("transaction_code", models.CharField(max_length=50, unique=True)),
                ("type", models.CharField(choices=[("deposit", "Dépôt"), ("withdrawal", "Retrait"), ("bonus", "Bonus"), ("game", "Partie"), ("refund", "Remboursement")], max_length=20)),
                ("direction", models.CharField(choices=[("credit", "Crédit"), ("debit", "Débit")], max_length=10)),
                ("amount", models.PositiveBigIntegerField()),
                ("currency_code", models.CharField(default="SIM", max_length=3)),
                ("status", models.CharField(choices=[("pending", "En attente"), ("completed", "Terminée"), ("failed", "Échouée"), ("reversed", "Annulée")], default="pending", max_length=20)),
                ("idempotency_key", models.CharField(blank=True, max_length=255, null=True, unique=True)),
                ("description", models.TextField(blank=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("destination_account", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="incoming_transactions", to="wallet.ledgeraccount")),
                ("source_account", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="outgoing_transactions", to="wallet.ledgeraccount")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="wallet_transactions", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "wallet_transactions", "ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="LedgerEntry",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("entry_type", models.CharField(choices=[("debit", "Débit"), ("credit", "Crédit")], max_length=10)),
                ("amount", models.PositiveBigIntegerField()),
                ("balance_after", models.BigIntegerField()),
                ("description", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("account", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="entries", to="wallet.ledgeraccount")),
                ("transaction", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="entries", to="wallet.wallettransaction")),
            ],
            options={"db_table": "ledger_entries", "ordering": ["created_at"]},
        ),
        migrations.AddConstraint(model_name="ledgeraccount", constraint=models.UniqueConstraint(fields=("user", "account_type", "currency_code"), name="unique_user_ledger_account")),
        migrations.AddConstraint(model_name="ledgeraccount", constraint=models.UniqueConstraint(condition=models.Q(user__isnull=True), fields=("account_type", "currency_code"), name="unique_system_ledger_account")),
        migrations.AddConstraint(model_name="ledgerentry", constraint=models.CheckConstraint(condition=models.Q(amount__gt=0), name="ledger_entry_amount_positive")),
        migrations.AddIndex(model_name="wallettransaction", index=models.Index(fields=["user", "-created_at"], name="wallet_trans_user_created_idx")),
        migrations.AddIndex(model_name="wallettransaction", index=models.Index(fields=["status"], name="wallet_trans_status_idx")),
    ]
