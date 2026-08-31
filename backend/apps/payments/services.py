import uuid
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.backoffice.services import record_audit
from apps.kyc.views import LIMITS as KYC_LIMITS
from apps.notifications.services import create_notification
from apps.wallet.models import LedgerAccount, LedgerEntry, WalletTransaction

from .adapters import get_adapter
from .models import PaymentIntent, WebhookInboxEvent


def get_or_create_mga_account(user, account_type="player") -> LedgerAccount:
    """Récupère ou crée le compte en Ariary (MGA) d'un joueur ou de la plateforme."""
    account, _ = LedgerAccount.objects.get_or_create(
        user=user,
        account_type=account_type,
        currency_code="MGA",
        defaults={"balance": 0, "held_balance": 0, "status": "active"},
    )
    return account


def get_mga_platform_account() -> LedgerAccount:
    account, _ = LedgerAccount.objects.get_or_create(
        user=None,
        account_type="platform",
        currency_code="MGA",
        defaults={"balance": 0, "held_balance": 0, "status": "active"},
    )
    return account


@transaction.atomic
def initiate_payment_intent(
    user,
    provider: str,
    direction: str,
    amount: int,
    phone_number: str,
    idempotency_key: str,
    sandbox: bool = True,
) -> PaymentIntent:
    """
    Initie une transaction Mobile Money (dépôt ou retrait) avec vérification de conformité KYC,
    sécurisation du solde et appel à la passerelle opérateur.
    """
    if provider not in dict(WebhookInboxEvent.PROVIDERS):
        raise ValidationError(f"Opérateur '{provider}' non supporté.")

    if direction not in dict(PaymentIntent.DIRECTIONS):
        raise ValidationError(f"Direction '{direction}' invalide.")

    if amount <= 0:
        raise ValidationError("Le montant doit être supérieur à 0 Ar.")

    # 1. Vérification des plafonds KYC
    user_limits = KYC_LIMITS.get(user.kyc_level, KYC_LIMITS["discovered"])
    max_allowed = user_limits.get(direction, 0)
    if amount > max_allowed:
        tier_label = user.get_kyc_level_display() if hasattr(user, "get_kyc_level_display") else user.kyc_level
        raise ValidationError(
            f"Le montant de {amount:,} Ar dépasse le plafond de {direction} autorisé pour votre niveau ({tier_label} : max {max_allowed:,} Ar). Veuillez mettre à niveau vos documents KYC."
        )

    # 1b. Vérification des règles de Jeu Responsable (Auto-exclusion, pause, plafonds personnels)
    if direction == "deposit":
        from apps.responsible_gaming.services import check_deposit_allowed
        check_deposit_allowed(user, amount)

    # 2. Gestion de l'idempotence
    existing = PaymentIntent.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        if existing.user_id != user.pk:
            raise ValidationError("Clé d'idempotence déjà utilisée par un autre compte.")
        return existing

    # 3. Si retrait : vérifier solde et verrouiller les fonds
    if direction == "withdrawal":
        player_acc = LedgerAccount.objects.select_for_update().get_or_create(
            user=user, account_type="player", currency_code="MGA"
        )[0]
        if player_acc.balance < amount:
            raise ValidationError(
                f"Solde en Ariary insuffisant pour effectuer ce retrait. Solde disponible : {player_acc.balance:,} Ar."
            )
        # Verrouiller le montant
        player_acc.balance -= amount
        player_acc.held_balance += amount
        player_acc.save(update_fields=["balance", "held_balance", "updated_at"])

    # 4. Création de l'intent
    intent = PaymentIntent.objects.create(
        user=user,
        provider=provider,
        direction=direction,
        amount=amount,
        currency="MGA",
        phone_number=phone_number or user.phone,
        status="pending",
        idempotency_key=idempotency_key,
    )

    # 5. Appel de l'adaptateur de l'opérateur
    adapter = get_adapter(provider, sandbox=sandbox)
    if direction == "deposit":
        init_result = adapter.initiate_deposit(intent, phone_number or user.phone)
    else:
        init_result = adapter.initiate_withdrawal(intent, phone_number or user.phone)

    intent.provider_reference = init_result.provider_reference
    intent.checkout_url = init_result.checkout_url
    intent.status = init_result.status if init_result.success else "failed"
    intent.error_message = "" if init_result.success else init_result.message
    intent.metadata = {
        "adapter_response": init_result.raw_response,
        "message": init_result.message,
    }
    intent.save(update_fields=["provider_reference", "checkout_url", "status", "error_message", "metadata"])

    record_audit(
        user,
        f"payment.{direction}.initiated",
        intent,
        {
            "amount": amount,
            "provider": provider,
            "reference": intent.provider_reference,
            "status": intent.status,
        },
    )
    return intent


