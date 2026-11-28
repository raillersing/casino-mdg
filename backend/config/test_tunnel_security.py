"""Ensure HTTP exemptions do not bypass engine credentials or public HTTPS."""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(
    SECURE_SSL_REDIRECT=True,
    GAME_ENGINE_RESULT_SECRET="result-test-secret",
    GAME_ENGINE_BOT_SECRET="bot-test-secret",
)
class TunnelSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_private_http_rpc_requires_credentials(self):
        for method, path in (
            ("get", "sessions/1/"),
            ("get", "tables/12345678-1234-1234-1234-123456789abc/finance/"),
            ("post", "human-activity/"),
            ("post", "bots/session-complete/"),
            ("post", "settle-round/"),
        ):
            with self.subTest(path=path):
                response = getattr(self.client, method)(
                    f"/api/v1/games/internal/{path}"
                )
                self.assertEqual(response.status_code, 403)

    def test_public_and_unknown_private_paths_still_require_https(self):
        for path in (
            "/api/v1/auth/methods/",
            "/api/v1/games/internal/unknown/",
            "/api/v1/games/internal/tables/invalid/finance/",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 301)

    def test_https_from_trusted_proxy_does_not_redirect(self):
        response = self.client.get(
            "/api/v1/auth/methods/", HTTP_X_FORWARDED_PROTO="https"
        )
        self.assertEqual(response.status_code, 200)
