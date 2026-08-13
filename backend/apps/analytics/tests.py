import uuid
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.analytics.models import PilotParticipant, ProductEvent
from apps.backoffice.models import AuditEvent
from apps.support.models import PilotFeedback


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

    def test_summary_exposes_pilot_funnel_and_unique_dimensions(self):
        for event_name in (
            "activation_viewed",
            "demo_started",
            "test_game_played",
            "first_game_completed",
            "game_error",
        ):
            self.client.post(
                "/api/v1/analytics/events/",
                {
                    "event_id": str(uuid.uuid4()),
                    "event_name": event_name,
                    "anonymous_id": "pilot-user",
                    "session_id": "pilot-session",
                },
                format="json",
            )
        staff = User.objects.create_user(
            email="summary-staff@mdg.local",
            phone="+261340009997",
            display_name="Summary Staff",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        response = self.client.get("/api/v1/analytics/summary/")
        self.assertEqual(response.data["unique_actors"], 1)
        self.assertEqual(response.data["unique_sessions"], 1)
        self.assertEqual(response.data["funnel"]["first_game_completed"], 1)
        self.assertEqual(response.data["errors_per_completed_game"], 1)

    def test_summary_exposes_reconnects_and_heartbeat_latency(self):
        for latency in (100, 200, 300):
            self.client.post(
                "/api/v1/analytics/events/",
                {
                    "event_id": str(uuid.uuid4()),
                    "event_name": "heartbeat_latency",
                    "anonymous_id": "pilot-user",
                    "session_id": "pilot-session",
                    "metadata": {"latency_ms": latency},
                },
                format="json",
            )
        self.client.post(
            "/api/v1/analytics/events/",
            {
                "event_id": str(uuid.uuid4()),
                "event_name": "reconnection_succeeded",
                "anonymous_id": "pilot-user",
                "session_id": "pilot-session",
            },
            format="json",
        )
        staff = User.objects.create_user(
            email="network-staff@mdg.local",
            phone="+261340009996",
            display_name="Network Staff",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        response = self.client.get("/api/v1/analytics/summary/")
        self.assertEqual(response.data["reconnections_succeeded"], 1)
        self.assertEqual(response.data["heartbeat_latency_ms"]["samples"], 3)
        self.assertEqual(response.data["heartbeat_latency_ms"]["average"], 200)
        self.assertEqual(response.data["heartbeat_latency_ms"]["p95"], 200)

    def test_summary_calculates_eligible_d1_and_d7_retention(self):
        now = timezone.now()
        for event_name, days_ago in (
            ("activation_viewed", 8),
            ("test_games_opened", 7),
            ("test_games_opened", 1),
        ):
            event = ProductEvent.objects.create(
                event_name=event_name,
                anonymous_id="retention-user",
                session_id=f"retention-{days_ago}",
            )
            ProductEvent.objects.filter(pk=event.pk).update(
                created_at=now - timedelta(days=days_ago)
            )
        recent = ProductEvent.objects.create(
            event_name="activation_viewed",
            anonymous_id="recent-user",
            session_id="recent-session",
        )
        ProductEvent.objects.filter(pk=recent.pk).update(created_at=now)
        staff = User.objects.create_user(
            email="retention-staff@mdg.local",
            phone="+261340009995",
            display_name="Retention Staff",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        response = self.client.get("/api/v1/analytics/summary/")
        self.assertEqual(response.data["retention"]["d1"]["eligible_actors"], 1)
        self.assertEqual(response.data["retention"]["d1"]["returned_actors"], 1)
        self.assertEqual(response.data["retention"]["d7"]["eligible_actors"], 1)
        self.assertEqual(response.data["retention"]["d7"]["returned_actors"], 1)

    def test_pilot_gate_requires_data_and_blocks_on_game_errors(self):
        player = User.objects.create_user(
            email="gate-player@mdg.local",
            phone="+261340009993",
            display_name="Gate Player",
        )
        PilotParticipant.objects.create(user=player)
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
        self.client.force_authenticate(player)
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

    def test_pilot_gate_ignores_events_and_feedback_outside_cohort(self):
        outsider = User.objects.create_user(
            email="outsider@mdg.local",
            phone="+261340009987",
            display_name="Outsider",
        )
        for event_name in ("first_game_completed", "game_error"):
            ProductEvent.objects.create(event_name=event_name, user=outsider)
        PilotFeedback.objects.create(
            user=outsider,
            rating=5,
            category="gameplay",
            message="Outside cohort",
        )
        staff = User.objects.create_user(
            email="cohort-gate-staff@mdg.local",
            phone="+261340009986",
            display_name="Cohort Gate Staff",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        response = self.client.get("/api/v1/analytics/pilot-gate/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["scope"], "pilot_cohort")
        self.assertEqual(response.data["participants"], 0)
        self.assertEqual(response.data["status"], "monitor")
        self.assertEqual(response.data["criteria"][2]["observed"], 0)

    def test_staff_can_register_and_track_pilot_participant_progress(self):
        player = User.objects.create_user(
            email="pilot-player@mdg.local",
            phone="+261340009991",
            display_name="Pilot Player",
        )
        staff = User.objects.create_user(
            email="participant-staff@mdg.local",
            phone="+261340009990",
            display_name="Participant Staff",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        created = self.client.post(
            "/api/v1/analytics/pilot-participants/",
            {"email": player.email},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        participant = PilotParticipant.objects.get(user=player)
        for event_name in ("activation_viewed", "test_game_played"):
            ProductEvent.objects.create(event_name=event_name, user=player)
        listing = self.client.get("/api/v1/analytics/pilot-participants/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(
            listing.data["results"][0]["progress"],
            {
                "activated": True,
                "played": True,
                "completed": False,
            },
        )
        updated = self.client.patch(
            f"/api/v1/analytics/pilot-participants/{participant.pk}/",
            {"status": "active"},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["status"], "active")
        self.assertTrue(
            AuditEvent.objects.filter(
                action="pilot_participant.status_updated",
                target_id=str(participant.pk),
                metadata={"from": "invited", "to": "active"},
            ).exists()
        )
        invalid = self.client.patch(
            f"/api/v1/analytics/pilot-participants/{participant.pk}/",
            {"status": "unknown"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

    def test_staff_can_list_pilot_sessions_from_existing_events(self):
        player = User.objects.create_user(
            email="session-player@mdg.local",
            phone="+261340009989",
            display_name="Session Player",
        )
        PilotParticipant.objects.create(user=player)
        for event_name in ("test_game_played", "first_game_completed"):
            ProductEvent.objects.create(
                event_name=event_name,
                user=player,
                session_id="session-42",
                game_type="poker",
                mode="DEMO_AI",
            )
        staff = User.objects.create_user(
            email="session-staff@mdg.local",
            phone="+261340009988",
            display_name="Session Staff",
            is_staff=True,
        )
        self.client.force_authenticate(staff)
        response = self.client.get("/api/v1/analytics/pilot-sessions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["session_id"], "session-42")
        self.assertTrue(response.data["results"][0]["completed"])
        self.assertEqual(response.data["results"][0]["game_types"], ["poker"])
