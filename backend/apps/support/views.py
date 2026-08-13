from django.db.models import Avg, Count
from rest_framework import permissions
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.backoffice.services import record_audit

from .models import PilotAction, PilotFeedback, SupportTicket


class SupportTicketView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        tickets = SupportTicket.objects.filter(user=request.user)[:50]
        return Response(
            {
                "results": [
                    {
                        "id": item.pk,
                        "category": item.category,
                        "subject": item.subject,
                        "description": item.description,
                        "game_type": item.game_type,
                        "table_id": item.table_id,
                        "session_id": item.session_id,
                        "app_version": item.app_version,
                        "status": item.status,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in tickets
                ]
            }
        )

    def post(self, request):
        category = str(request.data.get("category", "other"))
        subject = str(request.data.get("subject", "")).strip()
        description = str(request.data.get("description", "")).strip()
        if (
            category not in dict(SupportTicket.CATEGORIES)
            or not subject
            or len(subject) > 120
            or not description
            or len(description) > 2000
        ):
            return Response({"detail": "Ticket invalide."}, status=400)
        game_type = str(request.data.get("game_type", ""))[:40]
        table_id = str(request.data.get("table_id", ""))[:120]
        session_id = str(request.data.get("session_id", ""))[:128]
        app_version = str(request.data.get("app_version", ""))[:40]
        ticket = SupportTicket.objects.create(
            user=request.user,
            category=category,
            subject=subject,
            description=description,
            game_type=game_type,
            table_id=table_id,
            session_id=session_id,
            app_version=app_version,
        )
        return Response({"id": ticket.pk, "status": ticket.status}, status=201)


class SupportTicketStaffView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        tickets = SupportTicket.objects.select_related("user")[:100]
        return Response(
            {
                "results": [
                    {
                        "id": item.pk,
                        "player": item.user.display_name,
                        "category": item.category,
                        "subject": item.subject,
                        "description": item.description,
                        "game_type": item.game_type,
                        "table_id": item.table_id,
                        "session_id": item.session_id,
                        "app_version": item.app_version,
                        "status": item.status,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in tickets
                ]
            }
        )

    def patch(self, request, ticket_id=None):
        try:
            ticket = SupportTicket.objects.get(pk=ticket_id)
        except (SupportTicket.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "Incident introuvable."}, status=404)
        status = str(request.data.get("status", "")).strip()
        allowed = dict(SupportTicket.STATUSES)
        if status not in allowed:
            return Response({"detail": "Statut d’incident invalide."}, status=400)
        previous_status = ticket.status
        ticket.status = status
        ticket.save(update_fields=["status", "updated_at"])
        record_audit(
            request.user,
            "support_ticket.status_updated",
            ticket,
            {"from": previous_status, "to": status},
        )
        return Response({"id": ticket.pk, "status": ticket.status})


class PilotFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            rating = int(request.data.get("rating", 0))
        except (TypeError, ValueError):
            rating = 0
        category = str(request.data.get("category", "other"))
        message = str(request.data.get("message", "")).strip()
        if not 1 <= rating <= 5 or category not in dict(PilotFeedback.CATEGORIES):
            return Response({"detail": "Feedback invalide."}, status=400)
        if not message or len(message) > 1000:
            return Response({"detail": "Message de feedback invalide."}, status=400)
        feedback = PilotFeedback.objects.create(
            user=request.user,
            rating=rating,
            category=category,
            message=message,
            game_type=str(request.data.get("game_type", ""))[:40],
            table_id=str(request.data.get("table_id", ""))[:120],
            session_id=str(request.data.get("session_id", ""))[:128],
        )
        return Response({"id": feedback.pk, "created": True}, status=201)

    def get(self, request):
        if not request.user.is_staff:
            return Response({"detail": "Accès staff requis."}, status=403)
        feedback = PilotFeedback.objects.select_related("user")[:100]
        return Response(
            {
                "results": [
                    {
                        "id": item.pk,
                        "rating": item.rating,
                        "category": item.category,
                        "message": item.message,
                        "game_type": item.game_type,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in feedback
                ]
            }
        )


class PilotFeedbackSummaryView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        report = PilotFeedback.objects.aggregate(
            count=Count("id"), average_rating=Avg("rating")
        )
        categories = {
            item["category"]: item["count"]
            for item in PilotFeedback.objects.values("category").annotate(
                count=Count("id")
            )
        }
        return Response(
            {
                "count": report["count"],
                "average_rating": report["average_rating"],
                "categories": categories,
            }
        )


class PilotActionView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        actions = PilotAction.objects.select_related("incident", "created_by")[:100]
        return Response(
            {
                "results": [
                    {
                        "id": item.pk,
                        "title": item.title,
                        "description": item.description,
                        "source": item.source,
                        "status": item.status,
                        "incident_id": item.incident_id,
                        "created_by": item.created_by.display_name,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in actions
                ]
            }
        )

    def post(self, request):
        title = str(request.data.get("title", "")).strip()
        source = str(request.data.get("source", "incident")).strip()
        description = str(request.data.get("description", "")).strip()
        if not title or len(title) > 160 or source not in dict(PilotAction.SOURCES):
            return Response({"detail": "Action pilote invalide."}, status=400)
        incident = None
        incident_id = request.data.get("incident_id")
        if incident_id not in (None, ""):
            try:
                incident = SupportTicket.objects.get(pk=incident_id)
            except (SupportTicket.DoesNotExist, TypeError, ValueError):
                return Response({"detail": "Incident introuvable."}, status=404)
        action = PilotAction.objects.create(
            title=title,
            description=description[:1000],
            source=source,
            incident=incident,
            created_by=request.user,
        )
        record_audit(
            request.user,
            "pilot_action.created",
            action,
            {"source": source, "incident_id": incident.pk if incident else None},
        )
        return Response({"id": action.pk, "status": action.status}, status=201)

    def patch(self, request, action_id=None):
        try:
            action = PilotAction.objects.get(pk=action_id)
        except (PilotAction.DoesNotExist, TypeError, ValueError):
            return Response({"detail": "Action introuvable."}, status=404)
        status = str(request.data.get("status", "")).strip()
        if status not in dict(PilotAction.STATUSES):
            return Response({"detail": "Statut d’action invalide."}, status=400)
        previous = action.status
        action.status = status
        action.save(update_fields=["status", "updated_at"])
        record_audit(
            request.user,
            "pilot_action.status_updated",
            action,
            {"from": previous, "to": status},
        )
        return Response({"id": action.pk, "status": action.status})
