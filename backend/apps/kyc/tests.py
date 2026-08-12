from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.kyc.models import KYCRequest


class KYCTests(TestCase):
    def test_status_exposes_simulation_limits_and_single_pending_request(self):
        user = User.objects.create_user(
            email="kyc@mdg.local", phone="+261340000025", display_name="KYC"
        )
        client = APIClient()
        client.force_authenticate(user)
        status_response = client.get("/api/v1/kyc/status/")
        self.assertEqual(status_response.data["limits_mga"]["deposit"], 0)
        self.assertFalse(status_response.data["documents_enabled"])
        first = client.post(
            "/api/v1/kyc/status/", {"requested_level": "light_player"}, format="json"
        )
        second = client.post(
            "/api/v1/kyc/status/", {"requested_level": "verified"}, format="json"
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(KYCRequest.objects.count(), 1)
