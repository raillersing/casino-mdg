from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("backoffice", "0001_initial"), ("accounts", "0002_otp_request_uuid")]
    operations = [migrations.CreateModel(name="FeatureFlag", fields=[
        ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
        ("key", models.CharField(max_length=80, unique=True)), ("enabled", models.BooleanField(default=True)), ("reason", models.CharField(blank=True, max_length=255)), ("updated_at", models.DateTimeField(auto_now=True)),
        ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="feature_flag_changes", to=settings.AUTH_USER_MODEL)),
    ], options={"db_table": "feature_flags"})]
