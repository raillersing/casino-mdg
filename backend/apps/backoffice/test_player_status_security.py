"""Superuser/TOTP status changes revoke old access and refresh JWT tokens."""

from unittest.mock import patch

from django.test import TestCase
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

from apps.accounts.authentication import encode_token
from apps.accounts.models import User
from apps.backoffice.models import AuditEvent


class PlayerStatusSecurityTests(TestCase):
    def setUp(self):
        self.player = User.objects.create_user(
            email="status-player@example.test",
            phone="+261340002101",
            display_name="Player",
        )
        self.admin = User.objects.create_superuser(
            email="status-admin@example.test",
            password="test-password-not-production",
            phone="+261340002102",
            display_name="Admin",
        )
        self.client = APIClient()
        self.url = f"/api/v1/backoffice/players/{self.player.pk}/status/"

    def payload(self, action="suspend", expected=True):
        return {
            "action": action,
            "expected_active": expected,
            "reason": "Suspicion contrôlée avec justificatif traçable",
            "mfa_code": "123456",
        }

    def test_only_superuser_with_totp_can_change_status(self):
        self.client.force_authenticate(self.player)
        self.assertEqual(
            self.client.post(self.url, self.payload(), format="json").status_code,
            403,
        )
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post(self.url, self.payload(), format="json").status_code,
            403,
        )
        self.player.refresh_from_db()
        self.assertTrue(self.player.is_active)
        self.assertEqual(self.player.token_version, 0)

    def test_suspend_revokes_access_refresh_and_reactivate_does_not_restore_them(self):
        access = encode_token(self.player)
        refresh = encode_token(self.player, "refresh", 3600)
        TOTPDevice.objects.create(user=self.admin, name="Admin", confirmed=True)
        self.client.force_authenticate(self.admin)
        with patch.object(TOTPDevice, "verify_token", return_value=True):
            suspended = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(suspended.status_code, 200, suspended.data)
        self.assertFalse(suspended.data["is_active"])
        self.player.refresh_from_db()
        self.assertEqual(self.player.token_version, 1)
        self.assertEqual(
            AuditEvent.objects.filter(action="player.suspended").count(), 1
        )
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)
        self.client.credentials()
        self.assertEqual(
            self.client.post(
                "/api/v1/auth/refresh/", {"refresh": refresh}, format="json"
            ).status_code,
            401,
        )
        self.client.force_authenticate(self.admin)
        with patch.object(TOTPDevice, "verify_token", return_value=True):
            restored = self.client.post(
                self.url, self.payload("reactivate", False), format="json"
            )
        self.assertEqual(restored.status_code, 200, restored.data)
        self.player.refresh_from_db()
        self.assertEqual(self.player.token_version, 2)
        self.assertEqual(
            AuditEvent.objects.filter(action="player.reactivated").count(), 1
        )
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)
        self.client.credentials()
        self.assertEqual(
            self.client.post(
                "/api/v1/auth/refresh/", {"refresh": refresh}, format="json"
            ).status_code,
            401,
        )
        new_access = encode_token(self.player)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {new_access}")
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 200)

    def test_stale_state_and_invalid_reason_fail_closed(self):
        TOTPDevice.objects.create(user=self.admin, name="Admin", confirmed=True)
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post(
                self.url, self.payload(expected=False), format="json"
            ).status_code,
            409,
        )
        invalid = self.payload()
        invalid["reason"] = "short"
        self.assertEqual(
            self.client.post(self.url, invalid, format="json").status_code, 400
        )
        self.player.refresh_from_db()
        self.assertTrue(self.player.is_active)
