"""Public, secret-free authentication capabilities for the sign-in screen."""

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.backoffice.auth_policy import channel_capabilities


class PublicAuthMethodsView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(channel_capabilities())
