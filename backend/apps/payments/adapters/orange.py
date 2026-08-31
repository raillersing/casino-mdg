import os
import uuid
import requests
from typing import Any, Dict

from .base import BaseMobileMoneyAdapter, PaymentInitiationResult


class OrangeMoneyAdapter(BaseMobileMoneyAdapter):
    provider_name = "orange"

    def __init__(self, sandbox: bool = True):
        super().__init__(sandbox=sandbox)
        self.client_id = os.getenv("ORANGE_CLIENT_ID", "")
        self.client_secret = os.getenv("ORANGE_CLIENT_SECRET", "")
        self.merchant_key = os.getenv("ORANGE_MERCHANT_KEY", "")
        self.base_url = (
            "https://api.orange.com/orange-money-webpay/dev/v1"
            if sandbox
            else "https://api.orange.com/orange-money-webpay/mg/v1"
        )

    def _format_phone(self, phone: str) -> str:
        cleaned = phone.replace(" ", "").replace("-", "").replace(".", "")
        if cleaned.startswith("+261"):
            cleaned = "0" + cleaned[4:]
        elif cleaned.startswith("261"):
            cleaned = "0" + cleaned[3:]
        return cleaned

    def initiate_deposit(self, intent, phone_number: str) -> PaymentInitiationResult:
        formatted_phone = self._format_phone(phone_number or intent.user.phone)
        ref_id = f"OM-DEP-{uuid.uuid4().hex[:12].upper()}"

        if not self.sandbox and self.client_id and self.merchant_key:
            try:
                headers = {
                    "Authorization": f"Bearer {self.client_id}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "merchant_key": self.merchant_key,
                    "currency": "MGA",
                    "order_id": str(intent.id),
                    "amount": intent.amount,
                    "return_url": "https://casinomdg.mg/wallet/callback",
                    "cancel_url": "https://casinomdg.mg/wallet/cancel",
                    "notif_url": "https://casinomdg.mg/api/v1/payments/webhooks/orange/",
                    "lang": "fr",
                    "reference": ref_id,
                }
                res = requests.post(f"{self.base_url}/webpayment", json=payload, headers=headers, timeout=15)
                if res.ok:
                    data = res.json()
                    payment_url = data.get("payment_url", "")
                    pay_token = data.get("pay_token", ref_id)
                    return PaymentInitiationResult(
                        success=True,
                        provider_reference=pay_token,
                        checkout_url=payment_url,
                        status="processing",
                        message="Lien de paiement Orange Money généré.",
                        raw_response=data,
                    )
                return PaymentInitiationResult(
                    success=False,
                    status="failed",
                    message=f"Rejet Orange WebPay: {res.text}",
                )
            except Exception as exc:
                return PaymentInitiationResult(
                    success=False,
                    status="failed",
                    message=f"Erreur de connexion passerelle Orange Money: {str(exc)}",
                )

        # Mode simulation Sandbox
        return PaymentInitiationResult(
            success=True,
            provider_reference=ref_id,
            checkout_url=f"https://sandbox.orange.mg/pay/{ref_id}",
            status="processing",
            message=f"Simulation Orange Money: Confirmez le paiement de {intent.amount} Ar (#144#) sur {formatted_phone}.",
            raw_response={"simulation": True, "operator": "Orange Money", "phone": formatted_phone},
        )

    def initiate_withdrawal(self, intent, phone_number: str) -> PaymentInitiationResult:
        formatted_phone = self._format_phone(phone_number or intent.user.phone)
        ref_id = f"OM-WDL-{uuid.uuid4().hex[:12].upper()}"

        return PaymentInitiationResult(
            success=True,
            provider_reference=ref_id,
            status="processing",
            message=f"Retrait de {intent.amount} Ar vers Orange Money ({formatted_phone}) en cours de transfert.",
            raw_response={"simulation": True, "operator": "Orange Money", "phone": formatted_phone},
        )

    def verify_transaction_status(self, provider_reference: str) -> Dict[str, Any]:
        return {"provider_reference": provider_reference, "status": "completed"}
