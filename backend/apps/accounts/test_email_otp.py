"""Security regressions for email-based access and verified contact details."""

from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.email_otp import send_email_otp
from apps.accounts.models import EmailOTPChallenge, OTPChallenge, User


@override_settings(DEBUG=False)
class EmailOTPTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    @patch("apps.accounts.email_views.send_email_otp", return_value=True)
    def test_email_signup_requires_code_and_never_exposes_code(self, delivery):
        with patch("apps.accounts.email_views.secrets.randbelow", return_value=123456):
            response = self.client.post(
                "/api/v1/auth/email/request/",
                {"phone": "0340000090", "email": "signup@example.com"},
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["email_sent"])
        self.assertNotIn("dev_code", response.data)
        self.assertNotIn("123456", str(response.data))
        self.assertEqual(delivery.call_args.args, ("signup@example.com", "123456"))
        self.assertEqual(User.objects.count(), 0)

        incorrect = self.client.post(
            "/api/v1/auth/email/verify/",
            {"request_id": response.data["request_id"], "code": "111111"},
            format="json",
        )
        self.assertEqual(incorrect.status_code, 400)
        verified = self.client.post(
            "/api/v1/auth/email/verify/",
            {
                "request_id": response.data["request_id"],
                "code": "123456",
                "display_name": "Miora",
            },
            format="json",
        )
        self.assertEqual(verified.status_code, 200, verified.data)
        self.assertEqual(verified.data["user"]["email"], "signup@example.com")
        self.assertTrue(verified.data["user"]["email_verified"])
        self.assertTrue(verified.data["access"])
        user = User.objects.get(email="signup@example.com")
        self.assertIsNotNone(user.email_verified_at)
        self.assertIsNone(user.phone_verified_at)
        self.assertEqual(user.phone, "+261340000090")

        replay = self.client.post(
            "/api/v1/auth/email/verify/",
            {"request_id": response.data["request_id"], "code": "123456"},
            format="json",
        )
        self.assertEqual(replay.status_code, 400)
        self.assertEqual(User.objects.count(), 1)

    @patch("apps.accounts.email_views.send_email_otp", return_value=True)
    def test_existing_account_cannot_be_claimed_using_a_different_email(self, delivery):
        user = User.objects.create_user(
            email="261340000091@mdg.local",
            phone="+261340000091",
            display_name="Existing",
        )
        response = self.client.post(
            "/api/v1/auth/email/request/",
            {"phone": "0340000091", "email": "attacker@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertFalse(delivery.called)
        self.assertEqual(EmailOTPChallenge.objects.count(), 0)
        user.refresh_from_db()
        self.assertEqual(user.email, "261340000091@mdg.local")

    @patch("apps.accounts.email_views.send_email_otp", return_value=True)
    def test_authenticated_user_must_verify_email_before_binding(self, delivery):
        user = User.objects.create_user(
            email="261340000092@mdg.local",
            phone="+261340000092",
            display_name="Existing",
        )
        self.client.force_authenticate(user)
        with patch("apps.accounts.email_views.secrets.randbelow", return_value=654321):
            request = self.client.post(
                "/api/v1/auth/me/email/request/",
                {"email": "newcontact@example.com"},
                format="json",
            )
        self.assertEqual(request.status_code, 201)
        self.assertEqual(delivery.call_args.args, ("newcontact@example.com", "654321"))
        user.refresh_from_db()
        self.assertEqual(user.email, "261340000092@mdg.local")
        self.assertIsNone(user.email_verified_at)

        wrong = self.client.post(
            "/api/v1/auth/me/email/verify/",
            {"request_id": request.data["request_id"], "code": "000000"},
            format="json",
        )
        self.assertEqual(wrong.status_code, 400)
        right = self.client.post(
            "/api/v1/auth/me/email/verify/",
            {"request_id": request.data["request_id"], "code": "654321"},
            format="json",
        )
        self.assertEqual(right.status_code, 200, right.data)
        user.refresh_from_db()
        self.assertEqual(user.email, "newcontact@example.com")
        self.assertIsNotNone(user.email_verified_at)
        self.assertEqual(self.client.get("/api/v1/auth/me/").data["email"], user.email)
        self.assertEqual(
            self.client.post(
                "/api/v1/auth/me/email/request/",
                {"email": "replace@example.com"},
                format="json",
            ).status_code,
            403,
        )

    @patch("apps.accounts.email_views.send_email_otp", return_value=True)
    def test_code_cannot_bind_email_to_another_signed_in_account(self, delivery):
        first = User.objects.create_user(
            email="261340000093@mdg.local",
            phone="+261340000093",
            display_name="First",
        )
        second = User.objects.create_user(
            email="261340000094@mdg.local",
            phone="+261340000094",
            display_name="Second",
        )
        self.client.force_authenticate(first)
        with patch("apps.accounts.email_views.secrets.randbelow", return_value=112233):
            response = self.client.post(
                "/api/v1/auth/me/email/request/",
                {"email": "owner@example.com"},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        self.client.force_authenticate(second)
        blocked = self.client.post(
            "/api/v1/auth/me/email/verify/",
            {"request_id": response.data["request_id"], "code": "112233"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        second.refresh_from_db()
        self.assertEqual(second.email, "261340000094@mdg.local")

    @patch("apps.accounts.email_views.send_email_otp", return_value=True)
    def test_email_code_expiration_and_unparseable_request_ids(self, delivery):
        with patch("apps.accounts.email_views.secrets.randbelow", return_value=135791):
            response = self.client.post(
                "/api/v1/auth/email/request/",
                {"phone": "0340000095", "email": "expiry@example.com"},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        malformed = self.client.post(
            "/api/v1/auth/email/verify/",
            {"request_id": "invalid", "code": "135791"},
            format="json",
        )
        self.assertEqual(malformed.status_code, 400)
        EmailOTPChallenge.objects.update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        expired = self.client.post(
            "/api/v1/auth/email/verify/",
            {"request_id": response.data["request_id"], "code": "135791"},
            format="json",
        )
        self.assertEqual(expired.status_code, 400)
        self.assertEqual(User.objects.count(), 0)

    @patch("apps.accounts.email_views.send_email_otp", return_value=False)
    def test_email_delivery_failure_fails_closed(self, delivery):
        response = self.client.post(
            "/api/v1/auth/email/request/",
            {"phone": "0340000096", "email": "unavailable@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("dev_code", response.data)
        self.assertFalse(EmailOTPChallenge.objects.exists())

    @override_settings(EMAIL_OTP_ENABLED=False)
    def test_unconfigured_mailer_never_sends_otp(self):
        self.assertFalse(send_email_otp("nobody@example.com", "123456"))

    @patch("apps.accounts.email_views.send_email_otp", return_value=True)
    def test_sms_cannot_take_over_an_email_only_account(self, delivery):
        with patch("apps.accounts.email_views.secrets.randbelow", return_value=123456):
            response = self.client.post(
                "/api/v1/auth/email/request/",
                {"phone": "0340000097", "email": "mailonly@example.com"},
                format="json",
            )
        verify = self.client.post(
            "/api/v1/auth/email/verify/",
            {"request_id": response.data["request_id"], "code": "123456"},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)
        with patch("apps.accounts.views.send_sms_otp", return_value=True):
            with patch("apps.accounts.views.secrets.randbelow", return_value=111111):
                sms = self.client.post(
                    "/api/v1/auth/otp/request/",
                    {"phone": "0340000097"},
                    format="json",
                )
        self.assertEqual(sms.status_code, 201)
        blocked = self.client.post(
            "/api/v1/auth/otp/verify/",
            {"phone": "0340000097", "code": "111111"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 409)
        user = User.objects.get(email="mailonly@example.com")
        self.assertIsNone(user.phone_verified_at)
        self.assertTrue(OTPChallenge.objects.exists())
