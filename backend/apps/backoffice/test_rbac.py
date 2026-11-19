"""Authorization matrix for least-privilege back-office roles."""

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.backoffice.rbac import ROLE_CAPABILITIES, user_has_capability


class BackofficeRBACTests(TestCase):
    def setUp(self):
        self.player = User.objects.create_user(
            email="rbac-player@example.test",
            phone="+261340001901",
            display_name="Player",
        )
        self.staff = User.objects.create_user(
            email="rbac-staff@example.test",
            phone="+261340001902",
            display_name="Staff",
            is_staff=True,
        )
        self.admin = User.objects.create_superuser(
            email="rbac-admin@example.test",
            phone="+261340001903",
            display_name="Root",
            password="testing-only-long-password",
        )
        self.client = APIClient()

    def test_no_implicit_staff_privilege(self):
        self.client.force_authenticate(self.staff)
        paths = (
            "/api/v1/backoffice/players/",
            "/api/v1/backoffice/reports/overview/",
            "/api/v1/backoffice/finance/overview/",
            "/api/v1/backoffice/audit-events/",
            "/api/v1/backoffice/kyc/",
            "/api/v1/backoffice/sim/summary/",
            "/api/v1/backoffice/games/tables/",
        )
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 403)

    def test_roles_are_scoped_to_individual_workflows(self):
        Group.objects.get_or_create(name="casino:player_support")
        self.staff.groups.add(Group.objects.get(name="casino:player_support"))
        self.client.force_authenticate(self.staff)
        self.assertEqual(
            self.client.get("/api/v1/backoffice/players/").status_code, 200
        )
        self.assertEqual(
            self.client.get("/api/v1/backoffice/audit-events/").status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/v1/backoffice/finance/overview/").status_code, 403
        )
        self.assertEqual(
            self.client.get("/api/v1/backoffice/sim/summary/").status_code, 403
        )
        self.assertEqual(self.client.get("/api/v1/backoffice/kyc/").status_code, 403)

    def test_operations_cannot_approve_sims_or_review_kyc(self):
        self.staff.groups.add(Group.objects.create(name="casino:operations"))
        self.client.force_authenticate(self.staff)
        self.assertEqual(
            self.client.get("/api/v1/backoffice/reports/overview/").status_code, 200
        )
        self.assertEqual(
            self.client.get("/api/v1/backoffice/games/tables/").status_code, 200
        )
        self.assertEqual(self.client.get("/api/v1/backoffice/kyc/").status_code, 403)
        self.assertEqual(
            self.client.post(
                "/api/v1/backoffice/sim/adjustments/", {}, format="json"
            ).status_code,
            403,
        )

    def test_inactive_staff_denied_even_with_group(self):
        self.staff.groups.add(Group.objects.create(name="casino:operations"))
        self.staff.is_active = False
        self.staff.save(update_fields=["is_active"])
        self.client.force_authenticate(self.staff)
        self.assertEqual(
            self.client.get("/api/v1/backoffice/reports/overview/").status_code, 403
        )

    def test_superuser_and_player_matrix(self):
        self.assertFalse(user_has_capability(self.player, "operations.read"))
        self.assertFalse(user_has_capability(self.staff, "totally.unknown"))
        self.assertTrue(user_has_capability(self.admin, "operations.read"))
        self.assertTrue(user_has_capability(self.admin, "finance.read"))
        self.assertEqual(len(ROLE_CAPABILITIES), 9)

    def test_kyc_role_grants_kyc_only(self):
        self.staff.groups.add(Group.objects.create(name="casino:compliance_officer"))
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get("/api/v1/backoffice/kyc/").status_code, 200)
        self.assertEqual(
            self.client.get("/api/v1/backoffice/players/").status_code, 403
        )
