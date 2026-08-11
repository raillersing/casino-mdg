from unittest.mock import patch

from django.test import TestCase


class HealthEndpointTests(TestCase):
    def test_readyz_reports_database_health(self):
        response = self.client.get("/readyz/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "database": "ok"})

    @patch("config.urls.connection.cursor", side_effect=Exception("database down"))
    def test_readyz_returns_503_when_database_is_unavailable(self, _cursor):
        response = self.client.get("/readyz/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unready", "database": "unavailable"})
