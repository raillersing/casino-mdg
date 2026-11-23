"""Regression tests for staging-only environment preparation and guardrails."""
import os
import stat
import tempfile
import unittest
from pathlib import Path

from staging_environment import (
    ROOT,
    SECRET_KEYS,
    configuration_errors,
    create_env,
    parse_text,
    read_env,
)


class StagingEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="casino-staging-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / ".git").mkdir()
        (self.root / "docker-compose.staging.yml").write_text("name: casino-mdg-staging\n")
        (self.root / ".env.staging.example").write_text(
            (ROOT / ".env.staging.example").read_text(encoding="utf-8"),
            encoding="utf-8",
        )

    def test_initialize_generates_private_separate_secrets_and_never_overwrites(self):
        path = create_env(self.root)
        self.assertEqual(path.name, ".env.staging")
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        env = read_env(path)
        self.assertEqual(configuration_errors(env), [])
        self.assertEqual(len({env[key] for key in SECRET_KEYS}), len(SECRET_KEYS))
        self.assertTrue(all(len(env[key]) == 64 for key in SECRET_KEYS))
        self.assertEqual(env["STAGING_ORIGIN"], "http://127.0.0.1:18081")
        original = path.read_bytes()
        with self.assertRaises(FileExistsError):
            create_env(self.root)
        self.assertEqual(path.read_bytes(), original)

    def test_missing_secret_and_prod_flags_block_staging(self):
        env = read_env(create_env(self.root))
        env["STAGING_JWT_SECRET"] = "CHANGE_ME_JWT"
        env["REAL_MONEY_ENABLED"] = "True"
        env["STAGING_PAYMENT_SANDBOX_WEBHOOKS_ENABLED"] = "True"
        issues = configuration_errors(env)
        self.assertTrue(any(x.startswith("STAGING_JWT_SECRET:") for x in issues))
        self.assertTrue(any(x.startswith("REAL_MONEY_ENABLED:") for x in issues))
        self.assertTrue(any(x.startswith("STAGING_PAYMENT_SANDBOX") for x in issues))

    def test_secrets_must_be_unique(self):
        env = read_env(create_env(self.root))
        env["STAGING_ENGINE_RESULT_SECRET"] = env["STAGING_ENGINE_BOT_SECRET"]
        self.assertTrue(any("different" in x for x in configuration_errors(env)))

    def test_external_host_and_loopback_port_are_strictly_scoped(self):
        env = read_env(create_env(self.root))
        env["STAGING_ORIGIN"] = "http://127.0.0.1:80"
        env["STAGING_PORT"] = "80"
        self.assertTrue(any("STAGING_PORT" in x for x in configuration_errors(env)))
        env["STAGING_PORT"] = "18081"
        env["STAGING_ORIGIN"] = "https://casino.example.mg"
        self.assertTrue(any("STAGING_ORIGIN" in x for x in configuration_errors(env)))
        env["STAGING_ORIGIN"] = "https://staging.example.mg"
        env["STAGING_ALLOWED_HOSTS"] = "backend,staging.example.mg"
        self.assertEqual(configuration_errors(env), [])

    def test_email_otp_requires_safe_config(self):
        env = read_env(create_env(self.root))
        env["STAGING_EMAIL_OTP_ENABLED"] = "True"
        self.assertTrue(any("STAGING_EMAIL_HOST:" in x for x in configuration_errors(env)))
        env.update({
            "STAGING_EMAIL_HOST": "smtp.staging.example.mg",
            "STAGING_EMAIL_HOST_PASSWORD": "smtp-private-secret",
            "STAGING_DEFAULT_FROM_EMAIL": "no-reply@staging.example.mg",
        })
        self.assertEqual(configuration_errors(env), [])

    def test_refuse_world_readable_env_file_and_symlink(self):
        path = create_env(self.root)
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            read_env(path)
        path.chmod(0o600)
        path.unlink()
        other = self.root / "not-an-env"
        other.write_text("TEST=1")
        path.symlink_to(other)
        with self.assertRaises(ValueError):
            read_env(path)

    def test_refuse_production_directory_or_production_secrets(self):
        production = self.root / "production"
        production.mkdir()
        (production / ".git").mkdir()
        (production / "docker-compose.staging.yml").write_text("name: test\n")
        (production / ".env.staging.example").write_text(
            (ROOT / ".env.staging.example").read_text(encoding="utf-8")
        )
        with self.assertRaises(ValueError):
            create_env(production)
        (self.root / ".env.production").write_text("DO_NOT_READ=1\n")
        with self.assertRaises(ValueError):
            create_env(self.root)

    def test_parser_rejects_duplicates_and_shell_lines(self):
        with self.assertRaises(ValueError):
            parse_text("STAGING_PORT=18081\nSTAGING_PORT=12345\n")
        with self.assertRaises(ValueError):
            parse_text("$(echo unsafe)")
        self.assertEqual(parse_text('STAGING_DB_NAME="casino_mdg_staging"'), {
            "STAGING_DB_NAME": "casino_mdg_staging"
        })


if __name__ == "__main__":
    unittest.main()
