from django.test import TestCase


class MetricsEndpointTests(TestCase):
    def test_metrics_exposes_request_count_and_request_id_headers(self):
        response = self.client.get("/healthz/", HTTP_X_REQUEST_ID="metrics-trace")
        metrics = self.client.get("/metrics/")

        self.assertEqual(response["X-Request-ID"], "metrics-trace")
        self.assertIn("X-Request-Duration-Ms", response)
        self.assertEqual(metrics.status_code, 200)
        self.assertIn("casino_http_requests_total", metrics.content.decode())
        self.assertIn('path=\"/healthz/\"', metrics.content.decode())
