from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FeatureFlag


class FeatureFlagView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({"results": [{"key": item.key, "enabled": item.enabled, "reason": item.reason, "updated_at": item.updated_at.isoformat()} for item in FeatureFlag.objects.all()]})

    def post(self, request):
        key = str(request.data.get("key", "")).strip()
        if not key or len(key) > 80: return Response({"detail": "Clé de feature flag invalide."}, status=400)
        flag, _ = FeatureFlag.objects.update_or_create(key=key, defaults={"enabled": bool(request.data.get("enabled", True)), "reason": str(request.data.get("reason", ""))[:255], "updated_by": request.user})
        return Response({"key": flag.key, "enabled": flag.enabled, "reason": flag.reason}, status=200)
