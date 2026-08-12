from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.notifications.models import NotificationPreference


class NotificationPreferencesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="notifications@mdg.local",
            phone="+261340009001",
            display_name="Notifications",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_preferences_are_created_with_safe_defaults(self):
        response = self.client.get("/api/v1/notifications/preferences/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["game_invites"])
        self.assertFalse(response.data["product_updates"])

    def test_preferences_patch_is_persisted_and_rejects_non_boolean_values(self):
        updated = self.client.patch(
            "/api/v1/notifications/preferences/",
            {"game_invites": False, "product_updates": True},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        preference = NotificationPreference.objects.get(user=self.user)
        self.assertFalse(preference.game_invites)
        self.assertTrue(preference.product_updates)
        invalid = self.client.patch(
            "/api/v1/notifications/preferences/",
            {"matchmaking": "yes"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
