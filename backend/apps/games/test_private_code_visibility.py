"""Regression coverage: private-table invitation secrets must not leak via API payloads."""

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.clubs.models import Club, ClubMembership
from apps.games.models import GameTable, TableSeat


class PrivateTableCodeVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.creator = User.objects.create_user(
            email="creator-private@mdg.local",
            phone="+261340009001",
            display_name="Creator",
        )
        self.member = User.objects.create_user(
            email="club-member-private@mdg.local",
            phone="+261340009002",
            display_name="Club member",
        )
        self.outsider = User.objects.create_user(
            email="club-outsider-private@mdg.local",
            phone="+261340009003",
            display_name="Outsider",
        )
        self.club = Club.objects.create(name="Club prive", owner=self.creator)
        ClubMembership.objects.create(club=self.club, user=self.creator, role="owner")
        ClubMembership.objects.create(club=self.club, user=self.member, role="member")
        self.table = GameTable.objects.create(
            table_code="private-club-code-001",
            name="Table du club",
            game_type="domino",
            max_players=4,
            mode="HUMAN_MATCH",
            is_private=True,
            access_code="AB1234",
            club=self.club,
            created_by=self.creator,
        )

    def _visible_table(self, user):
        self.client.force_authenticate(user=user)
        response = self.client.get("/api/v1/games/tables/")
        self.assertEqual(response.status_code, 200)
        matches = []
        for item in response.data["results"]:
            if item["id"] == str(self.table.id):
                matches.append(item)
        self.assertEqual(len(matches), 1)
        return matches[0]

    def test_club_member_can_discover_table_but_not_invitation_secret(self):
        visible = self._visible_table(self.member)
        self.assertTrue(visible["is_private"])
        self.assertIsNone(visible["access_code"])

    def test_creator_can_share_own_table_invitation_code(self):
        visible = self._visible_table(self.creator)
        self.assertEqual(visible["access_code"], "AB1234")

    def test_seated_club_member_can_share_code_after_admission(self):
        TableSeat.objects.create(table=self.table, user=self.member, seat_index=1)
        visible = self._visible_table(self.member)
        self.assertEqual(visible["access_code"], "AB1234")

    def test_unseated_club_member_cannot_read_code_from_admission_response(self):
        self.client.force_authenticate(user=self.member)
        response = self.client.post(f"/api/v1/games/tables/{self.table.id}/admission/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "spectator")
        self.assertIsNone(response.data["table"]["access_code"])

    def test_outsider_and_anonymous_cannot_discover_private_club_table(self):
        for user in (self.outsider, None):
            self.client.force_authenticate(user=user)
            response = self.client.get("/api/v1/games/tables/")
            self.assertEqual(response.status_code, 200)
            visible_ids = {item["id"] for item in response.data["results"]}
            self.assertNotIn(str(self.table.id), visible_ids)

    def test_non_club_private_table_keeps_code_for_creator_only(self):
        private = GameTable.objects.create(
            table_code="private-friends-code-001",
            name="Amis",
            game_type="belote",
            max_players=4,
            mode="HUMAN_MATCH",
            is_private=True,
            access_code="CD4567",
            created_by=self.creator,
        )
        self.client.force_authenticate(user=self.creator)
        response = self.client.get("/api/v1/games/tables/")
        visible = {entry["id"]: entry for entry in response.data["results"]}
        self.assertEqual(visible[str(private.id)]["access_code"], "CD4567")
        self.client.force_authenticate(user=self.outsider)
        response = self.client.post(
            f"/api/v1/games/tables/{private.id}/join/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
