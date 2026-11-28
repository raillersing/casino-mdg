"""Guest sessions do not depend on OTP and cannot access MGA flows."""

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import GameTable
from apps.games.services import join_table, top_up_table
from apps.payments.services import initiate_payment_intent
from apps.wallet.models import WalletTransaction


class GuestAccessTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def test_guest_uses_server_identity_and_refresh_without_otp(self):
        response = self.client.post(
            "/api/v1/auth/guest/", {"display_name": "Invité"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        user = User.objects.get(pk=data["user"]["id"])
        self.assertTrue(user.phone.startswith("guest_"))
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.is_staff)
        self.assertFalse(user.email_verified_at)
        self.assertFalse(user.phone_verified_at)
        self.assertEqual(data["wallet"]["currency"], "SIM")
        self.assertEqual(data["wallet"]["balance"], 10000)
        self.assertEqual(
            WalletTransaction.objects.filter(user=user, type="bonus").count(), 1
        )
        refreshed = self.client.post(
            "/api/v1/auth/refresh/", {"refresh": data["refresh"]}, format="json"
        )
        self.assertEqual(refreshed.status_code, 200)
        self.client.credentials(
            HTTP_AUTHORIZATION="Bearer " + refreshed.json()["access"]
        )
        self.assertEqual(
            self.client.get("/api/v1/auth/me/").json()["id"], str(user.pk)
        )
        self.assertEqual(
            WalletTransaction.objects.filter(user=user, type="bonus").count(), 1
        )

    def test_guest_creation_has_rate_limit(self):
        for _ in range(5):
            response = self.client.post("/api/v1/auth/guest/", {}, format="json")
            self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.post("/api/v1/auth/guest/", {}, format="json").status_code,
            429,
        )
        self.assertEqual(User.objects.filter(phone__startswith="guest_").count(), 5)

    def test_guest_can_join_free_games_but_cannot_use_paid_tables_or_payments(self):
        guest = User.objects.create_user(
            email="guest_test@mdg.local",
            phone="guest_test",
            display_name="Invité",
        )
        for game_type, _ in GameTable.GAME_TYPES:
            with self.subTest(game_type=game_type):
                table = GameTable.objects.create(
                    name="Free", table_code=f"free-{game_type}", game_type=game_type
                )
                seat, created = join_table(table, guest)
                self.assertTrue(created)
                self.assertEqual(seat.buy_in, 0)
                paid = GameTable.objects.create(
                    name="Paid",
                    table_code=f"paid-{game_type}",
                    game_type=game_type,
                    stake_amount=1000,
                )
                with self.assertRaises(ValueError):
                    join_table(paid, guest)
                self.assertFalse(paid.seats.exists())
                with self.assertRaises(ValueError):
                    top_up_table(paid, guest, 1000)
        with self.assertRaises(ValidationError):
            initiate_payment_intent(
                guest,
                provider="mvola",
                direction="deposit",
                amount=1000,
                phone_number="+261340000000",
                idempotency_key="guest-denied",
                sandbox=True,
            )
