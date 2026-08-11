from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import GameTable, TableSeat


@override_settings(DEBUG=True)
class TableApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email="joueur@mdg.local", phone="+261340000001", display_name="Joueur")

    def test_public_list_seeds_demo_tables(self):
        response = self.client.get("/api/v1/games/tables/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 4)

    def test_join_is_idempotent_and_never_duplicates_seat(self):
        table = GameTable.objects.create(table_code="test-001", name="Test", game_type="poker", max_players=2)
        self.client.force_authenticate(self.user)
        first = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        second = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(TableSeat.objects.filter(table=table, user=self.user).count(), 1)
