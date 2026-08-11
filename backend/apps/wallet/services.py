from django.db import transaction
from django.utils import timezone

from .models import LedgerAccount, LedgerEntry, WalletTransaction

SIMULATION_STARTING_BONUS = 10_000


def get_or_create_player_account(user):
    account, _ = LedgerAccount.objects.get_or_create(user=user, account_type="player", currency_code="SIM")
    return account


def get_platform_account():
    account, _ = LedgerAccount.objects.get_or_create(user=None, account_type="platform", currency_code="SIM")
    return account


@transaction.atomic
def credit_simulation_bonus(user):
    key = f"welcome-bonus:{user.pk}"
    existing = WalletTransaction.objects.filter(idempotency_key=key).first()
    if existing:
        return get_or_create_player_account(user), existing, False
    player = LedgerAccount.objects.select_for_update().get_or_create(user=user, account_type="player", currency_code="SIM")[0]
    platform = LedgerAccount.objects.select_for_update().get_or_create(user=None, account_type="platform", currency_code="SIM")[0]
    player.balance += SIMULATION_STARTING_BONUS
    player.save(update_fields=["balance", "updated_at"])
    platform.balance -= SIMULATION_STARTING_BONUS
    platform.save(update_fields=["balance", "updated_at"])
    entry = WalletTransaction.objects.create(transaction_code=f"SIM-BONUS-{user.pk}", user=user, type="bonus", direction="credit", amount=SIMULATION_STARTING_BONUS, currency_code="SIM", status="completed", source_account=platform, destination_account=player, idempotency_key=key, description="Bonus de bienvenue MDG Game Club", processed_at=timezone.now())
    LedgerEntry.objects.bulk_create([LedgerEntry(transaction=entry, account=platform, entry_type="debit", amount=SIMULATION_STARTING_BONUS, balance_after=platform.balance), LedgerEntry(transaction=entry, account=player, entry_type="credit", amount=SIMULATION_STARTING_BONUS, balance_after=player.balance)])
    return player, entry, True
