from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.payments.models import PaymentIntent
from apps.responsible_gaming.models import (
    ResponsibleGamingAudit,
    ResponsibleGamingProfile,
)


class ResponsibleGamingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="player.rg@mdg.local",
            phone="+261340000077",
            display_name="Joueur RG",
            kyc_level="verified",
        )
        self.staff_user = User.objects.create_superuser(
            email="staff.rg@mdg.local",
            phone="+261340000078",
            display_name="Admin Staff",
            password="pass",
        )
        self.client = APIClient()

    def test_get_and_update_limits(self):
        self.client.force_authenticate(self.user)
        # 1. Obtenir profil initial
        res = self.client.get("/api/v1/responsible-gaming/status/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["is_blocked"])
        self.assertIsNone(res.data["daily_deposit_limit"])

        # 2. Configurer des limites
        post_res = self.client.post(
            "/api/v1/responsible-gaming/limits/",
            {
                "daily_deposit_limit": 50000,
                "weekly_deposit_limit": 200000,
                "session_time_limit_minutes": 45,
                "reality_check_interval_minutes": 20,
            },
            format="json",
        )
        self.assertEqual(post_res.status_code, 200)
        self.assertEqual(post_res.data["profile"]["daily_deposit_limit"], 50000)
        self.assertEqual(post_res.data["profile"]["session_time_limit_minutes"], 45)
        self.assertEqual(ResponsibleGamingAudit.objects.count(), 1)

    def test_deposit_blocked_by_custom_daily_limit(self):
        self.client.force_authenticate(self.user)
        # Fixer une limite journalière de 30 000 Ar
        self.client.post(
            "/api/v1/responsible-gaming/limits/",
            {"daily_deposit_limit": 30000},
            format="json",
        )

        # 1. Dépôt de 20 000 Ar -> Autorisé
        first_dep = self.client.post(
            "/api/v1/payments/intents/",
            {
                "provider": "mvola",
                "direction": "deposit",
                "amount": 20000,
                "phone_number": "0340000077",
                "idempotency_key": "dep-rg-1",
            },
            format="json",
        )
        self.assertEqual(first_dep.status_code, 201)
        # Marquer comme complété pour simuler la consommation réelle
        PaymentIntent.objects.filter(id=first_dep.data["id"]).update(status="completed")

        # 2. Dépôt de 15 000 Ar supplémentaire (Total 35 000 > 30 000) -> Rejeté
        second_dep = self.client.post(
            "/api/v1/payments/intents/",
            {
                "provider": "mvola",
                "direction": "deposit",
                "amount": 15000,
                "phone_number": "0340000077",
                "idempotency_key": "dep-rg-2",
            },
            format="json",
        )
        self.assertEqual(second_dep.status_code, 400)
        self.assertIn("limite journalière", second_dep.data["detail"].lower())

    def test_cooling_off_activation_and_blocking(self):
        self.client.force_authenticate(self.user)
        # Activer une pause de 24h
        res = self.client.post(
            "/api/v1/responsible-gaming/cooling-off/",
            {"duration_hours": 24, "reason": "Besoin d'une pause"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["profile"]["is_active_cooling_off"])
        self.assertTrue(res.data["profile"]["is_blocked"])

        # Tentative de dépôt pendant la pause -> Rejeté
        dep_res = self.client.post(
            "/api/v1/payments/intents/",
            {
                "provider": "orange",
                "direction": "deposit",
                "amount": 10000,
                "phone_number": "0320000077",
                "idempotency_key": "dep-cooling-off",
            },
            format="json",
        )
        self.assertEqual(dep_res.status_code, 400)
        self.assertIn("pause", dep_res.data["detail"].lower())

    def test_self_exclusion_permanent(self):
        self.client.force_authenticate(self.user)
        # Auto-exclusion définitive
        res = self.client.post(
            "/api/v1/responsible-gaming/self-exclude/",
            {"permanent": True, "reason": "Arrêt définitif"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["profile"]["is_permanently_excluded"])
        self.assertTrue(res.data["profile"]["is_blocked"])

        # Tentative de dépôt -> Rejeté
        dep_res = self.client.post(
            "/api/v1/payments/intents/",
            {
                "provider": "airtel",
                "direction": "deposit",
                "amount": 5000,
                "phone_number": "0330000077",
                "idempotency_key": "dep-excluded",
            },
            format="json",
        )
        self.assertEqual(dep_res.status_code, 400)
        self.assertIn("auto-exclusion", dep_res.data["detail"].lower())

    def test_backoffice_responsible_gaming_list(self):
        profile = ResponsibleGamingProfile.objects.create(
            user=self.user,
            is_permanently_excluded=True,
            self_exclusion_reason="Demande volontaire",
        )

        self.client.force_authenticate(self.staff_user)
        res = self.client.get("/api/v1/responsible-gaming/backoffice/exclusions/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 1)
        self.assertEqual(res.data["results"][0]["user"]["phone"], "+261340000077")
        self.assertTrue(res.data["results"][0]["is_permanently_excluded"])
