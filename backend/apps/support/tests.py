from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.support.models import PilotFeedback, SupportTicket


class SupportTests(TestCase):
    def test_user_can_create_and_list_only_own_tickets(self):
        user = User.objects.create_user(
            email="support@mdg.local", phone="+261340000026", display_name="Support"
        )
        client = APIClient()
        client.force_authenticate(user)
        created = client.post(
            "/api/v1/support/tickets/",
            {
                "category": "wallet",
                "subject": "Solde",
                "description": "Je souhaite comprendre mon historique.",
            },
            format="json",
        )
        listed = client.get("/api/v1/support/tickets/")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data["results"]), 1)
        self.assertEqual(SupportTicket.objects.count(), 1)

    def test_user_can_submit_pilot_feedback_and_staff_can_read_summary(self):
        user = User.objects.create_user(
            email="pilot@mdg.local", phone="+261340000027", display_name="Pilot"
        )
        client = APIClient()
        client.force_authenticate(user)
        created = client.post(
            "/api/v1/support/feedback/",
            {
                "rating": 5,
                "category": "gameplay",
                "message": "La partie est claire et rapide.",
                "game_type": "poker",
                "session_id": "pilot-session",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(PilotFeedback.objects.count(), 1)
        staff = User.objects.create_user(
            email="pilot-staff@mdg.local",
            phone="+261340000028",
            display_name="Pilot Staff",
            is_staff=True,
        )
        client.force_authenticate(staff)
        summary = client.get("/api/v1/support/feedback/summary/")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data["average_rating"], 5.0)
