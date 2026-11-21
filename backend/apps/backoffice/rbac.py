"""Server-side RBAC for back-office endpoints.

The permissions below are intentionally independent of frontend navigation and
Django's broad is_staff flag. Group membership is granted only by a trusted
administrator; endpoints deny access unless a capability is explicitly mapped.
"""

from rest_framework.permissions import BasePermission

ROLE_CAPABILITIES = {
    "casino:operations": frozenset({"operations.read", "reports.read", "games.read"}),
    "casino:player_support": frozenset({"players.list"}),
    "casino:chat_moderator": frozenset({"chat.read", "chat.moderate"}),
    "casino:finance_auditor": frozenset(
        {"finance.read", "finance.reconcile", "reports.export"}
    ),
    "casino:sim_cashier": frozenset(
        {"sim.summary", "sim.adjustments.read", "sim.adjustments.request"}
    ),
    "casino:sim_auditor": frozenset(
        {"sim.summary", "sim.ledger", "sim.adjustments.read"}
    ),
    "casino:sim_approver": frozenset({"sim.adjustments.approve"}),
    "casino:compliance_officer": frozenset({"kyc.read", "kyc.review"}),
    "casino:security_auditor": frozenset({"audit.read", "auth.read", "flags.read"}),
}
# Superuser-only actions are additionally restricted in their business views.
# These capabilities do NOT bypass two-person approval, TOTP, or PII controls.
PRIVILEGED_CAPABILITIES = frozenset(
    {
        "finance.read",
        "reports.export",
        "sim.ledger",
        "sim.adjustments.approve",
        "auth.write",
        "players.detail",
        "players.status",
        "games.cancel_stale",
        "flags.write",
    }
)


def user_has_capability(user, capability):
    if not user or not user.is_authenticated or not user.is_active or not user.is_staff:
        return False
    if not capability or not isinstance(capability, str):
        return False
    if user.is_superuser:
        return True
    eligible_groups = [
        group_name
        for group_name, grants in ROLE_CAPABILITIES.items()
        if capability in grants
    ]
    return (
        bool(eligible_groups) and user.groups.filter(name__in=eligible_groups).exists()
    )


class BackofficeCapabilityPermission(BasePermission):
    """Fail closed on unknown methods and missing explicit capability declarations."""

    message = "Permission métier back-office insuffisante."

    def has_permission(self, request, view):
        method = "GET" if request.method == "HEAD" else request.method
        capabilities = getattr(view, "capability_by_method", {})
        if method not in capabilities:
            return bool(
                request.user
                and request.user.is_authenticated
                and request.user.is_active
                and request.user.is_staff
                and request.user.is_superuser
            )
        capability = capabilities[method]
        return user_has_capability(request.user, capability)
