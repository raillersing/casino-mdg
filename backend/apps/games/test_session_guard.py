from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User


@override_settings(GAME_ENGINE_RESULT_SECRET="engine-test-key")
class InternalPlayerSessionTests(TestCase):
    def setUp(self):
        self.player = User.objects.create_user(
            email="session@qa.local", phone="+261340000088", display_name="Session"
        )
        self.client = APIClient()
        self.path = f"/api/v1/games/internal/sessions/{self.player.pk}/"

    def test_internal_secret_required_and_no_browser_auth_bypass(self):
        for headers in ({}, {"HTTP_X_GAME_ENGINE_SECRET": "wrong"}):
            response = self.client.get(self.path, **headers)
            self.assertEqual(response.status_code, 403)
            self.assertNotIn("token_version", response.json())
            self.assertEqual(response["Cache-Control"], "no-store")

    def test_session_state_tracks_suspension_and_reactivation(self):
        headers = {"HTTP_X_GAME_ENGINE_SECRET": "engine-test-key"}
        response = self.client.get(self.path, **headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"active": True, "token_version": 0})
        self.assertEqual(response["Cache-Control"], "no-store")

        self.player.is_active = False
        self.player.token_version = 1
        self.player.save(update_fields=["is_active", "token_version"])
        response = self.client.get(self.path, **headers)
        self.assertEqual(response.json(), {"active": False, "token_version": 1})

        self.player.is_active = True
        self.player.token_version = 2
        self.player.save(update_fields=["is_active", "token_version"])
        response = self.client.get(self.path, **headers)
        self.assertEqual(response.json(), {"active": True, "token_version": 2})

    @override_settings(SECURE_SSL_REDIRECT=True)
    def test_authenticated_private_rpc_is_usable_without_proxy_tls_redirect(self):
        response = self.client.get(
            self.path,
            HTTP_X_GAME_ENGINE_SECRET="engine-test-key",
            secure=False,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"active": True, "token_version": 0})

    def test_unknown_player_cannot_authenticate(self):
        response = self.client.get(
            f"/api/v1/games/internal/sessions/{self.player.pk + 10000}/",
            HTTP_X_GAME_ENGINE_SECRET="engine-test-key",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response["Cache-Control"], "no-store")
