"""Product telemetry regression tests: client journey events are not gameplay proofs."""

import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.analytics.models import ProductEvent


class PlayJourneyTelemetryTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _event(self, event_name, source="lobby"):
        return self.client.post(
            "/api/v1/analytics/events/",
            {
                "event_id": str(uuid.uuid4()),
                "event_name": event_name,
                "anonymous_id": "journey-anon",
                "session_id": "journey-session",
                "game_type": "belote",
                "metadata": {"source": source},
            },
            format="json",
        )

    def test_journey_event_names_are_accepted_without_identity(self):
        for event_name in (
            "game_selected",
            "table_creation_started",
            "table_created",
            "table_creation_failed",
            "table_join_attempted",
            "table_join_failed",
            "matchmaking_failed",
            "engine_state_received",
        ):
            with self.subTest(event=event_name):
                response = self._event(event_name)
                self.assertEqual(response.status_code, 202)
        self.assertEqual(ProductEvent.objects.count(), 8)
        self.assertFalse(ProductEvent.objects.exclude(user__isnull=True).exists())

    def test_admin_summary_exposes_raw_counts_not_inferred_conversions(self):
        for event_name in (
            "game_selected",
            "game_selected",
            "matchmaking_started",
            "matchmaking_failed",
            "table_creation_started",
            "table_created",
            "table_join_attempted",
            "table_join_failed",
            "engine_state_received",
        ):
            response = self._event(event_name)
            self.assertEqual(response.status_code, 202)

        staff = User.objects.create_user(
            email="journey-staff@mdg.local",
            phone="+261340009981",
            display_name="Journey Admin",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        response = self.client.get("/api/v1/analytics/summary/")
        self.assertEqual(response.status_code, 200)
        journey = response.data["play_journey"]
        self.assertEqual(journey["source"], "client_telemetry")
        self.assertEqual(journey["unit"], "events")
        self.assertEqual(journey["events"]["game_selected"], 2)
        self.assertEqual(journey["events"]["matchmaking_started"], 1)
        self.assertEqual(journey["events"]["matchmaking_failed"], 1)
        self.assertEqual(journey["events"]["human_match_found"], 0)
        self.assertEqual(journey["events"]["table_creation_started"], 1)
        self.assertEqual(journey["events"]["table_created"], 1)
        self.assertEqual(journey["events"]["table_join_failed"], 1)
        self.assertEqual(journey["events"]["engine_state_received"], 1)
        self.assertNotIn("conversion_rate", journey)
