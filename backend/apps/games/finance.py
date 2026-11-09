"""Authoritative MGA funding and balanced ledger, independent of browser delivery."""

import hashlib
import json
import uuid

from django.db import transaction
from django.utils import timezone

from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction

from .models import GameTable, TableBankroll, TableFundingOperation, TableSeat

MAX_MONEY = 2**53 - 1


def money(value, zero=False):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("Le montant doit être un entier en Ariary.")
    if value < (0 if zero else 1) or value > MAX_MONEY:
        raise ValueError("Montant en Ariary invalide.")
    return value


def account(user_id, kind="player"):
    return LedgerAccount.objects.select_for_update().get_or_create(
        user_id=user_id, account_type=kind, currency_code="MGA"
    )[0]


def transfer(source, destination, amount, user_id, key, description):
    if not amount:
        return None
    if source.balance < amount:
        raise ValueError("Fonds comptables insuffisants ; rapprochement requis.")
    source.balance -= amount
    destination.balance += amount
    source.save(update_fields=["balance", "updated_at"])
    destination.save(update_fields=["balance", "updated_at"])
    tx = WalletTransaction.objects.create(
        transaction_code="MGA-" + uuid.uuid4().hex,
        user_id=user_id,
        type="game",
        direction="credit" if destination.account_type == "player" else "debit",
        amount=amount,
        currency_code="MGA",
        status="completed",
        source_account=source,
        destination_account=destination,
        idempotency_key=key,
        description=description,
        processed_at=timezone.now(),
    )
    for acc, direction in ((source, "debit"), (destination, "credit")):
        LedgerEntry.objects.create(
            transaction=tx,
            account=acc,
            entry_type=direction,
            amount=amount,
            balance_after=acc.balance,
            description=description,
        )
    return tx


def reserve(table, user, bankroll, amount, key, kind):
    wallet = account(user.pk)
    old = TableFundingOperation.objects.filter(user=user, key=key).first()
    if old:
        if (old.table_id, old.kind, old.amount) != (table.pk, kind, amount):
            raise ValueError("Cette clé de financement désigne une autre demande.")
        return old
    if wallet.balance < amount:
        raise ValueError("Solde Ariary insuffisant pour cette participation.")
    if bankroll.held_amount + amount > MAX_MONEY:
        raise ValueError("Montant supérieur à la précision financière autorisée.")
    escrow = account(user.pk, "escrow")
    op_id = uuid.uuid4()
    tx = transfer(
        wallet, escrow, amount, user.pk, f"fund:{op_id}", "Réservation poker MGA"
    )
    wallet.held_balance += amount
    wallet.save(update_fields=["held_balance", "updated_at"])
    bankroll.held_amount += amount
    bankroll.reserved_amount += amount
    if kind == "top_up":
        bankroll.pending_top_up += amount
    bankroll.save()
    return TableFundingOperation.objects.create(
        id=op_id,
        table=table,
        user=user,
        bankroll=bankroll,
        key=key,
        kind=kind,
        amount=amount,
        transaction=tx,
    )


def refund(bankroll, revision):
    if bankroll.finance_version != 1:
        raise ValueError("Ancienne réservation MGA : rapprochement requis.")
    wallet = account(bankroll.user_id)
    escrow = account(bankroll.user_id, "escrow")
    transfer(
        escrow,
        wallet,
        bankroll.held_amount,
        bankroll.user_id,
        f"exit:{bankroll.pk}:{revision}",
        "Restitution du tapis poker MGA",
    )
    if wallet.held_balance < bankroll.held_amount:
        raise ValueError("Solde bloqué incohérent.")
    wallet.held_balance -= bankroll.held_amount
    wallet.save(update_fields=["held_balance", "updated_at"])
    bankroll.held_amount = bankroll.current_stack = bankroll.pending_top_up = 0
    bankroll.status = "refunded"
    bankroll.save()
    TableFundingOperation.objects.filter(bankroll=bankroll, status="reserved").update(
        status="cancelled"
    )
    TableSeat.objects.filter(table=bankroll.table, user_id=bankroll.user_id).delete()


@transaction.atomic
def reserve_top_up(table, user, amount, key):
    amount = money(amount)
    if not isinstance(key, str) or not 1 <= len(key) <= 80:
        raise ValueError("Une clé de recharge est requise.")
    table = GameTable.objects.select_for_update().get(pk=table.pk)
    if (
        table.game_type != "poker"
        or table.stake_amount <= 0
        or table.status == "finished"
    ):
        raise ValueError("Cette table ne permet pas de recharge MGA.")
    old = TableFundingOperation.objects.filter(user=user, key=key).first()
    if old:
        if (old.table_id, old.kind, old.amount) != (table.pk, "top_up", amount):
            raise ValueError("Cette clé désigne une autre demande.")
        return old.bankroll, account(user.pk).balance, old
    if not TableSeat.objects.filter(table=table, user=user).exists():
        raise ValueError("Vous n'êtes pas assis à cette table.")
    bankroll = TableBankroll.objects.select_for_update().get(
        table=table, user=user, status__in=["reserved", "active"]
    )
    if (
        bankroll.finance_version != 1
        or TableFundingOperation.objects.filter(
            bankroll=bankroll, kind="leave"
        ).exists()
    ):
        raise ValueError("Une sortie ou un rapprochement est en attente.")
    op = reserve(table, user, bankroll, amount, key, "top_up")
    return bankroll, account(user.pk).balance, op


