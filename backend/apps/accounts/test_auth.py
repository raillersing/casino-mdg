from django.test import TestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import OTPChallenge, User, UserDevice


@override_settings(DEBUG=True)
class OTPFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()

    def test_request_and_verify_otp_creates_persistent_user(self):
        response = self.client.post("/api/v1/auth/otp/request/", {"phone": "034 00 000 00"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(OTPChallenge.objects.count(), 1)
        verify = self.client.post("/api/v1/auth/otp/verify/", {"phone": "0340000000", "code": response.data["dev_code"], "display_name": "Miora"}, format="json")
        self.assertEqual(verify.status_code, 200)
        self.assertTrue(verify.data["access"])
        self.assertEqual(User.objects.get().display_name, "Miora")
        self.assertEqual(verify.data["wallet"]["balance"], 10_000)

    def test_invalid_phone_is_rejected(self):
        response = self.client.post("/api/v1/auth/otp/request/", {"phone": "020000"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_otp_requests_are_limited_per_ip(self):
        responses = [self.client.post("/api/v1/auth/otp/request/", {"phone": f"03400000{i:02d}"}, REMOTE_ADDR="10.0.0.8") for i in range(6)]
        self.assertEqual([response.status_code for response in responses].count(429), 1)

    def test_shared_device_fingerprint_requires_review(self):
        first = User.objects.create_user(email="device1@mdg.local", phone="+261340000018", display_name="One")
        second = User.objects.create_user(email="device2@mdg.local", phone="+261340000019", display_name="Two")
        self.client.force_authenticate(first)
        self.assertEqual(self.client.post("/api/v1/auth/devices/", {"device_id": "device-a", "fingerprint": "fp-1"}, format="json").status_code, 201)
        self.client.force_authenticate(second)
        response = self.client.post("/api/v1/auth/devices/", {"device_id": "device-b", "fingerprint": "fp-1"}, format="json")
        self.assertEqual(response.status_code, 409); self.assertTrue(response.data["review_required"]); self.assertEqual(UserDevice.objects.filter(fingerprint="fp-1").count(), 2)
