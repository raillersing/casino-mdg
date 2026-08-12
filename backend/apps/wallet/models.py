import uuid

from django.conf import settings
from django.db import models


class LedgerAccount(models.Model):
    ACCOUNT_TYPES = [
        ("player", "Joueur"),
        ("platform", "Plateforme"),
        ("bonus", "Bonus"),
        ("escrow", "Séquestre"),
    ]
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPES)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="ledger_accounts",
    )
    currency_code = models.CharField(max_length=3, default="SIM")
    balance = models.BigIntegerField(default=0)
    held_balance = models.BigIntegerField(default=0)
    status = models.CharField(max_length=20, default="active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ledger_accounts"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "account_type", "currency_code"],
                name="unique_user_ledger_account",
            ),
            models.UniqueConstraint(
                fields=["account_type", "currency_code"],
                condition=models.Q(user__isnull=True),
                name="unique_system_ledger_account",
            ),
        ]


class WalletTransaction(models.Model):
    TYPES = [
        ("deposit", "Dépôt"),
        ("withdrawal", "Retrait"),
        ("bonus", "Bonus"),
        ("game", "Partie"),
        ("refund", "Remboursement"),
    ]
    DIRECTIONS = [("credit", "Crédit"), ("debit", "Débit")]
    STATUSES = [
        ("pending", "En attente"),
        ("completed", "Terminée"),
        ("failed", "Échouée"),
        ("reversed", "Annulée"),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction_code = models.CharField(max_length=50, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="wallet_transactions",
    )
    type = models.CharField(max_length=20, choices=TYPES)
    direction = models.CharField(max_length=10, choices=DIRECTIONS)
    amount = models.PositiveBigIntegerField()
    currency_code = models.CharField(max_length=3, default="SIM")
    status = models.CharField(max_length=20, choices=STATUSES, default="pending")
    source_account = models.ForeignKey(
        "LedgerAccount",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="outgoing_transactions",
    )
    destination_account = models.ForeignKey(
        "LedgerAccount",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="incoming_transactions",
    )
    idempotency_key = models.CharField(
        max_length=255, unique=True, null=True, blank=True
    )
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wallet_transactions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status"]),
        ]


class LedgerEntry(models.Model):
    ENTRY_TYPES = [("debit", "Débit"), ("credit", "Crédit")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction = models.ForeignKey(
        WalletTransaction, on_delete=models.CASCADE, related_name="entries"
    )
    account = models.ForeignKey(
        LedgerAccount, on_delete=models.PROTECT, related_name="entries"
    )
    entry_type = models.CharField(max_length=10, choices=ENTRY_TYPES)
    amount = models.PositiveBigIntegerField()
    balance_after = models.BigIntegerField()
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ledger_entries"
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="ledger_entry_amount_positive"
            )
        ]
