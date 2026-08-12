from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.clubs.models import Club, ClubMembership


class ClubApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="club-owner@mdg.local", phone="+261340008001", display_name="Owner"
        )
        self.member = User.objects.create_user(
            email="club-member@mdg.local", phone="+261340008002", display_name="Member"
        )
        self.stranger = User.objects.create_user(
            email="club-stranger@mdg.local",
            phone="+261340008003",
            display_name="Stranger",
        )
        self.client = APIClient()

    def test_owner_creates_open_club_and_member_joins_idempotently(self):
        self.client.force_authenticate(self.owner)
        created = self.client.post(
            "/api/v1/clubs/",
            {"name": "Belote Tana", "city": "Antananarivo"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        club_id = created.data["id"]
        self.client.force_authenticate(self.member)
        joined = self.client.post(f"/api/v1/clubs/{club_id}/join/")
        replay = self.client.post(f"/api/v1/clubs/{club_id}/join/")
        self.assertEqual(joined.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(ClubMembership.objects.filter(club_id=club_id).count(), 2)

    def test_invite_only_club_is_hidden_and_acceptance_adds_member(self):
        self.client.force_authenticate(self.owner)
        created = self.client.post(
            "/api/v1/clubs/",
            {"name": "Cercle privé", "visibility": "invite"},
            format="json",
        )
        club_id = created.data["id"]
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get("/api/v1/clubs/").data["results"], [])
        self.assertEqual(
            self.client.post(f"/api/v1/clubs/{club_id}/join/").status_code, 403
        )
        self.client.force_authenticate(self.owner)
        invitation = self.client.post(f"/api/v1/clubs/{club_id}/invitations/")
        self.client.force_authenticate(self.stranger)
        accepted = self.client.post(
            f"/api/v1/clubs/invitations/{invitation.data['token']}/accept/"
        )
        self.assertEqual(accepted.status_code, 201)
        self.assertTrue(accepted.data["joined"])
        self.assertEqual(Club.objects.get(pk=club_id).memberships.count(), 2)

    def test_owner_can_manage_members_but_member_cannot(self):
        self.client.force_authenticate(self.owner)
        created = self.client.post("/api/v1/clubs/", {"name": "Gestion"}, format="json")
        club_id = created.data["id"]
        self.client.force_authenticate(self.member)
        joined = self.client.post(f"/api/v1/clubs/{club_id}/join/")
        self.assertTrue(joined.data["joined"])
        self.client.force_authenticate(self.owner)
        members = self.client.get(f"/api/v1/clubs/{club_id}/members/")
        target_id = next(
            item["user_id"]
            for item in members.data["results"]
            if item["role"] == "member"
        )
        promoted = self.client.patch(
            f"/api/v1/clubs/{club_id}/members/",
            {"user_id": target_id, "role": "admin"},
            format="json",
        )
        self.assertEqual(promoted.status_code, 200)
        self.assertEqual(promoted.data["role"], "admin")
        removed = self.client.delete(
            f"/api/v1/clubs/{club_id}/members/",
            {"user_id": target_id},
            format="json",
        )
        self.assertEqual(removed.status_code, 204)
        self.assertEqual(ClubMembership.objects.filter(user_id=target_id).count(), 0)
        self.client.force_authenticate(self.member)
        self.assertEqual(
            self.client.get(f"/api/v1/clubs/{club_id}/members/").status_code, 403
        )
