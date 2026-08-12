from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import OTPChallenge, User


@override_settings(DEBUG=True)
class OTPFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_request_and_verify_otp_creates_persistent_user(self):
        response = self.client.post(
            "/api/v1/auth/otp/request/", {"phone": "034 00 000 00"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(OTPChallenge.objects.count(), 1)

        verify = self.client.post(
            "/api/v1/auth/otp/verify/",
            {
                "phone": "0340000000",
                "code": response.data["dev_code"],
                "display_name": "Miora",
            },
            format="json",
        )
        self.assertEqual(verify.status_code, 200)
        self.assertTrue(verify.data["access"])
        self.assertEqual(User.objects.get().display_name, "Miora")

    def test_invalid_phone_is_rejected(self):
        response = self.client.post(
            "/api/v1/auth/otp/request/", {"phone": "020000"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
