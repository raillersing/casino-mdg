from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.backoffice.models import AuditEvent
from apps.support.models import PilotAction, PilotFeedback, SupportTicket


class SupportTests(TestCase):
    def test_staff_can_read_contextual_incident_tickets_but_player_cannot(self):
        player = User.objects.create_user(
            email="incident-player@mdg.local",
            phone="+261340000029",
            display_name="Incident Player",
        )
        SupportTicket.objects.create(
            user=player,
            category="game",
            subject="Déconnexion pendant la partie",
            description="La table ne répondait plus.",
            game_type="poker",
            table_id="table-emerald",
            session_id="incident-session",
            app_version="web-2026.08",
        )
        client = APIClient()
        client.force_authenticate(player)
        self.assertEqual(client.get("/api/v1/support/tickets/staff/").status_code, 403)
        staff = User.objects.create_user(
            email="incident-staff@mdg.local",
            phone="+261340000030",
            display_name="Incident Staff",
            is_staff=True,
        )
        client.force_authenticate(staff)
        response = client.get("/api/v1/support/tickets/staff/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["player"], "Incident Player")
        self.assertEqual(response.data["results"][0]["table_id"], "table-emerald")

    def test_staff_can_update_incident_status_and_change_is_audited(self):
        player = User.objects.create_user(
            email="status-player@mdg.local",
            phone="+261340000031",
            display_name="Status Player",
        )
        ticket = SupportTicket.objects.create(
            user=player,
            category="game",
            subject="Test statut",
            description="Test transition.",
        )
        staff = User.objects.create_user(
            email="status-staff@mdg.local",
            phone="+261340000032",
            display_name="Status Staff",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(staff)
        response = client.patch(
            f"/api/v1/support/tickets/staff/{ticket.pk}/",
            {"status": "in_progress"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "in_progress")
        self.assertTrue(
            AuditEvent.objects.filter(
                action="support_ticket.status_updated",
                target_id=str(ticket.pk),
                metadata={"from": "open", "to": "in_progress"},
            ).exists()
        )
        invalid = client.patch(
            f"/api/v1/support/tickets/staff/{ticket.pk}/",
            {"status": "deleted"},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

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
                "game_type": "poker",
                "table_id": "table-emerald",
                "session_id": "support-session",
                "app_version": "web-test",
            },
            format="json",
        )
        listed = client.get("/api/v1/support/tickets/")
        self.assertEqual(created.status_code, 201)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data["results"]), 1)
        self.assertEqual(SupportTicket.objects.count(), 1)
        ticket = SupportTicket.objects.get()
        self.assertEqual(ticket.game_type, "poker")
        self.assertEqual(ticket.table_id, "table-emerald")
        self.assertEqual(ticket.session_id, "support-session")
        self.assertEqual(ticket.app_version, "web-test")

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

    def test_staff_can_track_pilot_action_and_audit_status(self):
        player = User.objects.create_user(
            email="action-player@mdg.local",
            phone="+261340000033",
            display_name="Action Player",
        )
        ticket = SupportTicket.objects.create(
            user=player,
            category="game",
            subject="Action liée",
            description="Incident à traiter",
        )
        staff = User.objects.create_user(
            email="action-staff@mdg.local",
            phone="+261340000034",
            display_name="Action Staff",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(staff)
        created = client.post(
            "/api/v1/support/pilot-actions/",
            {
                "title": "Corriger la reconnexion",
                "source": "incident",
                "incident_id": ticket.pk,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        action = PilotAction.objects.get(pk=created.data["id"])
        updated = client.patch(
            f"/api/v1/support/pilot-actions/{action.pk}/",
            {"status": "done"},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["status"], "done")
        self.assertTrue(
            AuditEvent.objects.filter(
                action="pilot_action.status_updated",
                target_id=str(action.pk),
                metadata={"from": "todo", "to": "done"},
            ).exists()
        )
