"""Regression tests for destructive table cleanup safeguards."""

from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.accounts.models import User

from .models import GameTable, TableSeat


class CleanupSafetyTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email="cleanup@qa.local",
            phone="+261340008888",
            display_name="Cleanup QA",
        )

    def create_room(self, code):
        return GameTable.objects.create(
            table_code=code,
            name="Cleanup test",
            game_type="ludo",
            max_players=2,
            created_by=self.owner,
        )

    def test_force_closing_does_not_implicitly_delete_a_table(self):
        room = self.create_room("cleanup-retain")
        call_command("cleanup_expired_tables", force_all=True, stdout=StringIO())
        room.refresh_from_db()
        self.assertEqual(room.status, "finished")

    def test_explicit_deletion_only_removes_closed_empty_rooms(self):
        empty = self.create_room("cleanup-empty")
        occupied = self.create_room("cleanup-occupied")
        TableSeat.objects.create(table=occupied, user=self.owner, seat_index=0)
        call_command("cleanup_expired_tables", force_all=True, stdout=StringIO())
        call_command("cleanup_expired_tables", delete_closed=True, stdout=StringIO())
        self.assertFalse(GameTable.objects.filter(pk=empty.pk).exists())
        self.assertTrue(GameTable.objects.filter(pk=occupied.pk).exists())
