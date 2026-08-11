from .models import AuditEvent


def record_audit(actor, action, target, metadata=None):
    return AuditEvent.objects.create(actor=actor, action=action, target_type=target.__class__.__name__, target_id=str(target.pk), metadata=metadata or {})
