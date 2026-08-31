import os
import uuid
import requests
from typing import Any, Dict

from .base import BaseMobileMoneyAdapter, PaymentInitiationResult


class AirtelMoneyAdapter(BaseMobileMoneyAdapter):
    provider_name = "airtel"

    def __init__(self, sandbox: bool = True):
        super().__init__(sandbox=sandbox)
        self.client_id = os.getenv("AIRTEL_CLIENT_ID", "")
        self.client_secret = os.getenv("AIRTEL_CLIENT_SECRET", "")
        self.base_url = (
            "https://openapiuat.airtel.africa"
            if sandbox
            else "https://openapi.airtel.africa"
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
        ref_id = f"AM-DEP-{uuid.uuid4().hex[:12].upper()}"

        if not self.sandbox and self.client_id and self.client_secret:
            try:
                # 1. Token
                auth_res = requests.post(
                    f"{self.base_url}/auth/oauth2/token",
                    json={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "grant_type": "client_credentials",
                    },
                    headers={"Content-Type": "application/json"},
                    timeout=10,
                )
                if not auth_res.ok:
                    return PaymentInitiationResult(
                        success=False,
                        status="failed",
                        message=f"Authentification Airtel rejetée: {auth_res.text}",
                    )
                token = auth_res.json().get("access_token")

                # 2. Collection request
                headers = {
                    "Authorization": f"Bearer {token}",
                    "X-Country": "MG",
                    "X-Currency": "MGA",
                    "Content-Type": "application/json",
                }
                payload = {
                    "reference": ref_id,
                    "subscriber": {
                        "country": "MG",
                        "currency": "MGA",
                        "msisdn": formatted_phone,
                    },
                    "transaction": {
                        "amount": intent.amount,
                        "country": "MG",
                        "currency": "MGA",
                        "id": str(intent.id),
                    },
                }
                res = requests.post(
                    f"{self.base_url}/merchant/v1/payments/",
                    json=payload,
                    headers=headers,
                    timeout=15,
                )
                data = res.json() if res.ok else {}
                airtel_status = data.get("status", {}).get("success", False)
                return PaymentInitiationResult(
                    success=airtel_status,
                    provider_reference=ref_id,
                    status="processing" if airtel_status else "failed",
                    message="Demande de débit Airtel Money envoyée par USSD." if airtel_status else res.text,
                    raw_response=data,
                )
            except Exception as exc:
                return PaymentInitiationResult(
                    success=False,
                    status="failed",
                    message=f"Erreur passerelle Airtel Money: {str(exc)}",
                )

        # Simulation Sandbox
        return PaymentInitiationResult(
            success=True,
            provider_reference=ref_id,
            status="processing",
            message=f"Simulation Airtel Money: Confirmez le paiement de {intent.amount} Ar sur votre numéro {formatted_phone}.",
            raw_response={"simulation": True, "operator": "Airtel Money", "phone": formatted_phone},
        )

    def initiate_withdrawal(self, intent, phone_number: str) -> PaymentInitiationResult:
        formatted_phone = self._format_phone(phone_number or intent.user.phone)
        ref_id = f"AM-WDL-{uuid.uuid4().hex[:12].upper()}"

        return PaymentInitiationResult(
            success=True,
            provider_reference=ref_id,
            status="processing",
            message=f"Retrait de {intent.amount} Ar vers le compte Airtel Money ({formatted_phone}) en cours de transfert.",
            raw_response={"simulation": True, "operator": "Airtel Money", "phone": formatted_phone},
        )

    def verify_transaction_status(self, provider_reference: str) -> Dict[str, Any]:
        return {"provider_reference": provider_reference, "status": "completed"}
