from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import KYCRequest

LIMITS = {
    "discovered": {"deposit": 0, "withdrawal": 0},
    "light_player": {"deposit": 100000, "withdrawal": 50000},
    "verified": {"deposit": 1000000, "withdrawal": 500000},
    "vip": {"deposit": 10000000, "withdrawal": 5000000},
}


class KYCStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        latest = KYCRequest.objects.filter(user=request.user).first()
        return Response(
            {
                "level": request.user.kyc_level,
                "limits_mga": LIMITS[request.user.kyc_level],
                "request": (
                    {
                        "id": latest.pk,
                        "level": latest.requested_level,
                        "status": latest.status,
                    }
                    if latest
                    else None
                ),
                "documents_enabled": False,
            }
        )

    def post(self, request):
        level = str(request.data.get("requested_level", ""))
        if level not in dict(KYCRequest.LEVELS):
            return Response({"detail": "Niveau KYC invalide."}, status=400)
        if KYCRequest.objects.filter(user=request.user, status="pending").exists():
            return Response({"detail": "Une demande est déjà en cours."}, status=409)
        item = KYCRequest.objects.create(
            user=request.user,
            requested_level=level,
            note=str(request.data.get("note", ""))[:255],
        )
        return Response(
            {"id": item.pk, "status": item.status, "documents_enabled": False},
            status=201,
        )
