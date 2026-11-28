"""Regression tests for production configuration guardrails."""
import unittest

from production_preflight import check_configuration


class ProductionPreflightTests(unittest.TestCase):
    def setUp(self):
        self.safe = {
            "ENV": "production",
            "DEBUG": "False",
            "DJANGO_SECRET_KEY": "a" * 48,
            "JWT_SECRET": "z" * 48,
            "DB_PASSWORD": "b" * 48,
            "GAME_ENGINE_BOT_SECRET": "c" * 48,
            "GAME_ENGINE_RESULT_SECRET": "d" * 48,
            "PAYMENT_WEBHOOK_SECRET": "e" * 48,
            "ALLOWED_HOSTS": "casino.example.mg,api.example.mg",
            "CORS_ALLOWED_ORIGINS": "https://casino.example.mg",
            "SECURE_SSL_REDIRECT": "True",
            "EMAIL_OTP_ENABLED": "False",
            "PAYMENT_SANDBOX_WEBHOOKS_ENABLED": "False",
        }

    def test_known_good_static_example(self):
        self.assertEqual(check_configuration(self.safe), [])

    def test_explicit_internal_hosts_with_public_hostname(self):
        env = dict(self.safe, ALLOWED_HOSTS="kajitik.com,www.kajitik.com,127.0.0.1,backend")
        self.assertEqual(check_configuration(env), [])

    def test_private_only_and_invalid_hosts_are_rejected(self):
        for hosts in ("backend,127.0.0.1", "kajitik.com,*", ".kajitik.com", "kajitik.com,unknown"):
            with self.subTest(hosts=hosts):
                self.assertTrue(any("ALLOWED_HOSTS" in item for item in check_configuration(dict(self.safe, ALLOWED_HOSTS=hosts))))

    def test_minimum_secret_length_matches_runtime_guard(self):
        self.assertTrue(any("JWT_SECRET" in item for item in check_configuration(dict(self.safe, JWT_SECRET="x" * 24))))

    def test_wildcard_hosts_and_cors_are_blocked(self):
        env = dict(self.safe, ALLOWED_HOSTS="*", CORS_ALLOWED_ORIGINS="*")
        result = check_configuration(env)
        self.assertTrue(any("ALLOWED_HOSTS" in item for item in result))
        self.assertTrue(any("CORS_ALLOWED_ORIGINS" in item for item in result))

    def test_default_secrets_and_http_are_blocked(self):
        env = dict(self.safe, DJANGO_SECRET_KEY="dev-key-change-in-prod",
                   CORS_ALLOWED_ORIGINS="http://casino.example.mg")
        self.assertTrue(any("DJANGO_SECRET_KEY" in item for item in check_configuration(env)))
        self.assertTrue(any("CORS_ALLOWED_ORIGINS" in item for item in check_configuration(env)))

    def test_https_and_live_money_violations_are_blocked(self):
        env = dict(self.safe, SECURE_SSL_REDIRECT="False", REAL_MONEY_ENABLED="True")
        problems = check_configuration(env)
        self.assertTrue(any("SECURE_SSL_REDIRECT" in item for item in problems))
        self.assertTrue(any("REAL_MONEY_ENABLED" in item for item in problems))

    def test_smtp_requires_credentials(self):
        env = dict(self.safe, EMAIL_OTP_ENABLED="True")
        self.assertTrue(any("EMAIL_OTP_ENABLED" in item for item in check_configuration(env)))


if __name__ == "__main__":
    unittest.main()
