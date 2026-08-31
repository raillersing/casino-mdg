import os
import uuid
import requests
from typing import Any, Dict

from .base import BaseMobileMoneyAdapter, PaymentInitiationResult


class MVolaAdapter(BaseMobileMoneyAdapter):
    provider_name = "mvola"

    def __init__(self, sandbox: bool = True):
        super().__init__(sandbox=sandbox)
        self.client_id = os.getenv("MVOLA_CLIENT_ID", "")
        self.client_secret = os.getenv("MVOLA_CLIENT_SECRET", "")
        self.merchant_number = os.getenv("MVOLA_MERCHANT_NUMBER", "0340000000")
        self.base_url = (
            "https://sandbox.mvola.mg"
            if sandbox
            else "https://api.mvola.mg"
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
        ref_id = f"MVOLA-DEP-{uuid.uuid4().hex[:12].upper()}"

        # Mode live réel si identifiants configurés
        if not self.sandbox and self.client_id and self.client_secret:
            try:
                # 1. Obtenir le token OAuth
                auth_res = requests.post(
                    f"{self.base_url}/token",
                    auth=(self.client_id, self.client_secret),
                    data={"grant_type": "client_credentials", "scope": "EXT_INT_MVOLA_SCOPE"},
                    timeout=10,
                )
                if not auth_res.ok:
                    return PaymentInitiationResult(
                        success=False,
                        status="failed",
                        message=f"Authentification MVola rejetée: {auth_res.text}",
                    )
                access_token = auth_res.json().get("access_token")

                # 2. Déclencher le Merchant Pay (Push USSD)
                headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Version": "1.0",
                    "X-CorrelationID": str(intent.id),
                    "UserLanguage": "FR",
                    "UserAccountIdentifier": f"msisdn;{self.merchant_number}",
                    "partnerName": "CasinoMDG",
                    "Content-Type": "application/json",
                }
                payload = {
                    "amount": str(intent.amount),
                    "currency": "Ar",
                    "descriptionText": f"Dépôt Casino MDG {intent.amount} Ar",
                    "requestingOrganisationTransactionReference": str(intent.id),
                    "requestDate": intent.created_at.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "debitParty": [{"key": "msisdn", "value": formatted_phone}],
                    "creditParty": [{"key": "msisdn", "value": self.merchant_number}],
                    "metadata": [{"key": "partnerName", "value": "CasinoMDG"}],
                }
                res = requests.post(
                    f"{self.base_url}/mvola/mm/transactions/type/merchantpay/1.0.0/",
                    json=payload,
                    headers=headers,
                    timeout=15,
                )
                data = res.json() if res.ok else {}
                server_ref = data.get("serverCorrelationId", ref_id)
                return PaymentInitiationResult(
                    success=res.ok,
                    provider_reference=server_ref,
                    status="processing" if res.ok else "failed",
                    message="Notification Push USSD envoyée sur votre téléphone MVola (#111#)." if res.ok else res.text,
                    raw_response=data,
                )
            except Exception as exc:
                return PaymentInitiationResult(
                    success=False,
                    status="failed",
                    message=f"Erreur de connexion passerelle MVola: {str(exc)}",
                )

        # Simulation Sandbox
        return PaymentInitiationResult(
            success=True,
            provider_reference=ref_id,
            status="processing",
            message=f"Simulation MVola: Validez le paiement de {intent.amount} Ar sur votre numéro {formatted_phone}.",
            raw_response={"simulation": True, "operator": "MVola (Telma)", "phone": formatted_phone},
        )

    def initiate_withdrawal(self, intent, phone_number: str) -> PaymentInitiationResult:
        formatted_phone = self._format_phone(phone_number or intent.user.phone)
        ref_id = f"MVOLA-WDL-{uuid.uuid4().hex[:12].upper()}"

        return PaymentInitiationResult(
            success=True,
            provider_reference=ref_id,
            status="processing",
            message=f"Retrait de {intent.amount} Ar vers le compte MVola {formatted_phone} en cours de traitement.",
            raw_response={"simulation": True, "operator": "MVola", "phone": formatted_phone},
        )

    def verify_transaction_status(self, provider_reference: str) -> Dict[str, Any]:
        return {"provider_reference": provider_reference, "status": "completed"}
