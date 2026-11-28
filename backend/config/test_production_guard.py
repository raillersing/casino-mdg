"""Production startup rejects dangerous environments even without preflight."""

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.production_guard import enforce_production_settings


class RuntimeProductionGuardTests(SimpleTestCase):
    def setUp(self):
        self.safe = {
            "ENV": "production",
            "DEBUG": "False",
            "SECURE_SSL_REDIRECT": "True",
            "DJANGO_SECRET_KEY": "a" * 48,
            "JWT_SECRET": "b" * 48,
            "GAME_ENGINE_BOT_SECRET": "c" * 48,
            "GAME_ENGINE_RESULT_SECRET": "d" * 48,
            "PAYMENT_WEBHOOK_SECRET": "e" * 48,
            "DB_PASSWORD": "f" * 48,
            "ALLOWED_HOSTS": "casino.example.mg",
            "CORS_ALLOWED_ORIGINS": "https://casino.example.mg",
        }

    def test_secure_explicit_production_configuration(self):
        self.assertIsNone(enforce_production_settings(self.safe))

    def test_explicit_internal_hosts_are_allowed_with_public_hostname(self):
        env = dict(
            self.safe, ALLOWED_HOSTS="kajitik.com,www.kajitik.com,127.0.0.1,backend"
        )
        self.assertIsNone(enforce_production_settings(env))

    def test_private_only_and_wildcard_hosts_are_rejected(self):
        for hosts in (
            "backend,127.0.0.1",
            "kajitik.com,*",
            ".kajitik.com",
            "kajitik.com,unknown",
        ):
            with self.subTest(hosts=hosts):
                with self.assertRaises(ImproperlyConfigured):
                    enforce_production_settings(dict(self.safe, ALLOWED_HOSTS=hosts))

    def test_fail_closed_in_production(self):
        invalid_cases = (
            {"DEBUG": "True"},
            {"SECURE_SSL_REDIRECT": "False"},
            {"JWT_SECRET": "dev-jwt-secret-change-me"},
            {"ALLOWED_HOSTS": "*"},
            {"CORS_ALLOWED_ORIGINS": "*"},
            {"PAYMENT_WEBHOOK_SECRET": ""},
            {"PAYMENT_SANDBOX_WEBHOOKS_ENABLED": "True"},
            {"REAL_MONEY_ENABLED": "True"},
        )
        for changes in invalid_cases:
            with self.subTest(changes=changes):
                with self.assertRaises(ImproperlyConfigured):
                    enforce_production_settings({**self.safe, **changes})

    def test_unmarked_development_environment_remains_compatible(self):
        self.assertIsNone(enforce_production_settings({"ENV": "development"}))
