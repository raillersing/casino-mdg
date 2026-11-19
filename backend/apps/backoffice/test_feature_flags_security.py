"""Authorization checks for back-office feature flag changes."""

from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.backoffice.models import AuditEvent, FeatureFlag


class FeatureFlagSecurityTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="flags-root@mdg.local",
            phone="+261340000610",
            display_name="Admin",
            is_staff=True,
            is_superuser=True,
        )
        self.staff = User.objects.create_user(
            email="flags-staff@mdg.local",
            phone="+261340000611",
            display_name="Operator",
            is_staff=True,
        )
        self.staff.groups.add(
            Group.objects.get_or_create(name="casino:security_auditor")[0]
        )
        self.flag = FeatureFlag.objects.create(
            key="game_results", enabled=True, reason="Initial setup"
        )
        self.client = APIClient()
        self.url = "/api/v1/backoffice/feature-flags/"

    def payload(self):
        return {
            "key": "game_results",
            "enabled": False,
            "reason": "Planned game engine maintenance",
            "expected_updated_at": self.flag.updated_at.isoformat(),
            "mfa_code": "123456",
        }

    def test_staff_read_only_and_superuser_needs_confirmed_device(self):
        self.client.force_authenticate(self.staff)
        self.assertFalse(self.client.get(self.url).data["can_update"])
        self.assertEqual(
            self.client.post(self.url, self.payload(), format="json").status_code,
            403,
        )
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post(self.url, self.payload(), format="json").status_code,
            403,
        )
        self.assertTrue(self.flag.enabled)

    def test_authorized_toggle_audited_and_replay_rejected(self):
        TOTPDevice.objects.create(user=self.admin, name="Verified", confirmed=True)
        self.client.force_authenticate(self.admin)
        body = self.payload()
        with patch.object(TOTPDevice, "verify_token", return_value=True):
            updated = self.client.post(self.url, body, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertFalse(updated.data["enabled"])
        with patch.object(TOTPDevice, "verify_token", return_value=True):
            replay = self.client.post(self.url, body, format="json")
        self.assertEqual(replay.status_code, 409)
        self.assertEqual(
            AuditEvent.objects.filter(action="feature_flag.updated").count(), 1
        )
        self.flag.refresh_from_db()
        self.assertFalse(self.flag.enabled)

    def test_invalid_values_cannot_create_or_change_flags(self):
        TOTPDevice.objects.create(user=self.admin, name="Verified", confirmed=True)
        self.client.force_authenticate(self.admin)
        for key, value, status in (
            ("enabled", "false", 400),
            ("reason", "too short", 400),
            ("mfa_code", "bad", 403),
            ("key", "unknown_flag", 404),
        ):
            data = self.payload()
            data[key] = value
            self.assertEqual(
                self.client.post(self.url, data, format="json").status_code,
                status,
            )
        self.assertTrue(FeatureFlag.objects.get(pk=self.flag.pk).enabled)
