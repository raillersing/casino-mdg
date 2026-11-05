from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import Tournament


class TournamentApiTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            email="tourney1@mdg.local",
            phone="+261340009901",
            display_name="TourneyPlayer1",
        )
        self.user2 = User.objects.create_user(
            email="tourney2@mdg.local",
            phone="+261340009902",
            display_name="TourneyPlayer2",
        )
        self.client = APIClient()

    def test_tournaments_list_auto_seeds_and_returns_results(self):
        response = self.client.get("/api/v1/games/tournaments/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)
        self.assertTrue(len(response.data["results"]) >= 3)
        sng = response.data["results"][0]
        self.assertIn("name", sng)
        self.assertIn("buy_in", sng)
        self.assertIn("starting_chips", sng)
        self.assertIn("prize_pool", sng)

    def test_user_can_create_custom_tournament(self):
        self.client.force_authenticate(self.user1)
        created = self.client.post(
            "/api/v1/games/tournaments/",
            {
                "name": "Tournoi Privé Tana",
                "buy_in": 2000,
                "max_players": 6,
                "game_type": "poker",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["name"], "Tournoi Privé Tana")
        self.assertEqual(created.data["buy_in"], 2000)

    def test_user_can_register_and_launch_sng_when_full(self):
        tournament = Tournament.objects.create(
            name="Heads-Up SNG Flash",
            buy_in=1000,
            max_players=2,
            game_type="poker",
            status="registering",
        )

        # Player 1 registers
        self.client.force_authenticate(self.user1)
        reg1 = self.client.post(f"/api/v1/games/tournaments/{tournament.id}/register/")
        self.assertEqual(reg1.status_code, 201)
        self.assertEqual(reg1.data["status"], "registered")

        # Duplicate registration fails
        dup = self.client.post(f"/api/v1/games/tournaments/{tournament.id}/register/")
        self.assertEqual(dup.status_code, 400)

        # Details view shows 1 participant
        detail = self.client.get(f"/api/v1/games/tournaments/{tournament.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(detail.data["participants"]), 1)
        self.assertEqual(
            detail.data["participants"][0]["display_name"], "TourneyPlayer1"
        )

        # Player 2 registers -> tournament fills up and starts
        self.client.force_authenticate(self.user2)
        reg2 = self.client.post(f"/api/v1/games/tournaments/{tournament.id}/register/")
        self.assertEqual(reg2.status_code, 201)

        tournament.refresh_from_db()
        self.assertEqual(tournament.status, "running")
        self.assertIsNotNone(tournament.started_at)
        self.assertEqual(tournament.prize_pool, 2000)
