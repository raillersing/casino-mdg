from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .models import AuditEvent


class AuditEventListView(ListAPIView):
    permission_classes = [IsAdminUser]
    queryset = AuditEvent.objects.select_related("actor").all()

    def list(self, request, *args, **kwargs):
        events = self.get_queryset()[:100]
        return Response(
            {
                "results": [
                    {
                        "id": str(item.id),
                        "actor": item.actor.display_name if item.actor else None,
                        "action": item.action,
                        "target_type": item.target_type,
                        "target_id": item.target_id,
                        "metadata": item.metadata,
                        "created_at": item.created_at.isoformat(),
                    }
                    for item in events
                ]
            }
        )
