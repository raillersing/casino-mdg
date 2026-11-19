"""Server-side channel policy: deny-by-default for disabled methods."""

from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

from apps.accounts.models import OTPChallenge, User
from apps.backoffice.models import AuditEvent, AuthChannelPolicy


@override_settings(DEBUG=False)
class BackofficeAuthChannelTests(TestCase):
    def setUp(self):
        self.player = User.objects.create_user(
            email="channels-player@mdg.local",
            phone="+261340000201",
            display_name="Player",
        )
        self.staff = User.objects.create_user(
            email="channels-staff@mdg.local",
            phone="+261340000202",
            display_name="Staff",
            is_staff=True,
        )
        self.admin = User.objects.create_superuser(
            email="channels-admin@mdg.local",
            password="test-password-strong-only",
            phone="+261340000203",
            display_name="Admin",
        )
        self.staff.groups.add(
            Group.objects.get_or_create(name="casino:security_auditor")[0]
        )
        self.client = APIClient()
        self.url = "/api/v1/backoffice/config/auth-methods/"

    def test_public_methods_are_secret_free_and_staff_read_is_guarded(self):
        public = self.client.get("/api/v1/auth/methods/")
        self.assertEqual(public.status_code, 200)
        self.assertIn("email", public.data)
        self.assertIn("sms", public.data)
        self.assertNotIn("EMAIL_HOST_PASSWORD", str(public.data))
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.client.force_authenticate(self.player)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertFalse(self.client.get(self.url).data["can_update"])

    def test_staff_and_superuser_without_totp_cannot_change_policy(self):
        self.client.force_authenticate(self.staff)
        request = {
            "mode": "none",
            "reason": "Arrêt temporaire des canaux OTP",
            "revision": 0,
            "mfa_code": "123456",
        }
        self.assertEqual(
            self.client.patch(self.url, request, format="json").status_code,
            403,
        )
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.patch(self.url, request, format="json").status_code,
            403,
        )
        self.assertFalse(AuthChannelPolicy.objects.exists())

    def test_admin_totp_confirmed_policy_change_blocks_old_challenges(self):
        TOTPDevice.objects.create(user=self.admin, name="Security key", confirmed=True)
        self.client.force_authenticate(self.admin)
        params = {
            "mode": "email",
            "reason": "Passerelle SMS indisponible pour la phase pilote",
            "revision": 0,
            "mfa_code": "123456",
        }
        with patch.object(TOTPDevice, "verify_token", return_value=True) as verify:
            response = self.client.patch(self.url, params, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        verify.assert_called_once_with("123456")
        self.assertEqual(response.data["revision"], 1)
        self.assertEqual(AuthChannelPolicy.objects.get().mode, "email")
        self.assertTrue(
            AuditEvent.objects.filter(action="auth.channels.updated").exists()
        )
        self.assertEqual(
            self.client.patch(self.url, params, format="json").status_code,
            409,
        )

        # Even a correct pending code may not bypass a channel shutdown.
        OTPChallenge.objects.create(
            phone="+261340000201",
            code_hash="unused",
            expires_at="2030-01-01T00:00:00Z",
        )
        anonymous = APIClient()
        for endpoint in ("otp/request/", "otp/verify/"):
            payload = {"phone": "0340000201", "code": "123456"}
            res = anonymous.post("/api/v1/auth/" + endpoint, payload, format="json")
            self.assertEqual(res.status_code, 503)
        public = anonymous.get("/api/v1/auth/methods/")
        self.assertFalse(public.data["sms"]["allowed"])

        with patch.object(TOTPDevice, "verify_token", return_value=True):
            second = self.client.patch(
                self.url,
                {
                    "mode": "none",
                    "reason": "Maintenance urgente des deux canaux de connexion",
                    "revision": 1,
                    "mfa_code": "123456",
                },
                format="json",
            )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            anonymous.post(
                "/api/v1/auth/email/request/",
                {"phone": "0340000204", "email": "new@example.com"},
                format="json",
            ).status_code,
            503,
        )
        self.assertIsNone(
            anonymous.get("/api/v1/auth/methods/").data["default_channel"]
        )

    def test_invalid_mode_revision_or_reason_are_rejected_before_mfa(self):
        TOTPDevice.objects.create(user=self.admin, name="Security key", confirmed=True)
        self.client.force_authenticate(self.admin)
        for payload in (
            {
                "mode": "superuser",
                "reason": "Politique de test valide",
                "revision": 0,
                "mfa_code": "123456",
            },
            {
                "mode": "email",
                "reason": "court",
                "revision": 0,
                "mfa_code": "123456",
            },
            {
                "mode": "email",
                "reason": "Politique de test valide",
                "revision": True,
                "mfa_code": "123456",
            },
        ):
            self.assertEqual(
                self.client.patch(self.url, payload, format="json").status_code,
                400,
            )
        self.assertFalse(AuthChannelPolicy.objects.exists())
