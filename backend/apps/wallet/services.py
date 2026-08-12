from django.db import transaction
from django.utils import timezone

from .models import LedgerAccount, LedgerEntry, WalletTransaction

SIMULATION_STARTING_BONUS = 10_000


def get_or_create_player_account(user):
    account, _ = LedgerAccount.objects.get_or_create(
        user=user, account_type="player", currency_code="SIM"
    )
    return account


def get_platform_account():
    account, _ = LedgerAccount.objects.get_or_create(
        user=None, account_type="platform", currency_code="SIM"
    )
    return account


@transaction.atomic
def credit_simulation_bonus(user):
    key = f"welcome-bonus:{user.pk}"
    existing = WalletTransaction.objects.filter(idempotency_key=key).first()
    if existing:
        return get_or_create_player_account(user), existing, False
    player = LedgerAccount.objects.select_for_update().get_or_create(
        user=user, account_type="player", currency_code="SIM"
    )[0]
    platform = LedgerAccount.objects.select_for_update().get_or_create(
        user=None, account_type="platform", currency_code="SIM"
    )[0]
    player.balance += SIMULATION_STARTING_BONUS
    player.save(update_fields=["balance", "updated_at"])
    platform.balance -= SIMULATION_STARTING_BONUS
    platform.save(update_fields=["balance", "updated_at"])
    entry = WalletTransaction.objects.create(
        transaction_code=f"SIM-BONUS-{user.pk}",
        user=user,
        type="bonus",
        direction="credit",
        amount=SIMULATION_STARTING_BONUS,
        currency_code="SIM",
        status="completed",
        source_account=platform,
        destination_account=player,
        idempotency_key=key,
        description="Bonus de bienvenue MDG Game Club",
        processed_at=timezone.now(),
    )
    LedgerEntry.objects.bulk_create(
        [
            LedgerEntry(
                transaction=entry,
                account=platform,
                entry_type="debit",
                amount=SIMULATION_STARTING_BONUS,
                balance_after=platform.balance,
            ),
            LedgerEntry(
                transaction=entry,
                account=player,
                entry_type="credit",
                amount=SIMULATION_STARTING_BONUS,
                balance_after=player.balance,
            ),
        ]
    )
    return player, entry, True


@transaction.atomic
def settle_game_win(user, game_id, game_type, amount, metadata=None):
    """Credit one simulation win exactly once and return its transaction."""
    if amount < 0:
        raise ValueError("Le gain ne peut pas être négatif.")
    key = f"game-win:{game_id}:{user.pk}"
    existing = WalletTransaction.objects.filter(idempotency_key=key).first()
    if existing:
        return existing, False
    player = LedgerAccount.objects.select_for_update().get_or_create(
        user=user, account_type="player", currency_code="SIM"
    )[0]
    platform = LedgerAccount.objects.select_for_update().get_or_create(
        user=None, account_type="platform", currency_code="SIM"
    )[0]
    player.balance += amount
    player.save(update_fields=["balance", "updated_at"])
    platform.balance -= amount
    platform.save(update_fields=["balance", "updated_at"])
    entry = WalletTransaction.objects.create(
        transaction_code=f"SIM-GAME-{game_id}",
        user=user,
        type="game",
        direction="credit",
        amount=amount,
        currency_code="SIM",
        status="completed",
        source_account=platform,
        destination_account=player,
        idempotency_key=key,
        description=f"Gain de partie {game_type}",
        metadata=metadata or {},
        processed_at=timezone.now(),
    )
    LedgerEntry.objects.bulk_create(
        [
            LedgerEntry(
                transaction=entry,
                account=platform,
                entry_type="debit",
                amount=amount,
                balance_after=platform.balance,
            ),
            LedgerEntry(
                transaction=entry,
                account=player,
                entry_type="credit",
                amount=amount,
                balance_after=player.balance,
            ),
        ]
    )
    return entry, True


@transaction.atomic
def credit_simulation_reward(user, idempotency_key, amount, description):
    if amount <= 0:
        raise ValueError("La récompense doit être positive.")
    existing = WalletTransaction.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return existing, False
    player = LedgerAccount.objects.select_for_update().get_or_create(
        user=user, account_type="player", currency_code="SIM"
    )[0]
    platform = LedgerAccount.objects.select_for_update().get_or_create(
        user=None, account_type="platform", currency_code="SIM"
    )[0]
    player.balance += amount
    player.save(update_fields=["balance", "updated_at"])
    platform.balance -= amount
    platform.save(update_fields=["balance", "updated_at"])
    entry = WalletTransaction.objects.create(
        transaction_code=f"SIM-REWARD-{user.pk}-{idempotency_key[-20:]}",
        user=user,
        type="bonus",
        direction="credit",
        amount=amount,
        currency_code="SIM",
        status="completed",
        source_account=platform,
        destination_account=player,
        idempotency_key=idempotency_key,
        description=description,
        processed_at=timezone.now(),
    )
    LedgerEntry.objects.bulk_create(
        [
            LedgerEntry(
                transaction=entry,
                account=platform,
                entry_type="debit",
                amount=amount,
                balance_after=platform.balance,
            ),
            LedgerEntry(
                transaction=entry,
                account=player,
                entry_type="credit",
                amount=amount,
                balance_after=player.balance,
            ),
        ]
    )
    return entry, True


@transaction.atomic
def debit_simulation_entry(user, idempotency_key, amount, description, metadata=None):
    """Debit a SIM participation exactly once, failing safely on insufficient balance."""
    if amount <= 0:
        raise ValueError("Le coût doit être positif.")
    existing = WalletTransaction.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return existing, False
    player = LedgerAccount.objects.select_for_update().get_or_create(
        user=user, account_type="player", currency_code="SIM"
    )[0]
    platform = LedgerAccount.objects.select_for_update().get_or_create(
        user=None, account_type="platform", currency_code="SIM"
    )[0]
    if player.balance < amount:
        raise ValueError("Solde SIM insuffisant.")
    player.balance -= amount
    player.save(update_fields=["balance", "updated_at"])
    platform.balance += amount
    platform.save(update_fields=["balance", "updated_at"])
    entry = WalletTransaction.objects.create(
        transaction_code=f"SIM-PLAY-{user.pk}-{idempotency_key[-20:]}",
        user=user,
        type="game",
        direction="debit",
        amount=amount,
        currency_code="SIM",
        status="completed",
        source_account=player,
        destination_account=platform,
        idempotency_key=idempotency_key,
        description=description,
        metadata=metadata or {},
        processed_at=timezone.now(),
    )
    LedgerEntry.objects.bulk_create(
        [
            LedgerEntry(
                transaction=entry,
                account=player,
                entry_type="debit",
                amount=amount,
                balance_after=player.balance,
            ),
            LedgerEntry(
                transaction=entry,
                account=platform,
                entry_type="credit",
                amount=amount,
                balance_after=platform.balance,
            ),
        ]
    )
    return entry, True
