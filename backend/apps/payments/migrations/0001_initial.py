import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    operations = [migrations.CreateModel(name="WebhookInboxEvent", fields=[
        ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
        ("provider", models.CharField(choices=[("mvola", "MVola"), ("orange", "Orange Money"), ("airtel", "Airtel Money")], max_length=20)),
        ("event_id", models.CharField(max_length=160)), ("event_type", models.CharField(max_length=80)), ("payload", models.JSONField(default=dict)), ("status", models.CharField(default="received", max_length=20)), ("received_at", models.DateTimeField(auto_now_add=True)), ("processed_at", models.DateTimeField(blank=True, null=True)),
    ], options={"db_table": "payment_webhook_inbox"}), migrations.AddConstraint(model_name="webhookinboxevent", constraint=models.UniqueConstraint(fields=("provider", "event_id"), name="unique_provider_webhook_event"))]
