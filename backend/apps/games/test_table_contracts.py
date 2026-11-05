from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User

from .models import GameTable, TableSeat
from .table_rules import validate_table_settings


class TableContractTests(TestCase):
    def test_supported_rules_and_money_fail_closed(self):
        self.assertEqual(
            validate_table_settings("belote", 4, 30, {"target_score": 1001}, 0),
            {"target_score": 1001},
        )
        for args in [
            ("belote", 2, 30, {}, 0),
            ("ludo", 4, 30, {"fast_exit": True}, 0),
            ("poker", 6, 30, {}, 100),
            ("rami", 4, 1, {}, 0),
        ]:
            with self.assertRaises(ValueError):
                validate_table_settings(*args)

    @patch("apps.games.views.engine_activity")
    def test_live_counts_and_resume_require_engine(self, engine):
        user = User.objects.create_user(
            email="resume@mdg.local", phone="+261340009992", display_name="Resume"
        )
        table = GameTable.objects.create(
            name="Resume",
            table_code="resume-test",
            game_type="belote",
            created_by=user,
            status="running",
        )
        TableSeat.objects.create(table=table, user=user, seat_index=0)
        engine.return_value = {}
        client = APIClient()
        client.force_authenticate(user)
        self.assertEqual(client.get("/api/v1/games/resumable/").data["results"], [])
        engine.return_value = {
            str(table.pk): {"game": "belote", "started": True, "humans": [str(user.pk)]}
        }
        stats = client.get("/api/v1/games/live-stats/").data
        self.assertEqual(stats["total_in_game_players"], 1)
        self.assertEqual(stats["total_running_tables"], 1)
        self.assertEqual(len(client.get("/api/v1/games/resumable/").data["results"]), 1)
