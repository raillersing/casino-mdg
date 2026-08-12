import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.analytics.models import ProductEvent


class ProductEventApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.event_id = str(uuid.uuid4())

    def test_event_is_anonymous_and_idempotent(self):
        payload = {
            "event_id": self.event_id,
            "event_name": "activation_viewed",
            "anonymous_id": "anon-1",
            "session_id": "session-1",
            "metadata": {"source": "home"},
        }
        first = self.client.post("/api/v1/analytics/events/", payload, format="json")
        retry = self.client.post("/api/v1/analytics/events/", payload, format="json")
        self.assertEqual(first.status_code, 202)
        self.assertEqual(retry.status_code, 202)
        self.assertFalse(retry.data["created"])
        self.assertEqual(ProductEvent.objects.count(), 1)
        self.assertIsNone(ProductEvent.objects.get().user)

    def test_unknown_event_and_conflicting_id_are_rejected(self):
        unknown = self.client.post(
            "/api/v1/analytics/events/",
            {"event_id": self.event_id, "event_name": "fake_counter"},
            format="json",
        )
        self.assertEqual(unknown.status_code, 400)
        self.client.post(
            "/api/v1/analytics/events/",
            {"event_id": self.event_id, "event_name": "activation_viewed"},
            format="json",
        )
        conflict = self.client.post(
            "/api/v1/analytics/events/",
            {
                "event_id": self.event_id,
                "event_name": "game_error",
                "metadata": {"x": 1},
            },
            format="json",
        )
        self.assertEqual(conflict.status_code, 409)

    def test_summary_is_staff_only(self):
        self.client.post(
            "/api/v1/analytics/events/",
            {"event_id": self.event_id, "event_name": "test_games_opened"},
            format="json",
        )
        self.assertEqual(self.client.get("/api/v1/analytics/summary/").status_code, 401)
        staff = User.objects.create_user(
            email="analytics-staff@mdg.local",
            phone="+261340009999",
            display_name="Analytics Staff",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        response = self.client.get("/api/v1/analytics/summary/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["events"]["test_games_opened"], 1)

    def test_pilot_gate_requires_data_and_blocks_on_game_errors(self):
        staff = User.objects.create_user(
            email="gate-staff@mdg.local",
            phone="+261340009998",
            display_name="Gate Staff",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        pending = self.client.get("/api/v1/analytics/pilot-gate/")
        self.assertEqual(pending.status_code, 200)
        self.assertEqual(pending.data["status"], "monitor")
        self.client.force_authenticate(None)
        self.client.post(
            "/api/v1/analytics/events/",
            {
                "event_id": str(uuid.uuid4()),
                "event_name": "game_error",
                "metadata": {"source": "pilot"},
            },
            format="json",
        )
        self.client.force_authenticate(staff)
        blocked = self.client.get("/api/v1/analytics/pilot-gate/")
        self.assertEqual(blocked.data["status"], "blocked")
