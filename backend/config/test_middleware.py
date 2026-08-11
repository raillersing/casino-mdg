from django.test import TestCase


class RequestIDTests(TestCase):
    def test_request_id_is_generated_and_propagated(self):
        response = self.client.get("/healthz/")
        self.assertTrue(response["X-Request-ID"])

    def test_existing_request_id_is_preserved(self):
        response = self.client.get("/healthz/", HTTP_X_REQUEST_ID="trace-123")
        self.assertEqual(response["X-Request-ID"], "trace-123")