@transaction.atomic
def request_leave(table, user):
    table = GameTable.objects.select_for_update().get(pk=table.pk)
    bankroll = (
        TableBankroll.objects.select_for_update()
        .filter(table=table, user=user, status__in=["reserved", "active"])
        .first()
    )
    if not bankroll:
        return False
    if bankroll.finance_version != 1:
        raise ValueError(
            "Ancienne réservation MGA : rapprochement requis avant sortie."
        )
    entry = TableFundingOperation.objects.get(bankroll=bankroll, kind="entry")
    if entry.status == "reserved":
        # The table lock serializes cancellation against the first engine receipt.
        # An engine cannot publish funded play before that receipt is accepted.
        refund(bankroll, "cancel-before-admission")
        if not table.seats.exists():
            table.status = "finished"
            table.save(update_fields=["status", "updated_at"])
        return True
    TableFundingOperation.objects.get_or_create(
        bankroll=bankroll,
        kind="leave",
        defaults={"table": table, "user": user, "key": f"leave:{bankroll.pk}"},
    )
    return True


@transaction.atomic
def apply_checkpoint(table_id, data):
    """Accept a complete engine checkpoint, never an unsigned browser stack."""
    table = GameTable.objects.select_for_update().get(pk=table_id)
    revision = money(data.get("revision"), zero=True)
    digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    if revision < table.finance_revision:
        raise ValueError("Checkpoint obsolète ; restauration financière requise.")
    if revision == table.finance_revision and table.finance_hash:
        if table.finance_hash != digest:
            raise ValueError("Conflit de checkpoint financier.")
        return
    entries = data.get("balances")
    consumed = data.get("operations")
    if not isinstance(entries, dict) or not isinstance(consumed, list):
        raise ValueError("Checkpoint incomplet.")
    ops = list(TableFundingOperation.objects.filter(table=table, id__in=consumed))
    if len(ops) != len(set(consumed)) or any(op.status == "cancelled" for op in ops):
        raise ValueError("Opération financière inconnue ou annulée.")
    rows = list(
        TableBankroll.objects.select_for_update()
        .filter(table=table, status__in=["reserved", "active"])
        .order_by("user_id", "pk")
    )
    if any(b.finance_version != 1 for b in rows):
        raise ValueError("Ancien financement non rapproché.")
    accepted = set(map(str, consumed))
    desired = {}
    for b in rows:
        entry = entries.get(str(b.pk))
        if entry is None:
            # Never guess that a still-in-flight ticket was not admitted.
            desired[b.pk] = (
                b.held_amount,
                b.current_stack,
                b.pending_top_up,
                bool(data.get("closed")),
            )
            continue
        related = list(
            TableFundingOperation.objects.filter(bankroll=b).exclude(status="cancelled")
        )
        if not any(op.kind == "entry" and str(op.pk) in accepted for op in related):
            raise ValueError("Entrée non financée dans le checkpoint.")
        stack = money(entry.get("stack"), zero=True)
        pending = money(entry.get("pending", 0), zero=True)
        undelivered = sum(
            op.amount
            for op in related
            if op.kind in ["entry", "top_up"] and str(op.pk) not in accepted
        )
        desired[b.pk] = (
            stack + pending + undelivered,
            stack,
            pending + undelivered,
            bool(entry.get("exited")) or bool(data.get("closed")),
        )
    if sum(x[0] for x in desired.values()) != sum(b.held_amount for b in rows):
        raise ValueError("Le checkpoint ne conserve pas les fonds.")
    # Stable lock order across tables and concurrent withdrawals.
    users = sorted({b.user_id for b in rows})
    wallets = {u: account(u) for u in users}
    escrows = {u: account(u, "escrow") for u in users}
    deltas = {u: 0 for u in users}
    for b in rows:
        deltas[b.user_id] += desired[b.pk][0] - b.held_amount
    debtors = [[u, -v] for u, v in deltas.items() if v < 0]
    creditors = [[u, v] for u, v in deltas.items() if v > 0]
    serial = 0
    for creditor in creditors:
        for debtor in debtors:
            value = min(creditor[1], debtor[1])
            if value:
                serial += 1
                transfer(
                    escrows[debtor[0]],
                    escrows[creditor[0]],
                    value,
                    creditor[0],
                    f"settle:{table.pk}:{revision}:{serial}",
                    "Règlement poker MGA",
                )
                creditor[1] -= value
                debtor[1] -= value
    for u, delta in deltas.items():
        if wallets[u].held_balance + delta < 0:
            raise ValueError("Solde réservé incohérent.")
        wallets[u].held_balance += delta
        wallets[u].save(update_fields=["held_balance", "updated_at"])
    TableFundingOperation.objects.filter(pk__in=consumed, status="reserved").update(
        status="applied"
    )
    for b in rows:
        b.held_amount, b.current_stack, b.pending_top_up, exited = desired[b.pk]
        b.status = "active" if str(b.pk) in entries else b.status
        b.save()
        if exited:
            refund(b, revision)
    table.finance_revision = revision
    table.finance_hash = digest
    if data.get("closed"):
        table.status = "finished"
    table.save(
        update_fields=["finance_revision", "finance_hash", "status", "updated_at"]
    )
