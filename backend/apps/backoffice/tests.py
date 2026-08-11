from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.backoffice.models import AuditEvent, FeatureFlag


class AuditTests(TestCase):
    def test_audit_endpoint_is_staff_only(self):
        user = User.objects.create_user(email="player@mdg.local", phone="+261340000015", display_name="Player")
        client = APIClient(); client.force_authenticate(user)
        self.assertEqual(client.get("/api/v1/backoffice/audit-events/").status_code, 403)
        staff = User.objects.create_user(email="staff@mdg.local", phone="+261340000016", display_name="Staff", is_staff=True)
        AuditEvent.objects.create(actor=user, action="test.action", target_type="User", target_id=str(user.pk))
        client.force_authenticate(staff)
        response = client.get("/api/v1/backoffice/audit-events/")
        self.assertEqual(response.status_code, 200); self.assertEqual(len(response.data["results"]), 1)

    def test_staff_can_toggle_feature_flag(self):
        staff = User.objects.create_user(email="flagstaff@mdg.local", phone="+261340000017", display_name="Flag staff", is_staff=True)
        client = APIClient(); client.force_authenticate(staff)
        response = client.post("/api/v1/backoffice/feature-flags/", {"key": "game_results", "enabled": False, "reason": "Maintenance"}, format="json")
        self.assertEqual(response.status_code, 200); self.assertFalse(FeatureFlag.objects.get(key="game_results").enabled)
