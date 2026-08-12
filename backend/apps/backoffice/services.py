from .models import AuditEvent, FeatureFlag


def record_audit(actor, action, target, metadata=None):
    return AuditEvent.objects.create(
        actor=actor,
        action=action,
        target_type=target.__class__.__name__,
        target_id=str(target.pk),
        metadata=metadata or {},
    )


def is_feature_enabled(key):
    return (
        FeatureFlag.objects.filter(key=key).values_list("enabled", flat=True).first()
        is not False
    )
