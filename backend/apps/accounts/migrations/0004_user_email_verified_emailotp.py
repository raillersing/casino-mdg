import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_alter_user_managers_alter_user_last_login"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="phone_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="EmailOTPChallenge",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(db_index=True, max_length=254)),
                ("phone", models.CharField(blank=True, max_length=20)),
                ("purpose", models.CharField(choices=[("login", "Connexion"), ("bind", "Associer un email")], max_length=10)),
                ("code_hash", models.CharField(max_length=128)),
                ("request_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("expires_at", models.DateTimeField()),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "db_table": "email_otp_challenges",
                "ordering": ["-created_at"],
            },
        ),
    ]