@transaction.atomic
def settle_payment_intent(intent: PaymentIntent, success: bool = True, reason: str = "") -> PaymentIntent:
    """
    Rapprochement comptable définitif d'un PaymentIntent après notification du webhook opérateur.
    Exécute les écritures de débit/crédit en partie double dans le grand livre (Ledger).
    """
    if intent.status == "completed":
        return intent  # Déjà rapproché

    user = intent.user
    now = timezone.now()
    platform_acc = get_mga_platform_account()
    player_acc = LedgerAccount.objects.select_for_update().get_or_create(
        user=user, account_type="player", currency_code="MGA"
    )[0]

    if intent.direction == "deposit":
        if success:
            # Crédit du compte joueur, débit de la plateforme
            player_acc.balance += intent.amount
            player_acc.save(update_fields=["balance", "updated_at"])
            platform_acc.balance -= intent.amount
            platform_acc.save(update_fields=["balance", "updated_at"])

            txn_key = f"deposit:mga:{intent.id}"
            txn = WalletTransaction.objects.create(
                transaction_code=f"MGA-DEP-{intent.pk}",
                user=user,
                type="deposit",
                direction="credit",
                amount=intent.amount,
                currency_code="MGA",
                status="completed",
                source_account=platform_acc,
                destination_account=player_acc,
                idempotency_key=txn_key,
                description=f"Dépôt Mobile Money {intent.get_provider_display()} ({intent.amount:,} Ar)",
                metadata={"payment_intent_id": str(intent.id), "provider": intent.provider},
                processed_at=now,
            )

            LedgerEntry.objects.bulk_create(
                [
                    LedgerEntry(
                        transaction=txn,
                        account=platform_acc,
                        entry_type="debit",
                        amount=intent.amount,
                        balance_after=platform_acc.balance,
                    ),
                    LedgerEntry(
                        transaction=txn,
                        account=player_acc,
                        entry_type="credit",
                        amount=intent.amount,
                        balance_after=player_acc.balance,
                    ),
                ]
            )

            intent.status = "completed"
            intent.error_message = ""
            intent.save(update_fields=["status", "error_message", "updated_at"])

            create_notification(
                user=user,
                category="wallet",
                title="Dépôt confirmé",
                message=f"Votre compte a été crédité de {intent.amount:,} Ar via {intent.get_provider_display()}.",
            )
        else:
            intent.status = "failed"
            intent.error_message = reason
            intent.save(update_fields=["status", "error_message", "updated_at"])

    elif intent.direction == "withdrawal":
        if success:
            # Libérer les fonds réservés et finaliser le débit
            player_acc.held_balance = max(0, player_acc.held_balance - intent.amount)
            player_acc.save(update_fields=["held_balance", "updated_at"])
            platform_acc.balance += intent.amount
            platform_acc.save(update_fields=["balance", "updated_at"])

            txn_key = f"withdrawal:mga:{intent.id}"
            txn = WalletTransaction.objects.create(
                transaction_code=f"MGA-WDL-{intent.pk}",
                user=user,
                type="withdrawal",
                direction="debit",
                amount=intent.amount,
                currency_code="MGA",
                status="completed",
                source_account=player_acc,
                destination_account=platform_acc,
                idempotency_key=txn_key,
                description=f"Retrait Mobile Money {intent.get_provider_display()} ({intent.amount:,} Ar)",
                metadata={"payment_intent_id": str(intent.id), "provider": intent.provider},
                processed_at=now,
            )

            LedgerEntry.objects.bulk_create(
                [
                    LedgerEntry(
                        transaction=txn,
                        account=player_acc,
                        entry_type="debit",
                        amount=intent.amount,
                        balance_after=player_acc.balance,
                    ),
                    LedgerEntry(
                        transaction=txn,
                        account=platform_acc,
                        entry_type="credit",
                        amount=intent.amount,
                        balance_after=platform_acc.balance,
                    ),
                ]
            )

            intent.status = "completed"
            intent.save(update_fields=["status", "updated_at"])

            create_notification(
                user=user,
                category="wallet",
                title="Retrait effectué",
                message=f"Votre retrait de {intent.amount:,} Ar vers {intent.phone_number} a été validé avec succès.",
            )
        else:
            # Rembourser les fonds réservés vers le solde disponible
            player_acc.held_balance = max(0, player_acc.held_balance - intent.amount)
            player_acc.balance += intent.amount
            player_acc.save(update_fields=["balance", "held_balance", "updated_at"])

            intent.status = "failed"
            intent.error_message = reason
            intent.save(update_fields=["status", "error_message", "updated_at"])

            create_notification(
                user=user,
                category="wallet",
                title="Échec du retrait",
                message=f"Le retrait de {intent.amount:,} Ar a échoué. Votre solde a été recrédité.",
            )

    record_audit(
        user,
        f"payment.{intent.direction}.settled",
        intent,
        {
            "amount": intent.amount,
            "status": intent.status,
            "success": success,
            "reason": reason,
        },
    )
    return intent
