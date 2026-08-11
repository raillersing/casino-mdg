import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_otp_request_uuid"), ("payments", "0001_initial")]
    operations = [migrations.CreateModel(name="PaymentIntent", fields=[
        ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)), ("provider", models.CharField(choices=[("mvola", "MVola"), ("orange", "Orange Money"), ("airtel", "Airtel Money")], max_length=20)), ("direction", models.CharField(choices=[("deposit", "Dépôt"), ("withdrawal", "Retrait")], max_length=20)), ("amount", models.PositiveBigIntegerField()), ("currency", models.CharField(default="MGA", max_length=3)), ("status", models.CharField(choices=[("pending", "En attente"), ("processing", "Traitement"), ("completed", "Terminée"), ("failed", "Échouée"), ("cancelled", "Annulée")], default="pending", max_length=20)), ("idempotency_key", models.CharField(max_length=160, unique=True)), ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)), ("user", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="payment_intents", to="accounts.user")),
    ], options={"db_table": "payment_intents", "ordering": ["-created_at"]})]
