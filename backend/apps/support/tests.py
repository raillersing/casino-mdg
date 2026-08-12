from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.support.models import SupportTicket


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
