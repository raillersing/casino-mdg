import hashlib
import hmac

from django.conf import settings
from django.core.exceptions import ValidationError
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PaymentIntent, WebhookInboxEvent
from .services import initiate_payment_intent, settle_payment_intent


def serialize_payment_intent(intent: PaymentIntent) -> dict:
    return {
        "id": str(intent.id),
        "provider": intent.provider,
        "provider_display": intent.get_provider_display(),
        "direction": intent.direction,
        "direction_display": intent.get_direction_display(),
        "amount": intent.amount,
        "currency": intent.currency,
        "phone_number": intent.phone_number,
        "provider_reference": intent.provider_reference,
        "checkout_url": intent.checkout_url,
        "error_message": intent.error_message,
        "status": intent.status,
        "status_display": intent.get_status_display(),
        "idempotency_key": intent.idempotency_key,
        "created_at": intent.created_at.isoformat(),
        "updated_at": intent.updated_at.isoformat(),
    }


class PaymentWebhookView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request, provider):
        if provider not in dict(WebhookInboxEvent.PROVIDERS):
            return Response({"detail": "Opérateur inconnu."}, status=status.HTTP_404_NOT_FOUND)

        signature = request.headers.get("X-Webhook-Signature", "")
        expected = hmac.new(
            settings.PAYMENT_WEBHOOK_SECRET.encode(), request.body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return Response({"detail": "Signature HMAC invalide."}, status=status.HTTP_401_UNAUTHORIZED)

        event_id = str(request.data.get("event_id", "")).strip()
        event_type = str(request.data.get("event_type", "")).strip()
        if not event_id or not event_type:
            return Response({"detail": "Événement webhook invalide."}, status=status.HTTP_400_BAD_REQUEST)

        event, created = WebhookInboxEvent.objects.get_or_create(
            provider=provider,
            event_id=event_id,
            defaults={
                "event_type": event_type,
                "payload": request.data,
                "status": "received",
            },
        )
        if not created and (event.event_type != event_type or event.payload != request.data):
            return Response(
                {"detail": "Identifiant webhook déjà utilisé avec un payload différent."},
                status=status.HTTP_409_CONFLICT,
            )

        if created:
            intent_id = request.data.get("intent_id")
            reason = request.data.get("reason", "")
            if intent_id:
                intent = PaymentIntent.objects.filter(id=intent_id, provider=provider).first()
                if intent:
                    if event_type == "payment.succeeded":
                        settle_payment_intent(intent, success=True)
                    elif event_type in ["payment.failed", "payment.cancelled"]:
                        settle_payment_intent(intent, success=False, reason=reason)
                    elif event_type == "payment.processing":
                        intent.status = "processing"
                        intent.save(update_fields=["status"])

            event.status = "processed"
            event.save(update_fields=["status"])

        return Response(
            {
                "event_id": event.event_id,
                "status": event.status,
                "duplicate": not created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class PaymentIntentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        intents = PaymentIntent.objects.filter(user=request.user)[:50]
        return Response({"results": [serialize_payment_intent(item) for item in intents]})

    def post(self, request):
        provider = str(request.data.get("provider", ""))
        direction = str(request.data.get("direction", ""))
        phone_number = str(request.data.get("phone_number", "")).strip()
        key = str(request.data.get("idempotency_key", "")).strip()
        sandbox = bool(request.data.get("sandbox", True))

        try:
            amount = int(request.data.get("amount", 0))
        except (TypeError, ValueError):
            return Response({"detail": "Montant invalide."}, status=status.HTTP_400_BAD_REQUEST)

        if not key or len(key) > 160:
            return Response({"detail": "Clé d'idempotence invalide ou absente."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            intent = initiate_payment_intent(
                user=request.user,
                provider=provider,
                direction=direction,
                amount=amount,
                phone_number=phone_number,
                idempotency_key=key,
                sandbox=sandbox,
            )
        except ValidationError as exc:
            return Response({"detail": exc.message if hasattr(exc, "message") else str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "id": str(intent.id),
                "status": intent.status,
                "provider_reference": intent.provider_reference,
                "checkout_url": intent.checkout_url,
                "message": intent.metadata.get("message", ""),
                "intent": serialize_payment_intent(intent),
                "sandbox": sandbox,
            },
            status=status.HTTP_201_CREATED if intent.status in ["pending", "processing"] else status.HTTP_200_OK,
        )
