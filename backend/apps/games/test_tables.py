from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import GameTable, TableSeat


@override_settings(DEBUG=True)
class TableApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="joueur@mdg.local", phone="+261340000001", display_name="Joueur"
        )

    def test_public_list_seeds_demo_tables(self):
        response = self.client.get("/api/v1/games/tables/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 4)
        self.assertEqual(
            {item["mode"] for item in response.data["results"]}, {"HUMAN_MATCH"}
        )

    def test_join_is_idempotent_and_never_duplicates_seat(self):
        table = GameTable.objects.create(
            table_code="test-001", name="Test", game_type="poker", max_players=2
        )
        self.client.force_authenticate(self.user)
        first = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        second = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            TableSeat.objects.filter(table=table, user=self.user).count(), 1
        )

    def test_second_player_gets_next_seat_and_full_table_rejects_new_player(self):
        table = GameTable.objects.create(
            table_code="test-full", name="Full", game_type="poker", max_players=2
        )
        second_user = User.objects.create_user(
            email="second@mdg.local", phone="+261340000002", display_name="Second"
        )
        third_user = User.objects.create_user(
            email="third@mdg.local", phone="+261340000003", display_name="Third"
        )

        self.client.force_authenticate(self.user)
        first = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        self.client.force_authenticate(second_user)
        second = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")
        self.client.force_authenticate(third_user)
        rejected = self.client.post(f"/api/v1/games/tables/{table.pk}/join/")

        self.assertEqual(first.data["seat_index"], 0)
        self.assertEqual(second.data["seat_index"], 1)
        self.assertEqual(rejected.status_code, 409)
        self.assertEqual(table.seats.count(), 2)

    def test_club_table_is_visible_and_joinable_only_by_club_members(self):
        from apps.clubs.models import Club, ClubMembership

        club = Club.objects.create(name="Club tables", owner=self.user)
        ClubMembership.objects.create(club=club, user=self.user, role="owner")
        table = GameTable.objects.create(
            table_code="club-table-001",
            name="Table club",
            game_type="poker",
            is_private=True,
            club=club,
            created_by=self.user,
        )
        stranger = User.objects.create_user(
            email="club-stranger@mdg.local",
            phone="+261340000099",
            display_name="Club Stranger",
        )
        self.client.force_authenticate(stranger)
        listed = self.client.get("/api/v1/games/tables/")
        self.assertNotIn(str(table.id), {item["id"] for item in listed.data["results"]})
        self.assertEqual(
            self.client.post(f"/api/v1/games/tables/{table.id}/join/").status_code, 403
        )

    def test_private_table_is_hidden_from_strangers_but_visible_to_owner(self):
        table = GameTable.objects.create(
            table_code="private-001",
            name="Amis",
            game_type="belote",
            is_private=True,
            created_by=self.user,
        )
        stranger = User.objects.create_user(
            email="stranger@mdg.local",
            phone="+261340000003",
            display_name="Stranger",
        )

        self.assertNotIn(
            str(table.id),
            {
                item["id"]
                for item in self.client.get("/api/v1/games/tables/").data["results"]
            },
        )
        self.client.force_authenticate(self.user)
        owner_tables = self.client.get("/api/v1/games/tables/").data["results"]
        self.assertIn(str(table.id), {item["id"] for item in owner_tables})
        self.client.force_authenticate(stranger)
        stranger_tables = self.client.get("/api/v1/games/tables/").data["results"]
        self.assertNotIn(str(table.id), {item["id"] for item in stranger_tables})
        self.assertEqual(
            self.client.post(f"/api/v1/games/tables/{table.id}/join/").status_code,
            403,
        )
