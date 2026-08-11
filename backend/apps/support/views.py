from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SupportTicket


class SupportTicketView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        tickets = SupportTicket.objects.filter(user=request.user)[:50]
        return Response({"results": [{"id": item.pk, "category": item.category, "subject": item.subject, "description": item.description, "status": item.status, "created_at": item.created_at.isoformat()} for item in tickets]})

    def post(self, request):
        category = str(request.data.get("category", "other")); subject = str(request.data.get("subject", "")).strip(); description = str(request.data.get("description", "")).strip()
        if category not in dict(SupportTicket.CATEGORIES) or not subject or len(subject) > 120 or not description or len(description) > 2000:
            return Response({"detail": "Ticket invalide."}, status=400)
        ticket = SupportTicket.objects.create(user=request.user, category=category, subject=subject, description=description)
        return Response({"id": ticket.pk, "status": ticket.status}, status=201)
