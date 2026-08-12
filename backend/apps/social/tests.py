from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import GameTable, TableSeat


class SocialTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="social@mdg.local", phone="+261340000011", display_name="Social"
        )
        self.other = User.objects.create_user(
            email="other@mdg.local", phone="+261340000012", display_name="Other"
        )
        self.table = GameTable.objects.create(
            table_code="social-001",
            name="Social",
            game_type="poker",
            created_by=self.user,
        )
        TableSeat.objects.create(table=self.table, user=self.user, seat_index=0)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_chat_is_persisted_and_blocked_content_is_not_published(self):
        response = self.client.post(
            f"/api/v1/social/tables/{self.table.pk}/chat/",
            {"body": "Bonne chance"},
            format="json",
        )
        blocked = self.client.post(
            f"/api/v1/social/tables/{self.table.pk}/chat/",
            {"body": "spam"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["author"], "Social")
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(
            self.client.get(f"/api/v1/social/tables/{self.table.pk}/chat/").data[
                "results"
            ][0]["body"],
            "Bonne chance",
        )

    def test_invitation_requires_table_access(self):
        response = self.client.post(
            f"/api/v1/social/tables/{self.table.pk}/invitations/"
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["token"])
        outsider = APIClient()
        outsider.force_authenticate(self.other)
        self.assertEqual(
            outsider.post(
                f"/api/v1/social/tables/{self.table.pk}/invitations/"
            ).status_code,
            403,
        )
