import hashlib
import hmac
import uuid

from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import (
    GameParticipant,
    GameResult,
    GameRound,
    GameSession,
    GameTable,
)
from apps.games.views import game_result_signature_payload
from apps.wallet.models import LedgerEntry, WalletTransaction
from apps.wallet.services import credit_simulation_bonus


def engine_headers(
    game_id, game_type, outcome, amount, metadata=None, player_id=None
):
    signature = hmac.new(
        settings.GAME_ENGINE_RESULT_SECRET.encode(),
        game_result_signature_payload(
            game_id,
            game_type,
            outcome,
            amount,
            metadata or {},
            player_id=player_id,
        ),
        hashlib.sha256,
    ).hexdigest()
    return {"HTTP_X_GAME_ENGINE_SIGNATURE": signature}


class GameResultTests(TestCase):
    def test_win_is_credited_once_when_result_is_retried(self):
        user = User.objects.create_user(
            email="winner@mdg.local", phone="+261340000009", display_name="Winner"
        )
        credit_simulation_bonus(user)
        client = APIClient()
        client.force_authenticate(user)
        payload = {
            "game_id": str(uuid.uuid4()),
            "game_type": "poker",
            "outcome": "win",
            "amount": 250,
        }
        headers = engine_headers(
            payload["game_id"],
            payload["game_type"],
            payload["outcome"],
            payload["amount"],
        )
        first = client.post("/api/v1/games/results/", payload, format="json", **headers)
        second = client.post(
            "/api/v1/games/results/", payload, format="json", **headers
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            WalletTransaction.objects.filter(user=user, type="game").count(), 1
        )
        self.assertEqual(
            LedgerEntry.objects.filter(transaction__type="game").count(), 2
        )

    def test_history_returns_personal_stats(self):
        user = User.objects.create_user(
            email="stats@mdg.local", phone="+261340000010", display_name="Stats"
        )
        client = APIClient()
        client.force_authenticate(user)
        for outcome, amount in (("win", 100), ("loss", 0), ("draw", 0)):
            payload = {
                "game_id": str(uuid.uuid4()),
                "game_type": "rami",
                "outcome": outcome,
                "amount": amount,
            }
            client.post(
                "/api/v1/games/results/",
                payload,
                format="json",
                **(
                    engine_headers(
                        payload["game_id"], payload["game_type"], outcome, amount
                    )
                    if outcome == "win"
                    else {}
                )
            )
        response = client.get("/api/v1/games/results/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["stats"],
            {"played": 3, "wins": 1, "losses": 1, "draws": 1, "total_won": 100},
        )

    def test_win_without_engine_signature_is_rejected(self):
        user = User.objects.create_user(
            email="unsigned@mdg.local", phone="+261340000015", display_name="Unsigned"
        )
        client = APIClient()
        client.force_authenticate(user)
        response = client.post(
            "/api/v1/games/results/",
            {
                "game_id": str(uuid.uuid4()),
                "game_type": "poker",
                "outcome": "win",
                "amount": 100,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_replayed_result_with_different_payload_is_rejected(self):
        user = User.objects.create_user(
            email="replay@mdg.local", phone="+261340000016", display_name="Replay"
        )
        client = APIClient()
        client.force_authenticate(user)
        game_id = str(uuid.uuid4())
        payload = {
            "game_id": game_id,
            "game_type": "poker",
            "outcome": "win",
            "amount": 100,
        }
        first = client.post(
            "/api/v1/games/results/",
            payload,
            format="json",
            **engine_headers(game_id, "poker", "win", 100)
        )
        replay = {**payload, "amount": 999}
        second = client.post(
            "/api/v1/games/results/",
            replay,
            format="json",
            **engine_headers(game_id, "poker", "win", 999)
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(
            WalletTransaction.objects.filter(user=user, type="game").count(), 1
        )

    def test_win_signed_for_another_user_is_rejected(self):
        first_user = User.objects.create_user(
            email="legit@mdg.local", phone="+261340000017", display_name="LegitWinner"
        )
        second_user = User.objects.create_user(
            email="thief@mdg.local", phone="+261340000018", display_name="Thief"
        )
        game_id = str(uuid.uuid4())
        payload = {
            "game_id": game_id,
            "game_type": "poker",
            "outcome": "win",
            "amount": 500,
        }
        # Signature bound to first_user
        headers_for_first = engine_headers(
            game_id, "poker", "win", 500, player_id=str(first_user.pk)
        )
        client = APIClient()
        # Second user tries to use first_user's signature
        client.force_authenticate(second_user)
        response = client.post(
            "/api/v1/games/results/", payload, format="json", **headers_for_first
        )
        self.assertEqual(response.status_code, 403)

    def test_multiple_players_can_record_results_for_same_game_id(self):
        winner = User.objects.create_user(
            email="tablewinner@mdg.local", phone="+261340000019", display_name="TableWinner"
        )
        loser = User.objects.create_user(
            email="tableloser@mdg.local", phone="+261340000020", display_name="TableLoser"
        )
        credit_simulation_bonus(winner)
        game_id = str(uuid.uuid4())
        client = APIClient()

        # Loser records their loss
        client.force_authenticate(loser)
        loser_resp = client.post(
            "/api/v1/games/results/",
            {"game_id": game_id, "game_type": "poker", "outcome": "loss", "amount": 0},
            format="json",
        )
        self.assertEqual(loser_resp.status_code, 201)

        # Winner records their win with player-bound signature
        client.force_authenticate(winner)
        winner_headers = engine_headers(
            game_id, "poker", "win", 300, player_id=str(winner.pk)
        )
        winner_resp = client.post(
            "/api/v1/games/results/",
            {"game_id": game_id, "game_type": "poker", "outcome": "win", "amount": 300},
            format="json",
            **winner_headers,
        )
        self.assertEqual(winner_resp.status_code, 201)

        # Both results exist for the same game_id
        self.assertEqual(GameResult.objects.filter(game_id=game_id).count(), 2)

    def test_game_session_round_and_participants_persistence(self):
        owner = User.objects.create_user(
            email="sessionowner@mdg.local", phone="+261340000021", display_name="SessionOwner"
        )
        guest = User.objects.create_user(
            email="sessionguest@mdg.local", phone="+261340000022", display_name="SessionGuest"
        )
        table = GameTable.objects.create(
            table_code="fullring-test-01",
            name="Full Ring Test Table",
            game_type="poker",
            max_players=9,
            status="running",
            created_by=owner,
        )
        session = GameSession.objects.create(
            table=table,
            status="active",
        )
        round_1 = GameRound.objects.create(
            session=session,
            round_number=1,
            pot_total=1200,
            status="settled",
        )
        p1 = GameParticipant.objects.create(
            round=round_1,
            user=owner,
            seat_index=0,
            bet_amount=600,
            payout=1200,
            net_gain=600,
            outcome="win",
            hand_rank="Flush",
        )
        p2 = GameParticipant.objects.create(
            round=round_1,
            user=guest,
            seat_index=1,
            bet_amount=600,
            payout=0,
            net_gain=-600,
            outcome="loss",
            hand_rank="Two Pair",
        )
        res = GameResult.objects.create(
            game_id=str(round_1.pk),
            user=owner,
            game_type="poker",
            outcome="win",
            amount=600,
            round=round_1,
            participant=p1,
        )
        self.assertEqual(session.rounds.count(), 1)
        self.assertEqual(round_1.participants.count(), 2)
        self.assertEqual(round_1.results.count(), 1)
        self.assertEqual(p1.results.first(), res)
        self.assertEqual(p2.results.count(), 0)

    def test_leaderboard_is_ranked_by_wins_then_winnings(self):
        first = User.objects.create_user(
            email="first@mdg.local", phone="+261340000013", display_name="First"
        )
        second = User.objects.create_user(
            email="second@mdg.local", phone="+261340000014", display_name="Second"
        )
        client = APIClient()
        for _ in range(2):
            client.force_authenticate(first)
            payload = {
                "game_id": str(uuid.uuid4()),
                "game_type": "poker",
                "outcome": "win",
                "amount": 10,
            }
            client.post(
                "/api/v1/games/results/",
                payload,
                format="json",
                **engine_headers(
                    payload["game_id"],
                    payload["game_type"],
                    payload["outcome"],
                    payload["amount"],
                )
            )
        client.force_authenticate(second)
        payload = {
            "game_id": str(uuid.uuid4()),
            "game_type": "poker",
            "outcome": "win",
            "amount": 500,
        }
        client.post(
            "/api/v1/games/results/",
            payload,
            format="json",
            **engine_headers(
                payload["game_id"],
                payload["game_type"],
                payload["outcome"],
                payload["amount"],
            )
        )
        ranking = client.get("/api/v1/games/leaderboard/")
        self.assertEqual(ranking.status_code, 200)
        self.assertEqual(ranking.data["results"][0]["display_name"], "First")
