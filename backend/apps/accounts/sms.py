"""
SMS Gateway Dispatcher for Casino MDG.
Supports Twilio, Africa's Talking, Orange SMS Madagascar, or generic HTTP Webhook.
Gracefully falls back to logging and dev mode if no external provider is configured.
"""

import logging
import os

import requests

logger = logging.getLogger(__name__)


def send_sms_otp(phone: str, code: str) -> bool:
    """
    Attempts to send OTP code to the given phone number via configured SMS provider.
    Returns True if an external provider successfully delivered the message, False otherwise.
    """
    message = f"Votre code de connexion MDG Game Club est : {code}. Valable 5 minutes."

    # 1. Try Twilio if configured
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_number = os.getenv("TWILIO_PHONE_NUMBER", "").strip()

    if (
        account_sid
        and auth_token
        and from_number
        and not account_sid.startswith("AC_xxx")
        and auth_token != "xxx"
    ):
        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
            response = requests.post(
                url,
                data={
                    "From": from_number,
                    "To": phone,
                    "Body": message,
                },
                auth=(account_sid, auth_token),
                timeout=6,
            )
            if response.status_code in (200, 201):
                logger.info(f"[SMS Gateway: Twilio] SMS OTP delivered to {phone}")
                return True
            else:
                logger.warning(
                    (
                        "[SMS Gateway: Twilio] Failed to deliver to "
                        f"{phone}"
                        ": "
                        f"{response.status_code}"
                        " - "
                        f"{response.text}"
                    )
                )
        except Exception as exc:
            logger.error(
                f"[SMS Gateway: Twilio] Connection error sending to {phone}: {exc}"
            )

    # 2. Try Generic HTTP Gateway if configured
    gateway_url = os.getenv("SMS_GATEWAY_URL", "").strip()
    gateway_api_key = os.getenv("SMS_GATEWAY_API_KEY", "").strip()
    if gateway_url:
        try:
            headers = {"Content-Type": "application/json"}
            if gateway_api_key:
                headers["Authorization"] = f"Bearer {gateway_api_key}"
            response = requests.post(
                gateway_url,
                json={"to": phone, "message": message, "code": code},
                headers=headers,
                timeout=6,
            )
            if response.status_code in (200, 201):
                logger.info(f"[SMS Gateway: Webhook] SMS OTP delivered to {phone}")
                return True
            else:
                logger.warning(
                    (
                        "[SMS Gateway: Webhook] Failed to deliver to "
                        f"{phone}"
                        ": "
                        f"{response.status_code}"
                        " - "
                        f"{response.text}"
                    )
                )
        except Exception as exc:
            logger.error(
                f"[SMS Gateway: Webhook] Connection error sending to {phone}: {exc}"
            )

    # 3. Fallback / Log
    logger.info(f"[SMS Gateway: Local Fallback] Code OTP généré pour {phone}: {code}")
    return False
