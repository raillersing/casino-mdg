"""Back-office matchmaking incidents are read-only for operations staff."""

from datetime import timedelta

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import MatchmakingTicket


class QueueDiagnosticsTests(TestCase):
    def test_stale_queue_is_observable_without_live_engine_claim(self):
        player = User.objects.create_user(
            email="queue-player@example.test",
            phone="+261340002111",
            display_name="Queue player",
        )
        staff = User.objects.create_user(
            email="queue-staff@example.test",
            phone="+261340002112",
            display_name="Operations",
            is_staff=True,
        )
        staff.groups.add(Group.objects.create(name="casino:operations"))
        ticket = MatchmakingTicket.objects.create(user=player, game_type="poker")
        MatchmakingTicket.objects.filter(pk=ticket.pk).update(
            updated_at=timezone.now() - timedelta(minutes=5)
        )
        client = APIClient()
        client.force_authenticate(staff)
        response = client.get("/api/v1/backoffice/games/matchmaking/diagnostics/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["queued_stale"], 1)
        self.assertFalse(response.data["engine_state_verified"])
        self.assertEqual(len(response.data["stale_sample"]), 1)
        self.assertEqual(
            client.post(
                f"/api/v1/backoffice/games/matchmaking/tickets/{ticket.pk}/cancel/",
                {},
                format="json",
            ).status_code,
            403,
        )
