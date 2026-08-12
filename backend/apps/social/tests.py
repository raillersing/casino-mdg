from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.games.models import GameTable, TableSeat
from apps.social.models import TableInvitation


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

    def test_invitation_can_be_accepted_once_and_replayed_by_same_user(self):
        created = self.client.post(
            f"/api/v1/social/tables/{self.table.pk}/invitations/"
        )
        token = created.data["token"]
        outsider = APIClient()
        outsider.force_authenticate(self.other)
        accepted = outsider.post(f"/api/v1/social/invitations/{token}/accept/")
        replay = outsider.post(f"/api/v1/social/invitations/{token}/accept/")
        self.assertEqual(accepted.status_code, 201)
        self.assertTrue(accepted.data["created"])
        self.assertEqual(replay.status_code, 200)
        self.assertFalse(replay.data["created"])
        self.assertEqual(TableSeat.objects.filter(table=self.table).count(), 2)

    def test_expired_invitation_is_rejected_and_marked_expired(self):
        invitation = TableInvitation.objects.create(
            table=self.table,
            inviter=self.user,
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        outsider = APIClient()
        outsider.force_authenticate(self.other)

        response = outsider.post(
            f"/api/v1/social/invitations/{invitation.token}/accept/"
        )

        invitation.refresh_from_db()
        self.assertEqual(response.status_code, 410)
        self.assertEqual(invitation.status, "expired")
        self.assertEqual(TableSeat.objects.filter(table=self.table).count(), 1)
