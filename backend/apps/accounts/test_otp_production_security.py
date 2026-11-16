"""Production OTP requests must never reveal reusable authentication secrets."""

import os
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import OTPChallenge
from apps.accounts.sms import send_sms_otp


@override_settings(DEBUG=False)
class ProductionOTPSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_delivery_failure_returns_503_without_code_or_pending_challenge(self):
        with patch("apps.accounts.views.send_sms_otp", return_value=False):
            response = self.client.post(
                "/api/v1/auth/otp/request/",
                {"phone": "034 00 000 70"},
                format="json",
            )
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("dev_code", response.data)
        self.assertEqual(OTPChallenge.objects.count(), 0)

    def test_successful_delivery_never_echoes_code_in_production(self):
        with patch("apps.accounts.views.send_sms_otp", return_value=True):
            response = self.client.post(
                "/api/v1/auth/otp/request/",
                {"phone": "034 00 000 71"},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["sms_sent"])
        self.assertNotIn("dev_code", response.data)
        self.assertEqual(OTPChallenge.objects.count(), 1)

    def test_legacy_fallback_and_bypass_are_ignored_in_production(self):
        with patch.dict(
            os.environ,
            {"OTP_FALLBACK_DISPLAY": "true", "OTP_BYPASS_CODE": "000000"},
        ):
            with patch("apps.accounts.views.secrets.randbelow", return_value=123456):
                with patch("apps.accounts.views.send_sms_otp", return_value=True):
                    response = self.client.post(
                        "/api/v1/auth/otp/request/",
                        {"phone": "034 00 000 72"},
                        format="json",
                    )
            self.assertEqual(response.status_code, 201)
            self.assertNotIn("dev_code", response.data)
            verify = self.client.post(
                "/api/v1/auth/otp/verify/",
                {"phone": "034 00 000 72", "code": "000000"},
                format="json",
            )
        self.assertEqual(verify.status_code, 400)

    def test_gateway_unavailable_never_logs_otp(self):
        with patch.dict(
            os.environ,
            {
                "TWILIO_ACCOUNT_SID": "",
                "TWILIO_AUTH_TOKEN": "",
                "TWILIO_PHONE_NUMBER": "",
                "SMS_GATEWAY_URL": "",
                "SMS_GATEWAY_API_KEY": "",
            },
        ):
            with self.assertLogs("apps.accounts.sms", level="WARNING") as logs:
                sent = send_sms_otp("+261340000073", "123456")
        self.assertFalse(sent)
        self.assertNotIn("123456", "\n".join(logs.output))
        self.assertNotIn("+261340000073", "\n".join(logs.output))

    @override_settings(DEBUG=True)
    def test_debug_mode_can_still_expose_dev_code_for_local_testing(self):
        with patch("apps.accounts.views.send_sms_otp", return_value=False):
            response = self.client.post(
                "/api/v1/auth/otp/request/",
                {"phone": "034 00 000 74"},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.assertIn("dev_code", response.data)
