from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.backoffice.models import AuditEvent, FeatureFlag
from apps.games.models import GameTable, TableSeat
from apps.payments.models import PaymentIntent, WebhookInboxEvent
from apps.social.models import ChatMessage


class AuditTests(TestCase):
    def test_audit_endpoint_is_staff_only(self):
        user = User.objects.create_user(
            email="player@mdg.local", phone="+261340000015", display_name="Player"
        )
        client = APIClient()
        client.force_authenticate(user)
        self.assertEqual(
            client.get("/api/v1/backoffice/audit-events/").status_code, 403
        )
        staff = User.objects.create_user(
            email="staff@mdg.local",
            phone="+261340000016",
            display_name="Staff",
            is_staff=True,
        )
        AuditEvent.objects.create(
            actor=user, action="test.action", target_type="User", target_id=str(user.pk)
        )
        client.force_authenticate(staff)
        response = client.get("/api/v1/backoffice/audit-events/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_staff_can_toggle_feature_flag(self):
        staff = User.objects.create_user(
            email="flagstaff@mdg.local",
            phone="+261340000017",
            display_name="Flag staff",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(staff)
        response = client.post(
            "/api/v1/backoffice/feature-flags/",
            {"key": "game_results", "enabled": False, "reason": "Maintenance"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(FeatureFlag.objects.get(key="game_results").enabled)
        self.assertTrue(
            AuditEvent.objects.filter(
                action="feature_flag.updated",
                target_id=str(FeatureFlag.objects.get(key="game_results").pk),
            ).exists()
        )

    def test_staff_can_hide_chat_message_and_action_is_audited(self):
        player = User.objects.create_user(
            email="chatplayer@mdg.local",
            phone="+261340000020",
            display_name="Chat player",
        )
        table = GameTable.objects.create(
            table_code="audit-chat",
            name="Audit chat",
            game_type="poker",
            created_by=player,
        )
        TableSeat.objects.create(table=table, user=player, seat_index=0)
        message = ChatMessage.objects.create(
            table=table, author=player, body="Message à modérer"
        )
        staff = User.objects.create_user(
            email="modstaff@mdg.local",
            phone="+261340000021",
            display_name="Moderator",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(staff)
        response = client.post(
            "/api/v1/backoffice/chat-messages/",
            {"message_id": message.pk, "reason": "signalement"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(ChatMessage.objects.get(pk=message.pk).is_hidden)
        self.assertTrue(
            AuditEvent.objects.filter(action="chat.message.hidden").exists()
        )
        restored = client.post(
            "/api/v1/backoffice/chat-messages/",
            {"message_id": message.pk, "hidden": False, "reason": "faux positif"},
            format="json",
        )
        self.assertEqual(restored.status_code, 200)
        self.assertFalse(ChatMessage.objects.get(pk=message.pk).is_hidden)
        self.assertTrue(
            AuditEvent.objects.filter(action="chat.message.restored").exists()
        )

    def test_staff_can_run_sandbox_payment_reconciliation(self):
        staff = User.objects.create_user(
            email="recon@mdg.local",
            phone="+261340000024",
            display_name="Recon",
            is_staff=True,
        )
        WebhookInboxEvent.objects.create(
            provider="mvola",
            event_id="unmatched",
            event_type="payment.succeeded",
            payload={"intent_id": "missing"},
            status="processed",
        )
        PaymentIntent.objects.create(
            user=staff,
            provider="mvola",
            direction="deposit",
            amount=100,
            idempotency_key="recon-intent",
        )
        client = APIClient()
        client.force_authenticate(staff)
        response = client.get("/api/v1/backoffice/payment-reconciliation/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["intents_pending"], 1)
        self.assertEqual(len(response.data["unmatched_webhooks"]), 1)
