from django.db.models import Avg, Count
from rest_framework import permissions
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PilotFeedback, SupportTicket


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
