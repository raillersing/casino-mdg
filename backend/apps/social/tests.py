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

    def test_friendship_lifecycle_request_accept_and_table_invite(self):
        # 1. User sends friend request to other
        req_res = self.client.post(
            "/api/v1/social/friends/",
            {"target": "Other"},
            format="json",
        )
        self.assertEqual(req_res.status_code, 201)

        # 2. Other views pending requests and accepts
        other_client = APIClient()
        other_client.force_authenticate(self.other)
        friends_list = other_client.get("/api/v1/social/friends/")
        self.assertEqual(len(friends_list.data["pending_received"]), 1)
        friendship_id = friends_list.data["pending_received"][0]["friendship_id"]

        accept_res = other_client.post(
            f"/api/v1/social/friends/{friendship_id}/accept/"
        )
        self.assertEqual(accept_res.status_code, 200)

        # 3. User can now invite friend to table
        invite_res = self.client.post(
            f"/api/v1/social/friends/{self.other.pk}/invite-table/",
            {"table_id": str(self.table.pk)},
            format="json",
        )
        self.assertEqual(invite_res.status_code, 201)
        self.assertTrue(invite_res.data["token"])

    def test_direct_conversation_and_messaging(self):
        # 1. Start direct conversation
        conv_res = self.client.post(
            "/api/v1/social/conversations/",
            {"target_user_id": self.other.pk},
            format="json",
        )
        self.assertEqual(conv_res.status_code, 200)
        conv_id = conv_res.data["id"]

        # 2. Send message
        msg_res = self.client.post(
            f"/api/v1/social/conversations/{conv_id}/messages/",
            {"body": "Salama namana !"},
            format="json",
        )
        self.assertEqual(msg_res.status_code, 201)
        self.assertEqual(msg_res.data["body"], "Salama namana !")

        # 3. Other user reads messages
        other_client = APIClient()
        other_client.force_authenticate(self.other)
        read_res = other_client.get(f"/api/v1/social/conversations/{conv_id}/messages/")
        self.assertEqual(read_res.status_code, 200)
        self.assertEqual(len(read_res.data["results"]), 1)
        self.assertEqual(read_res.data["results"][0]["body"], "Salama namana !")
