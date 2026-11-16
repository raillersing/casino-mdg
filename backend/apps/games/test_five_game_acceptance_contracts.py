"""Five-game REST contracts for staging: distinct accounts, free human seats, no fake engine state."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import GameTable, PlayerPresence, TableSeat


class HumanFiveGameAcceptanceContractTests(TestCase):
    def setUp(self):
        self.players = [
            User.objects.create_user(
                email=f"acceptance-human-{i}@mdg.local",
                phone=f"+2613400098{i:02d}",
                display_name=f"Human {i}",
            )
            for i in range(1, 6)
        ]
        self.clients = []
        for player in self.players:
            client = APIClient()
            client.force_authenticate(player)
            self.clients.append(client)

    def test_every_game_accepts_real_distinct_seats_at_smallest_supported_size(self):
        capability = self.clients[0].get("/api/v1/games/table-capabilities/")
        self.assertEqual(capability.status_code, 200)
        games = capability.data["games"]
        self.assertEqual(set(games), {"belote", "ludo", "domino", "rami", "poker"})

        for game in ("belote", "ludo", "domino", "rami", "poker"):
            with self.subTest(game=game):
                capacity = min(games[game]["players"])
                self.assertTrue(2 <= capacity <= 4)
                response = self.clients[0].post(
                    "/api/v1/games/tables/",
                    {
                        "name": f"Acceptance {game}",
                        "game_type": game,
                        "max_players": capacity,
                        "stake_amount": 0,
                        "turn_duration": 30,
                        "rules_config": {},
                        "is_private": False,
                        "buy_in": 0,
                    },
                    format="json",
                )
                self.assertEqual(response.status_code, 201, response.data)
                self.assertIn("admission_token", response.data)
                table = GameTable.objects.get(pk=response.data["table_id"])
                self.assertEqual(table.game_type, game)
                self.assertEqual(table.max_players, capacity)
                self.assertEqual(table.stake_amount, 0)
                self.assertEqual(table.mode, "HUMAN_MATCH")
                self.assertEqual(table.status, "open")

                seat_indexes = [response.data["seat_index"]]
                for index in range(1, capacity):
                    joined = self.clients[index].post(
                        f"/api/v1/games/tables/{table.pk}/join/",
                        {"buy_in": 0},
                        format="json",
                    )
                    self.assertEqual(joined.status_code, 201, joined.data)
                    self.assertEqual(joined.data["table_id"], str(table.pk))
                    self.assertIn("admission_token", joined.data)
                    seat_indexes.append(joined.data["seat_index"])
                self.assertEqual(len(set(seat_indexes)), capacity)
                self.assertEqual(TableSeat.objects.filter(table=table).count(), capacity)

                for index in range(capacity):
                    admission = self.clients[index].post(
                        f"/api/v1/games/tables/{table.pk}/admission/",
                        {},
                        format="json",
                    )
                    self.assertEqual(admission.status_code, 200)
                    self.assertEqual(admission.data["role"], "player")
                    self.assertIn("admission_token", admission.data)

                # Seated does not mean WebSocket-connected or in a running game.
                self.assertFalse(
                    PlayerPresence.objects.filter(
                        user__in=self.players[:capacity]
                    ).exists()
                )
                self.assertEqual(table.status, "open")

    def test_private_code_is_not_visible_until_invited_player_joins(self):
        creator, outsider = self.clients[0], self.clients[1]
        created = creator.post(
            "/api/v1/games/tables/",
            {
                "name": "Private acceptance ludo",
                "game_type": "ludo",
                "max_players": 2,
                "stake_amount": 0,
                "is_private": True,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        table_id = created.data["table_id"]
        access_code = created.data["access_code"]
        self.assertTrue(access_code)
        outsider_list = outsider.get("/api/v1/games/tables/")
        self.assertEqual(outsider_list.status_code, 200)
        self.assertNotIn(
            table_id, {item["id"] for item in outsider_list.data["results"]}
        )
        denied = outsider.post(
            f"/api/v1/games/tables/{table_id}/join/", {}, format="json"
        )
        self.assertEqual(denied.status_code, 403)
        admission_denied = outsider.post(
            f"/api/v1/games/tables/{table_id}/admission/", {}, format="json"
        )
        self.assertEqual(admission_denied.status_code, 403)

        admitted = outsider.post(
            f"/api/v1/games/tables/{table_id}/join/",
            {"access_code": access_code, "buy_in": 0},
            format="json",
        )
        self.assertEqual(admitted.status_code, 201, admitted.data)
        self.assertEqual(
            TableSeat.objects.filter(table_id=table_id).count(), 2
        )
